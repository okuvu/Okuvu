import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { getAgentContextBundle } from '../lib/agent-context.js';
import { getTodayCard } from '../lib/today-card.js';
import { updateCarePlan, type CarePlanBody } from '../lib/care-plan.js';
import { recordAgeAttestation } from '../lib/age-attestation.js';
import { setSummaryAccess, listSessionSharing, setSessionSummaryShare } from '../lib/summary-access.js';
import type { UserConsent, CarePlanId, AssignmentState } from '@okuvu/shared-types';

interface SummaryAccessBody {
  therapist_id: string;
  granted: boolean;
}

interface WelcomeAbbreviationBody {
  display_abbreviation: string;
}

const VALID_CARE_PLANS: CarePlanId[] = ['CP1', 'CP2', 'CP3'];
const VALID_ASSIGNMENT_STATES: AssignmentState[] = ['provisional', 'confirmed'];
const MAX_REASONING_NOTE_LENGTH = 5000;

export async function userRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: UserConsent }>('/users/me/consent', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = request.body;

      if (body.safety_monitoring !== true) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_CONSENT',
            message: 'safety_monitoring must be true',
          },
        });
      }

      if (
        typeof body.mood_inference !== 'boolean' ||
        typeof body.assessment !== 'boolean' ||
        typeof body.emergency_contact !== 'boolean'
      ) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_CONSENT',
            message: 'mood_inference, assessment, and emergency_contact must all be booleans',
          },
        });
      }

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      await prisma.engagementProfile.upsert({
        where: { user_id: user.id },
        create: {
          user_id: user.id,
          consent_1: body.safety_monitoring,
          consent_2: body.mood_inference,
          consent_3: body.assessment,
          consent_4: body.emergency_contact,
        },
        update: {
          consent_1: body.safety_monitoring,
          consent_2: body.mood_inference,
          consent_3: body.assessment,
          consent_4: body.emergency_contact,
        },
      });

      request.log.info(
        { event: 'consent_updated', user_id: user.id, changes: body },
        'Consent preferences updated',
      );

      reply.send({ success: true });
    },
  });

  app.post<{ Body: { adult: boolean } }>('/users/me/age-attestation', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = request.body;

      if (typeof body?.adult !== 'boolean') {
        return reply.status(400).send({
          error: { code: 'INVALID_BODY', message: 'adult (boolean) is required' },
        });
      }

      const result = await recordAgeAttestation(uid, body.adult);

      if (result.status === 'user_not_found') {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      request.log.info(
        { event: 'age_attestation', adult: body.adult, status: result.status },
        'Client answered the 18+ attestation',
      );

      if (result.status === 'declined') {
        // 200, not an error: the client answered, and the answer is recorded.
        // The app reads `accountActive: false` and shows the closing screen.
        return reply.send({ adultConfirmed: false, accountActive: false });
      }

      return reply.send({ adultConfirmed: true, accountActive: true });
    },
  });

  app.get('/users/me/context', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const bundle = await getAgentContextBundle(uid);
      // The 18+ gate is answered inside the bundle, from the row it already
      // loads — one query, and the same predicate the app and console use.
      if (bundle.under_18) {
        return reply.status(403).send({
          error: { code: 'UNDER_18', message: 'Okuvu is for adults 18 and over.' },
        });
      }
      return reply.send(bundle);
    },
  });

  // §D Today-card — pull-based homework + active reminders. Push/scheduler
  // delivery is a separate, out-of-scope-this-pass workstream; this route
  // is what the mobile Home screen polls when the app is open.
  app.get('/users/me/today', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const result = await getTodayCard(uid);

      if (result.status === 'user_not_found') {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      if (result.status === 'under_18') {
        return reply.status(403).send({
          error: { code: 'UNDER_18', message: 'Okuvu is for adults 18 and over.' },
        });
      }

      reply.send(result.card);
    },
  });

  // Decisions doc round, 15 Sep 2026 §1/§4 — "pace = client-only": the
  // client's own write for their chosen preset on one exercise. Never
  // writable by the therapist portal. Always one of slower/standard/faster,
  // clamped to the safe band in application code (mobile's
  // breathing_presets.dart), not stored as raw seconds here.
  app.patch<{ Body: { tool_id: string; pace_preset: string } }>('/users/me/tool-preference', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { tool_id, pace_preset } = request.body ?? {};

      if (typeof tool_id !== 'string' || tool_id.trim().length === 0) {
        return reply.status(400).send({
          error: { code: 'INVALID_BODY', message: 'tool_id is required' },
        });
      }

      if (!['slower', 'standard', 'faster'].includes(pace_preset)) {
        return reply.status(400).send({
          error: { code: 'INVALID_BODY', message: 'pace_preset must be slower, standard, or faster' },
        });
      }

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      await prisma.userToolPreference.upsert({
        where: { user_id_tool_id: { user_id: user.id, tool_id } },
        create: { user_id: user.id, tool_id, pace_preset },
        update: { pace_preset },
      });

      request.log.info(
        { event: 'tool_preference_updated', user_id: user.id, tool_id, pace_preset },
        'Tool pace preference updated',
      );

      reply.send({ success: true });
    },
  });

  // Summary access, decided by the client and nobody else.
  //
  // Until this change the client-facing switch (app: "Chat summaries") wrote
  // the therapist's permission to read the raw conversation; closing that gap
  // was the point. The column now means summaries only, and this route is the
  // one place it is written. Registered on two paths on purpose: installed app
  // builds PATCH /users/me/chat-access, and a server release must not break a
  // phone that has not updated yet. The old path is a forwarding alias, not a
  // second implementation.
  const summaryAccessHandler = async (
    request: FastifyRequest<{ Body: SummaryAccessBody }>,
    reply: FastifyReply,
  ) => {
    const body = request.body;

    if (typeof body?.therapist_id !== 'string' || typeof body?.granted !== 'boolean') {
      return reply.status(400).send({
        error: { code: 'INVALID_BODY', message: 'therapist_id (string) and granted (boolean) are required' },
      });
    }

    const outcome = await setSummaryAccess(request.user.uid, body.therapist_id, body.granted);

    if (outcome.status === 'no_user') {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'User not found' },
      });
    }

    if (outcome.status === 'no_relationship') {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'No such therapist relationship' },
      });
    }

    request.log.info(
      { event: 'summary_access_updated', therapist_id: body.therapist_id, granted: body.granted },
      'Client updated summary_access_granted',
    );

    reply.send({ success: true });
  };

  app.patch<{ Body: SummaryAccessBody }>('/users/me/summary-access', {
    preHandler: [verifyCognitoJWT],
    handler: summaryAccessHandler,
  });

  // Deprecated alias for app builds <= 1.0.22, which still call this path.
  app.patch<{ Body: SummaryAccessBody }>('/users/me/chat-access', {
    preHandler: [verifyCognitoJWT],
    handler: summaryAccessHandler,
  });

  // The client's per-session answers, layered under the switch above. The list
  // deliberately carries no summary text: the client is not shown the
  // therapist's reading of their own session here.
  app.get('/users/me/sessions/sharing', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const outcome = await listSessionSharing(request.user.uid);

      if (outcome.status === 'no_user') {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      reply.send(outcome);
    },
  });

  app.patch<{ Params: { sessionId: string }; Body: { shared?: unknown } }>(
    '/users/me/sessions/:sessionId/summary-share',
    {
      preHandler: [verifyCognitoJWT],
      handler: async (request, reply) => {
        const { shared } = request.body ?? {};

        if (typeof shared !== 'boolean') {
          return reply.status(400).send({
            error: { code: 'INVALID_BODY', message: 'shared (boolean) is required' },
          });
        }

        const outcome = await setSessionSummaryShare(
          request.user.uid,
          request.params.sessionId,
          shared,
        );

        if (outcome.status === 'no_user') {
          return reply.status(401).send({
            error: { code: 'UNAUTHORIZED', message: 'User not found' },
          });
        }

        // A session that is not the caller's answers exactly like one that does
        // not exist — a 403 here would confirm other people's session ids.
        if (outcome.status === 'not_found') {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message: 'No summary for that session' },
          });
        }

        request.log.info(
          {
            event: 'session_summary_share_updated',
            session_id: request.params.sessionId,
            shared,
          },
          'Client set per-session summary sharing',
        );

        reply.send({ success: true, shared: outcome.shared });
      },
    },
  );

  // Client-side homework completion has no route here any more.
  //
  // `POST /users/me/homework/:id/complete` let the app close any assignment on
  // the client's tap, which cannot be told apart from a claim the client did
  // not do — the clinical authority removed it (23 Nov 2026). What closes an
  // assignment now:
  //   • an exercise — its player reaching the end, via
  //     `POST /users/me/homework/practice-complete` (routes/homework.ts);
  //   • a worksheet — the worksheet being saved (routes/worksheets.ts);
  //   • homework the therapist typed in their own words — the therapist, from
  //     the portal's homework page (`homework.markCompleted`), because the app
  //     has no way to observe that kind of work.
  // Old installed builds still calling the removed route get a 404 and show
  // their retry message; that is the intended failure, not a regression.

  app.patch<{ Params: { id: string }; Body: CarePlanBody }>('/users/:id/care-plan', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { id } = request.params;
      const body = request.body;

      if (!VALID_CARE_PLANS.includes(body.care_plan_id)) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_CARE_PLAN_ID',
            message: 'care_plan_id must be one of CP1, CP2, CP3',
          },
        });
      }

      if (!VALID_ASSIGNMENT_STATES.includes(body.assignment_state)) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_ASSIGNMENT_STATE',
            message: 'assignment_state must be one of provisional, confirmed',
          },
        });
      }

      if (
        typeof body.confidence_at_last_eval !== 'number' ||
        Number.isNaN(body.confidence_at_last_eval) ||
        body.confidence_at_last_eval < 0 ||
        body.confidence_at_last_eval > 1
      ) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_CONFIDENCE',
            message: 'confidence_at_last_eval must be a number between 0 and 1',
          },
        });
      }

      if (
        typeof body.turns_evaluated !== 'number' ||
        !Number.isInteger(body.turns_evaluated) ||
        body.turns_evaluated < 0
      ) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_TURNS_EVALUATED',
            message: 'turns_evaluated must be a non-negative integer',
          },
        });
      }

      if (
        body.reasoning_note !== undefined &&
        (typeof body.reasoning_note !== 'string' || body.reasoning_note.length > MAX_REASONING_NOTE_LENGTH)
      ) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_REASONING_NOTE',
            message: `reasoning_note must be a string of at most ${MAX_REASONING_NOTE_LENGTH} characters`,
          },
        });
      }

      const result = await updateCarePlan(uid, id, body, request.log);

      switch (result.status) {
        case 'user_not_found':
          return reply.status(401).send({
            error: { code: 'UNAUTHORIZED', message: 'User not found' },
          });
        case 'forbidden':
          return reply.status(403).send({
            error: {
              code: 'FORBIDDEN',
              message: 'Cannot update another user\'s care plan',
            },
          });
        case 'stale_turns_evaluated':
          return reply.status(400).send({
            error: {
              code: 'STALE_TURNS_EVALUATED',
              message: `turns_evaluated (${body.turns_evaluated}) is lower than current stored value (${result.current})`,
            },
          });
        case 'ok':
          return reply.send({
            success: true,
            care_plan_id: result.carePlanId,
            assignment_state: result.assignmentState,
          });
      }
    },
  });

  // Therapist-portal wireframes C-04/C-06 — the mobile app's new welcome
  // screen (first run, right after OTP verification for a wizard-invited
  // client) reads the therapist's welcome note here, and the client's
  // editable display_abbreviation. Both live on ClinicalConfig.
  app.get('/users/me/welcome', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { clinical_config: { select: { welcome_note: true, display_abbreviation: true } } },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      reply.send({
        welcomeNote: user.clinical_config?.welcome_note ?? null,
        displayAbbreviation: user.clinical_config?.display_abbreviation ?? null,
      });
    },
  });

  // Client edits the abbreviation "at first run" per the wireframe — the
  // one and only client-facing write to ClinicalConfig; every other field
  // on it is therapist/portal/worker-authored.
  app.patch<{ Body: WelcomeAbbreviationBody }>('/users/me/welcome', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = request.body;

      if (typeof body?.display_abbreviation !== 'string' || body.display_abbreviation.trim().length === 0) {
        return reply.status(400).send({
          error: { code: 'INVALID_BODY', message: 'display_abbreviation must be a non-empty string' },
        });
      }

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true, clinical_config: { select: { id: true } } },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }
      if (!user.clinical_config) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'No care plan assigned yet' },
        });
      }

      await prisma.clinicalConfig.update({
        where: { user_id: user.id },
        data: { display_abbreviation: body.display_abbreviation.trim() },
      });

      reply.send({ success: true });
    },
  });
}
