import { FastifyInstance } from 'fastify';

// Route handlers
import { verifyCognitoJWT } from '../middleware/auth.js';
import { recordMoodCheckin, getMoodHistory } from '../lib/progress.js';
import { checkClientText } from '../lib/safety-check.js';
import { flagSafetyEvent } from '../lib/safety-flags.js';
import { enqueueSafetyRecheck } from '../lib/safety-recheck.js';
import {
  FEELING_OTHER_MAX,
  MAX_FEELING_WORDS,
  MOOD_MIN,
  MOOD_MAX,
  STRENGTH_MAX,
  STRENGTH_MIN,
  WEEKLY_SUMMARY_DAYS,
  isFeelingWord,
  weeklyMoodSummary,
} from '@okuvu/shared-types/mood';

const DAYS_DEFAULT = 14;
const DAYS_MIN = 1;
const DAYS_MAX = 365;

interface MoodCheckinBody {
  mood_value: number;
  /**
   * The two screens added after the check-in. Optional so an older app build
   * keeps working: it sends only mood_value.
   */
  trigger?: string | null;
  intensity_0_10?: number | null;
  /** Up to three words from the fixed vocabulary. */
  feeling_words?: string[] | null;
  /** The "Something else" text. Client-typed, so it is screened below. */
  feeling_other?: string | null;
  /** The strength slider, 1-5. Optional: the step can be left alone. */
  strength_1_5?: number | null;
}

const TRIGGER_MAX = 500;
const INTENSITY_MIN = 0;
const INTENSITY_MAX = 10;

interface MoodQuery {
  days?: string;
}

export async function progressRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: MoodCheckinBody }>('/progress/mood/checkin', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = request.body ?? ({} as MoodCheckinBody);
      const { mood_value, trigger, intensity_0_10, feeling_words, feeling_other, strength_1_5 } = body;

      if (
        typeof mood_value !== 'number' ||
        !Number.isInteger(mood_value) ||
        mood_value < MOOD_MIN ||
        mood_value > MOOD_MAX
      ) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_MOOD_VALUE',
            message: `mood_value must be an integer between ${MOOD_MIN} and ${MOOD_MAX}`,
          },
        });
      }

      if (trigger !== undefined && trigger !== null) {
        if (typeof trigger !== 'string' || trigger.length > TRIGGER_MAX) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_TRIGGER',
              message: `trigger must be text of at most ${TRIGGER_MAX} characters`,
            },
          });
        }
      }

      if (intensity_0_10 !== undefined && intensity_0_10 !== null) {
        if (
          typeof intensity_0_10 !== 'number' ||
          !Number.isInteger(intensity_0_10) ||
          intensity_0_10 < INTENSITY_MIN ||
          intensity_0_10 > INTENSITY_MAX
        ) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_INTENSITY',
              message: `intensity_0_10 must be an integer between ${INTENSITY_MIN} and ${INTENSITY_MAX}`,
            },
          });
        }
      }

      // The words a chip can send are the fixed vocabulary and nothing else.
      // Free text has its own field (`feeling_other`) so it can be screened;
      // allowing a made-up word into this array would put unscreened text in a
      // column nothing checks.
      if (feeling_words !== undefined && feeling_words !== null) {
        if (
          !Array.isArray(feeling_words) ||
          feeling_words.length > MAX_FEELING_WORDS ||
          feeling_words.some((word) => !isFeelingWord(word))
        ) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_FEELING_WORDS',
              message: `feeling_words must be up to ${MAX_FEELING_WORDS} words from the check-in's list`,
            },
          });
        }
      }

      if (feeling_other !== undefined && feeling_other !== null) {
        if (typeof feeling_other !== 'string' || feeling_other.length > FEELING_OTHER_MAX) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_FEELING_OTHER',
              message: `feeling_other must be text of at most ${FEELING_OTHER_MAX} characters`,
            },
          });
        }
      }

      if (strength_1_5 !== undefined && strength_1_5 !== null) {
        if (
          typeof strength_1_5 !== 'number' ||
          !Number.isInteger(strength_1_5) ||
          strength_1_5 < STRENGTH_MIN ||
          strength_1_5 > STRENGTH_MAX
        ) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_STRENGTH',
              message: `strength_1_5 must be an integer between ${STRENGTH_MIN} and ${STRENGTH_MAX}`,
            },
          });
        }
      }

      const other = typeof feeling_other === 'string' ? feeling_other.trim() : '';

      // ─── The one client-typed field on this screen ─────────────────────
      //
      // The chips are a fixed vocabulary, so "Something else" is the only free
      // text a check-in can carry. It runs the same check the journal runs,
      // BEFORE the write, because the answer decides what the client is shown.
      // The check-in is saved either way.
      //
      // Choosing "hopeless" or "numb" is NOT this path: those are chips, the app
      // shows a gentle card, and no flag is written and no alert is sent.
      const safety = other.length > 0 ? await checkClientText(other) : null;

      const result = await recordMoodCheckin(uid, mood_value, request.log, {
        trigger: typeof trigger === 'string' ? trigger.trim() || null : undefined,
        intensity: typeof intensity_0_10 === 'number' ? intensity_0_10 : undefined,
        feelingWords: Array.isArray(feeling_words) ? feeling_words : undefined,
        feelingOther: typeof feeling_other === 'string' ? other || null : undefined,
        strength: typeof strength_1_5 === 'number' ? strength_1_5 : undefined,
      });

      if (result.status === 'user_not_found') {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      if (safety?.flagged) {
        // Same behaviour as chat and the journal: the flag carries the row it
        // came from and no text, and the therapist gets the content-free alert.
        await flagSafetyEvent({
          userId: result.userId,
          level: safety.level,
          source: 'mood_log',
          subjectKind: 'mood_log',
          subjectId: result.id,
        });
      } else if (safety?.recheck) {
        // The check could not run: moderate concern, not a crisis. No flag, no
        // alert, and the row is screened again once the classifier answers.
        await enqueueSafetyRecheck({
          userId: result.userId,
          surface: 'mood_log',
          subjectId: result.id,
        });
      }

      reply.send({
        success: true,
        date: result.dateIst,
        mood_value,
        id: result.id,
        shared: false,
        shareLabel: 'Private',
        safety: safety
          ? { showHelp: safety.showHelp, helpOffer: safety.helpOffer }
          : { showHelp: false, helpOffer: false },
      });
    },
  });

  app.get<{ Querystring: MoodQuery }>('/progress/mood', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const daysParam = request.query.days;
      let days = DAYS_DEFAULT;

      if (daysParam !== undefined) {
        days = parseInt(daysParam, 10);
        if (isNaN(days) || !Number.isInteger(days) || days < DAYS_MIN || days > DAYS_MAX) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_DAYS',
              message: `days must be an integer between ${DAYS_MIN} and ${DAYS_MAX}`,
            },
          });
        }
      }

      const result = await getMoodHistory(uid, days);

      if (result.status === 'user_not_found') {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      reply.send({ entries: result.entries });
    },
  });

  /**
   * The week, written back in words.
   *
   * The owner's instruction: in words, for the client, no score. So this sends
   * their own days and plain sentences, and nothing that could be read as a
   * result — no average, no level, no band, no chart series. A client who has
   * checked in on none of the last seven days gets a sentence saying so, not an
   * empty screen.
   */
  app.get('/progress/mood/week', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const result = await getMoodHistory(uid, WEEKLY_SUMMARY_DAYS);

      if (result.status === 'user_not_found') {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      // getMoodHistory returns the stored rows; the summary shapes them. The
      // mapping keeps the api's own field names out of the client contract.
      // A row whose value falls outside 1-5 has no face and therefore no word,
      // so it is dropped at the boundary rather than given an invented label.
      const entries = result.entries
        .filter((e): e is typeof e & { moodLabel: string } => typeof e.moodLabel === 'string')
        .map((e) => ({
          id: e.id,
          date: e.date,
          moodValue: e.mood_value,
          moodLabel: e.moodLabel,
          feelingWords: e.feeling_words,
          feelingOther: e.feeling_other,
          strength: e.strength_1_5,
          shared: e.shared,
        }));

      reply.send(weeklyMoodSummary(entries));
    },
  });
}
