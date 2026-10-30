// ─── Block-response contract (OKUVU — Plumbing Fixes & Rationale v1.0, A3) ──
//
// Every static substitute that can reach a user (A9-pre 'blocked' mode,
// A9-post BLOCKED substitution, A9-post S2 failover, A2 degraded) is
// governed by this contract. A substitute must:
//
//   1. Hold the thread — reference that we're still in the conversation
//      together, never restart it ("It looks like you're ready to start a
//      new conversation…" is the canonical failure this forbids).
//   2. Be warm and non-clinical — no therapy-speak, no "take a step back"
//      micro-technique, no instruction to breathe/ground (that's A2's job
//      when it's actually running, not the block path's).
//   3. Ask nothing diagnostic — at most one gentle, open invitation; the
//      user never owes the block path an explanation.
//   4. Never explain the governance machinery — no mention of topics,
//      rules, or what was rejected.
//   5. Be identical for the same (fallback, safety-state) pair — the
//      substitute is a deterministic, reviewable artifact, not generated
//      prose. Each string here is a governed constant; changing copy is a
//      review event, not an edit.
//
// NOTE (A3 sign-off): this copy implements the contract mechanically and is
// written to it, but final clinical sign-off on the words belongs to the
// SME/clinical owner — same open item the doc records for the crisis path's
// no-script gap. The wiring (which path serves which constant) is done and
// tested; the words are reviewable in exactly one place: this file.

// A9-pre (governance) rejected the message but A1 did not find crisis-level
// risk — the router's 'blocked' mode (a8-router.ts). Distinct from the crisis
// path: this always gets a real, persisted, non-alarming reply, never silence.
//
// A3: the old copy ("Let's take a step back — …") smuggled in a
// micro-technique and read as a clinical reset. New copy: holds the thread,
// no technique, no explanation of what was blocked.
export const A9_PRE_BLOCKED_RESPONSE =
  "I'm still here with you. " +
  "I can't go down that road with you, but I don't want to lose what we were talking about either — " +
  "tell me what's on your mind, in your own words."

// A9-post degraded (reviewer unavailable, non-S2): warm presence, one open
// door, nothing diagnostic.
export const A9_POST_DEGRADED_RESPONSE =
  "I'm here with you. " +
  "I lost my footing for a moment there — I'm still listening, whenever you're ready."

// A9-post S2 failover (reviewer unavailable at elevated risk): fail-closed,
// so the substitute leans steadier and asks even less.
export const A9_POST_S2_FALLBACK =
  "I'm right here with you, and I'm not going anywhere. " +
  "Take this at your own pace — I'm listening."

// A2 itself failed (timeout/api error): the turn never reached the model,
// so there is nothing to preserve except the fact that we're here.
export const A2_DEGRADED_RESPONSE =
  "I'm here, and I'm listening. " +
  "Something glitched on my end just now — say that again whenever you're ready."

// E17-S6 — served when a turn is refused because the session's token budget or
// the user's daily cost budget is exhausted (lib/token-budget.ts). It is a
// governed substitute like every constant above, and it is held to the same
// contract: it holds the thread, explains nothing about machinery, asks nothing
// diagnostic, and it names the helplines because the one case it must never
// fail is a user in distress arriving on a turn we cannot serve. It is
// deliberately not an apology or an error string — "TURN_FAILED" reaching a
// client mid-conversation is exactly what this replaces.
export const BUDGET_PAUSED_RESPONSE =
  "I'm still here with you. " +
  "We've reached the end of what I can do in this conversation for now, so I have to pause here — " +
  "it's not something you said, and it isn't about how you're doing. " +
  "If things feel like too much in the meantime, please reach out to iCall on 9152987821 or " +
  "the Vandrevala Foundation on 1860-2662-345, any time. " +
  "I'll be ready to pick this up with you again soon."

// ─── E17-S4 — the two paths a technical failure must land on ────────────────
//
// The pipeline can lose its model in two different places, and until now both
// collapsed into the same generic supportive sentence ("I'm here to support
// you. Could you tell me more about how you're feeling?" — `SAFE_FALLBACK` in
// lib/canned-response.ts). E17-S1 §7 and E17-S2 §465 logged that as the gap
// this story closes: the user could not tell a served turn from an unserved
// one, and a crisis disclosure that arrived while the classifier was down was
// answered with chat.
//
// Both constants below are held to the same block-response contract as every
// other substitute in this file (hold the thread, no machinery talk, no
// micro-technique, ask nothing diagnostic), and both name the approved
// helplines, because the one case a degraded turn must never fail is a user in
// distress arriving on a turn we cannot fully serve. Clinical sign-off on the
// words is the same open item noted above and at CRISIS_RESPONSE.

// A1 could not classify AND the deterministic screen found no crisis phrasing.
// We are therefore about to answer a turn whose risk we never assessed. The
// only honest answer is a static one: no model prose, no therapy, and a door
// held open. Skipping A2 entirely is the point — an ungated model reply is the
// fail-open outcome this constant exists to prevent.
export const SAFETY_UNAVAILABLE_RESPONSE =
  "I'm still here with you. " +
  "I can't check in on how you're doing the way I usually do right now, and I'd rather say that " +
  "plainly than answer you without knowing. " +
  "If things are feeling like too much in the meantime, please reach out to iCall on 9152987821 " +
  "or the Vandrevala Foundation on 1860-2662-345, any time. " +
  "I'm not going anywhere."

// A1 classified the turn fine, but the model that writes the reply is
// unreachable (throttled, timed out, or erroring). The safety decision was
// made; only the reply is missing, so this copy does not re-open the safety
// question — it stops short of pretending to have answered.
export const MODEL_UNAVAILABLE_RESPONSE =
  "I'm here with you, and I'm listening. " +
  "Something on my side isn't working properly just now, so I don't want to answer you with " +
  "words I can't stand behind. " +
  "If it's feeling heavy in the meantime, iCall on 9152987821 or the Vandrevala Foundation on " +
  "1860-2662-345 are there any time. " +
  "Say it again whenever you're ready — I'll still be here."


// ─── E17-S9 — medical emergency: the ambulance, not the crisis card ────────
//
// Measured before written (evidence/E17-S5-orch-correction.md): four of the
// five gold-set medical emergencies classify S1/S2 and reach A2 as ordinary
// chat, where the reply was "the crisis support in the app has people who can
// actually help right now" — a mental-health card offered to someone describing
// a heart attack. The fifth reached the S4 crisis card for the same reason.
//
// These two constants are what the pipeline serves instead, deterministically:
// `agents/a1/medical-emergency-keywords.ts` is the screen, `a8-router.ts` is the
// decision, and neither A2 nor A9-post writes a word of the reply — so the
// first sentence is a property of this file, not of a model's compliance. That
// is what makes "112 in the first sentence" true at 100% rather than usually.
//
// Written to the block-response contract at the top of this file (hold the
// thread, no machinery talk, no micro-technique) and to the clinical rules for
// this story: no diagnosis, no dosing, no first-aid procedure, no claim of
// clinical review, and the mental-health helplines never displace the
// ambulance. 112 is India's single emergency number (police, fire, ambulance),
// and it is the number the crisis path already lists as "Emergency Services".
//
// CLINICAL SIGN-OFF (E17-S7): both strings are new clinical content and must be
// reviewed by the clinical authority before this ships to real users. They are
// deliberately kept here, and only here, so the words can be read and edited in
// one place; the evidence file (evidence/E17-S9.md §3) reproduces them verbatim
// for that review.

// The ordinary case: a physical emergency, nothing said about self-harm.
export const MEDICAL_EMERGENCY_RESPONSE =
  "Please call 112 for emergency medical help right now — that is the ambulance and emergency number in India, " +
  "and they can send help to you. " +
  "What you've described is a medical emergency, so please don't wait for me on this one: make the call first, " +
  "and put it on speaker if you can. " +
  "I'm here, and I'll stay with you while you do."

// The overlap case: the message is a physical emergency AND A1 still returned
// S4 (or flagged crisis language) on it. A2 does not see this turn either, but
// the crisis resources must not be dropped just because the message is also a
// medical one — 112 leads, the helplines follow, nothing is withdrawn.
export const MEDICAL_EMERGENCY_CRISIS_RESPONSE =
  "Please call 112 for emergency medical help right now — that is the ambulance and emergency number in India, " +
  "and they can send help to you. " +
  "I can also hear that there is more than the physical side to this, and I don't want you to carry that alone: " +
  "once you've called, please reach out to iCall on 9152987821 or the Vandrevala Foundation on 1860-2662-345. " +
  "I'm here, and I'll stay with you."

// Deterministic substitute selector. `safetyState` is the A1 state this turn
// was classified at (the orchestrator passes what it has; block paths pass
// the same state they were gated on).
export function getSafeFallback(safetyState: string): string {
  return safetyState === 'S2' ? A9_POST_S2_FALLBACK : A9_POST_DEGRADED_RESPONSE
}

/**
 * E17-S4 — what the user gets when A1 made its decision but the model that
 * writes the reply did not answer. At S2 (elevated risk) the steadier
 * `A9_POST_S2_FALLBACK` still wins: an elevated-risk turn whose reply failed
 * should ask even less of the user, not more.
 */
export function getModelUnavailableFallback(safetyState: string): string {
  return safetyState === 'S2' ? A9_POST_S2_FALLBACK : MODEL_UNAVAILABLE_RESPONSE
}

// OKUVU v2.0 / E17-S10: A1 classified this turn S3 (elevated risk —
// hopelessness, worthlessness, or escape themes, without a stated plan or
// method). This is the router's 'deterministic-grounding' agent
// (a8-router.ts) — the same tier of clinical determinism as crisis (S4), one
// step down: A2 is skipped entirely, but this always gets a real, persisted,
// grounding-oriented reply, never silence. Unlike the block path, this one IS
// allowed to offer a body-first exercise (that's its entire purpose); it's
// held to the rest of the contract (warm, thread-holding, no machinery talk).
//
// E17-S10 — this copy now carries the approved helplines, because S3 is not a
// safe place to withhold them. The model under-reads explicit intent often
// enough that csh-10 ("the breathing isn't helping. I want to die.") was
// answered by the previous one-sentence breathing prompt, and the turns this
// card serves include third-party risk ("my friend has been talking about
// killing herself") and passive ideation — the cases the keyword floor
// deliberately does not claim, because the crisis card is written in the
// second person and would be the wrong instruction for someone else's risk.
// So the grounding reply keeps the breathing invitation but never as the whole
// answer: it names the heaviness, offers the exercise, and puts a crisis line
// in the same message, with the explicit statement that a call does not
// require being in immediate danger, and 112 if they might act.
//
// Two-part provenance, same as CRISIS_RESPONSE below: the surrounding language
// is a first pass and should get a clinical/RCI sign-off before it reaches real
// users in production; the resource list itself is the pre-existing approved
// set (iCall 9152987821, Vandrevala Foundation 1860-2662-345, Emergency 112),
// already used by CRISIS_RESPONSE and the mobile app's CrisisOverlay — no new
// helpline number is introduced here.
export const A8_S3_GROUNDING_RESPONSE = `It sounds like things feel really heavy right now, and I don't want you to sit with that on your own. Let's slow down together — if you can, take a breath with me and tell me what's around you right now.

And because this sounds like more than anyone should have to carry alone, please keep a crisis line close by: iCall on 9152987821, or the Vandrevala Foundation on 1860-2662-345. They answer day and night, and you don't need to be in immediate danger to call. If you ever feel you might act on these thoughts, call 112 or go to the nearest emergency department.

I'm here with you.`;

// OKUVU v2.0 / audit fix: A1 classified this turn S4 (crisis) — the router's
// 'crisis' agent (a8-router.ts). Previously this path persisted only the
// user's own turn and the client received a bare CRISIS_SIGNAL frame with no
// message — the "no approved crisis-response script" gap tracked in
// okuvu-remaining-changes.md and docs/architecture.md. This closes that gap
// using the exact approved helpline set already referenced by A9-post's
// system prompt (docs/okuvu-v2.0/system-prompts/04-A9-Post-Content-Reviewer-
// v2.0.md §2.1) and already hardcoded in the mobile app's CrisisOverlay
// (apps/mobile/lib/src/features/crisis/crisis_overlay.dart) — no new
// helpline numbers are introduced here, only the surrounding language is
// new. That surrounding language is a first pass and should get a clinical/
// RCI sign-off before it reaches real users in production; the resource
// list itself is the pre-existing approved set, not new clinical content.
export const CRISIS_RESPONSE =
  "I'm really glad you told me. What you're carrying right now sounds like too much to hold alone, " +
  "and I don't want you to be on your own with it. " +
  "Please reach out to one of these right now — they're ready to talk with you:\n\n" +
  "iCall: 9152987821\n" +
  "Vandrevala Foundation: 1860-2662-345\n" +
  "NIMHANS: 080-46110007\n" +
  "Snehi: 044-24640050\n" +
  "Emergency Services: 112\n\n" +
  "I'll be here when you're ready to come back."
