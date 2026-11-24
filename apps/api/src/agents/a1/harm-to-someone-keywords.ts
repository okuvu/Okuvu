/**
 * The chat screen for "I want to hurt someone".
 *
 * Until 24 November 2026 this disclosure had a screen only on a worksheet
 * answer. Typed into chat it reached the governance line ("that's something I
 * can't help with here") or an ordinary A2 reply, and the owner ruled that the
 * same person must get the same screen wherever they say it.
 *
 * WHAT THIS IS NOT. It is not a classifier and it does not decide that someone
 * is dangerous. It decides which of the two approved screens the turn gets, and
 * whether it gets one at all. The distinction it has to make is the one the
 * owner wrote down as four cases:
 *
 *   1. clear intent       — "I want to hurt my brother", "I'm scared I'll hit her"
 *   2. everyday exaggeration — "I'll kill my brother lol", "my boss is going to
 *                            die today"
 *   3. frightening unwanted thoughts, no intent — "I keep having thoughts of
 *                            stabbing my baby and it terrifies me"
 *   4. self-harm and harm to others in one message — the crisis card wins
 *
 * Case 4 is not decided here. `hasCrisisLanguage` is the shared floor and the
 * router checks S4 before this screen; this function also returns null whenever
 * the crisis floor matches, so a message carrying both can never be pulled off
 * the crisis card by anything in this file.
 *
 * WHY THE HYPERBOLE RULE IS NARROW. A screen that fires on "I'll kill him lol"
 * teaches clients that the app panics, and a therapist alert for a joke is how
 * a real alert gets ignored. But a joke marker must never suppress fear: "I'm
 * scared I'll hit her lol" is still a frightened person, so laughter only
 * suppresses when there is no fear marker and no thought framing in the same
 * message.
 *
 * WHY THOUGHTS ARE A SEPARATE CASE. Someone frightened by an intrusive image of
 * harming their baby is not in the same place as someone describing an intent
 * to harm. The owner asked for gentler wording and no 112 instruction for that
 * disclosure, while keeping the therapist alert urgent. The two screen objects
 * live in `lib/harm-to-someone.ts`; this module only chooses between them.
 */

import { hasCrisisLanguage } from './crisis-keywords.js';

/** Which approved screen the turn gets. */
export type HarmToSomeoneCase = 'intent' | 'frightening_thought';

const HARM_VERBS =
  'hurt|hurting|harm|harming|kill|killing|murder|murdering|stab|stabbing|' +
  'strangle|strangling|choke|choking|beat|beating|hit|hitting|punch|punching|' +
  'shoot|shooting|poison|poisoning|attack|attacking';

const TARGETS =
  'him|her|them|someone|somebody|people|everyone|' +
  'my (?:mum|mom|mother|dad|father|wife|husband|partner|boyfriend|girlfriend|' +
  'brother|sister|son|daughter|baby|child|kid|boss|friend|neighbour|neighbor|' +
  'flatmate|roommate|family|parents|coworker|colleague)|' +
  'a (?:person|man|woman|child|kid|baby|stranger)';

/**
 * Clear intent. Every pattern is first-person and names a harm verb: a
 * prediction about someone else ("he's going to die") is not in this list on
 * purpose, because that sentence is also how people describe a hospital stay or
 * a boss's bad day.
 */
const INTENT_PATTERNS: RegExp[] = [
  // "I want to hurt my brother", "I wanna kill him", "I need to hit someone"
  new RegExp(`\\bi (?:really )?(?:want|wanna|need|have|would like) to (?:${HARM_VERBS})\\b`),
  // "I'm scared I'll hit her", "I'm afraid I might hurt the baby"
  new RegExp(
    `\\bi(?:['’]m| am) (?:scared|afraid|frightened|worried|terrified) (?:that )?` +
      `i(?:['’]ll| will| might| may| could| would) (?:${HARM_VERBS})\\b`,
  ),
  // "I might hurt him", "I'll kill her", "I'm going to hit him"
  new RegExp(
    `\\bi(?:['’]ll| will| might| may| could| would| am going to|['’]m going to| gonna) ` +
      `(?:${HARM_VERBS}) (?:${TARGETS})\\b`,
  ),
  // "I feel like hurting someone", "I felt like hitting him"
  new RegExp(`\\bi (?:feel|felt) like (?:${HARM_VERBS}) (?:${TARGETS})\\b`),
  // "the urge to hurt him is strong", "I'm tempted to hit her"
  new RegExp(`\\b(?:urge|urges|tempted|temptation) to (?:${HARM_VERBS})\\b`),
  // Planning language, which is intent even when it is not a want.
  new RegExp(
    `\\bi(?:['’]ve| have) (?:thought about|been thinking about|planned|considered|looked up how to) ` +
      `(?:${HARM_VERBS})\\b`,
  ),
  // "I think about hurting my brother" — plain, with no fear framing. Routed to
  // the fuller screen rather than the gentle one, because the safe direction is
  // to say more, not less, to someone describing this without distress at it.
  new RegExp(`\\bi (?:think|dream) about (?:${HARM_VERBS}) (?:${TARGETS})\\b`),
];

/** Framing that marks a thought as unwanted rather than intended. */
const THOUGHT_PATTERNS: RegExp[] = [
  // "intrusive thoughts about stabbing", "unwanted thoughts of hurting"
  new RegExp(
    `\\b(?:intrusive|unwanted|horrible|terrifying|disturbing|awful|upsetting) ` +
      `(?:thoughts?|images?|pictures?)\\b[^.!?\\n]{0,60}\\b(?:${HARM_VERBS})\\b`,
  ),
  // "thoughts of hurting someone", "images of me stabbing the baby"
  new RegExp(
    `\\b(?:thoughts?|images?|pictures?) (?:of|about) (?:me )?(?:${HARM_VERBS})\\b(?: ${TARGETS})?`,
  ),
  // "I keep having thoughts of hurting my baby"
  new RegExp(
    `\\bi keep (?:having|getting) (?:thoughts?|images?|pictures?) ` +
      `(?:of|about) (?:${HARM_VERBS})\\b`,
  ),
];

/**
 * Distress markers that keep a thought in the gentle case even when it is
 * phrased as a thought the person is frightened by. Without one of these, a
 * thought-shaped sentence is treated as intent.
 */
const FEAR_MARKERS: RegExp =
  /\b(?:terrifies?|terrified|terrifying|scares?|scared|frightens?|frightened|disgusts?|disgusted|appals?|appalled|horrified|hate (?:that|it|myself for)|would never|don['’]?t want to|do not want to|not like this|makes me sick)\b/;

/** Laughter and joke markers, which suppress a hyperbolic match and nothing else. */
const HYPERBOLE_MARKERS: RegExp =
  /\b(?:lol|lmao|lmfao|haha|hahaha|hehe|jk|joking|kidding|just kidding|obviously joking|😂|🤣|😅)\b/;

const THOUGHT_NOUN: RegExp = /\b(?:thoughts?|images?|pictures?|intrusive|unwanted)\b/;

/**
 * Which screen the message gets, or null for none.
 *
 * Returns null when the crisis floor matches, so case 4 always lands on the
 * crisis card whichever way the router is ordered.
 */
export function screenHarmToSomeone(message: string | null | undefined): HarmToSomeoneCase | null {
  if (typeof message !== 'string') return null;
  const text = message.trim();
  if (text.length === 0) return null;
  if (hasCrisisLanguage(text)) return null;

  const lower = text.toLowerCase();

  const intent = INTENT_PATTERNS.some((re) => re.test(lower));
  const thought = THOUGHT_PATTERNS.some((re) => re.test(lower));

  if (!intent && !thought) return null;

  const fear = FEAR_MARKERS.test(lower);
  const joke = HYPERBOLE_MARKERS.test(lower);

  // A joke only suppresses the hyperbolic case. Fear framing, or a thought
  // noun, keeps the screen even when the message is laughing — "I'm scared
  // I'll hit her lol" is a frightened person typing nervously, not a joke.
  if (joke && !fear && !THOUGHT_NOUN.test(lower)) return null;

  if (thought && !intent) return 'frightening_thought';
  // Thought framing with a fear marker stays gentle even if an intent-shaped
  // phrase also matched ("I'm scared I'll do it" inside a thought description).
  if (thought && intent && fear && !/\bi (?:want|wanna|need) to\b/.test(lower)) {
    return 'frightening_thought';
  }
  return 'intent';
}
