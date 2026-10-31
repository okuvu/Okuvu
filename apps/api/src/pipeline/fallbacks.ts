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

// ─── E17-S7 — the approved helpline list (signed 31 October 2026) ──────────
//
// Dr Shubhangi Goswami's signed sign-off of 31 Oct 2026
// (evidence/shubhangi-signoff/, docx sha256 af36ceb9…) corrects the helpline
// list and fixes its order: Tele-MANAS first, because iCall is not a 24×7
// service and must not be the first choice in a crisis; iCall last with its
// hours stated; NIMHANS dropped from the approved set; and the old Vandrevala
// number (1860-2662-345) removed everywhere. Her condition is explicit: this
// list, in this order, replaces the old one in every fixed reply in this file,
// in the A9-post reviewer's approved-number list, and in the app's crisis
// screen.
//
// It is one constant rather than seven copies, because the same list written
// out seven times is the drift that ends with two numbers disagreeing about
// which one is correct. The rendered text of the S3 and S4 replies is pinned
// paragraph-for-paragraph by __tests__/approved-copy.test.ts against the
// paragraphs of her signed document, so editing a word here fails a test
// instead of silently re-opening a signed string.
export const HELPLINE_INLINE =
  "Tele-MANAS: 14416 (24×7) Vandrevala Foundation: +91 9999666555 Sneha, Chennai: 044-24640050 " +
  "iCall (TISS): 9152987821 — Mon–Sat, 8 am–9 pm";

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
  "If things feel like too much in the meantime, please reach one of these: " +
  HELPLINE_INLINE + ". " +
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
  "If things are feeling like too much in the meantime, please reach one of these: " +
  HELPLINE_INLINE + ". " +
  "I'm not going anywhere."

// A1 classified the turn fine, but the model that writes the reply is
// unreachable (throttled, timed out, or erroring). The safety decision was
// made; only the reply is missing, so this copy does not re-open the safety
// question — it stops short of pretending to have answered.
export const MODEL_UNAVAILABLE_RESPONSE =
  "I'm here with you, and I'm listening. " +
  "Something on my side isn't working properly just now, so I don't want to answer you with " +
  "words I can't stand behind. " +
  "If it's feeling heavy in the meantime, please reach one of these: " +
  HELPLINE_INLINE + ". " +
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
  "once you've called, please reach one of these: " +
  HELPLINE_INLINE + ". " +
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
// E17-S10 added the helplines here, because S3 is not a safe place to withhold
// them: the turns this card serves include passive ideation and third-party
// risk, the cases the keyword floor deliberately does not claim.
//
// The copy below is the clinical lead's own text, SIGNED 31 October 2026
// (E17-S7 row 1) and pinned paragraph-for-paragraph by
// __tests__/approved-copy.test.ts against her signed document. It replaces both
// the pack's §3.2 text and its §3.5 variant. What she changed, and why:
//   • "the only support you have" now names the app — an unmonitored tool must
//     not read as a companion;
//   • "please call a crisis line" became "please reach a person", because the
//     instruction is to reach a human, not to complete a task;
//   • the breath invitation stays, and "you can keep writing here as well" was
//     added so the reply does not read as a hand-off out of the app;
//   • removed: "I'm not going anywhere", "if one is closed or busy, call the
//     other", the clause addressed to someone asking about another person, and
//     the "if anyone is in immediate danger, call 112" sentence. The S3 card
//     therefore names no emergency number, while both medical cards still lead
//     with 112 — that asymmetry is hers, not an omission here.
// Any later edit to this text voids her sign-off for the edited text (§7.2 of
// the sign-off); it goes back to her before it changes.
export const A8_S3_GROUNDING_RESPONSE =
  "I want to take this seriously with you, and I don't want this app to be the only support you have with it.\n\n" +
  `Please reach a person now rather than later: ${HELPLINE_INLINE}\n\n` +
  "While you call, try one slow breath in, a longer breath out. Is there anyone with you right now? You can keep writing here as well.";

// OKUVU v2.0 / E17-S7: A1 classified this turn S4 (crisis) — the router's
// 'crisis' agent (a8-router.ts). This is the reply a user in crisis actually
// reads, so it is the one string in this file that must not be a paraphrase:
// it is the clinical lead's own S4 card, SIGNED 31 October 2026 as row 5 of
// E17-S7 and pinned paragraph-for-paragraph by
// __tests__/approved-copy.test.ts.
//
// What her text drops from the card it replaces: "and I don't want you to be on
// your own with it", "they're ready to talk with you", "I'll be here when
// you're ready to come back", and NIMHANS (080-46110007), which is no longer in
// the approved set. What it adds: the referral to the user's therapist or
// someone they trust, which the old card left out. The helpline order is her
// correction (§4) — Tele-MANAS first, iCall last with its hours.
//
// Any later edit to this text voids her sign-off for the edited text (§7.2).
export const CRISIS_RESPONSE =
  `I'm really glad you told me. What you are carrying sounds too much to hold alone. Please contact one of these right now: ${HELPLINE_INLINE}\n\n` +
  "I would suggest that you let your therapist or someone you trust know.";

// E17-S13 — third-party crisis. The one case `CRISIS_RESPONSE` above cannot
// cover: it is written in the second person, so serving it for someone else's
// risk tells the user to call a helpline about themselves. The v2 gate
// (eval/v2/gold-set.v2.json, csh-08 and csh-20) requires the crisis path for
// these turns AND requires that the reply name an escalation channel for the
// person at risk, which the S3 grounding card does not do.
//
// The resource list is the E17-S7 corrected approved set (Tele-MANAS,
// Vandrevala, Sneha, iCall, plus 112 as the emergency number this card also
// instructs, contrary to the S3/S4 cards). The surrounding language —
// including the instruction to ask the person directly — is NOT covered by that
// sign-off: it is still NEW CLINICAL CONTENT awaiting the clinical authority's
// decision on csh-08 (§6.3 of her sign-off leaves "a designed reply for people
// asking about someone else's risk" explicitly open).
// It is reproduced verbatim in docs/CLINICAL-REVIEW-S3-CRISIS-COPY.md for that
// review.
export const CRISIS_THIRD_PARTY_RESPONSE =
  "I'm really glad you told me — and I want to be straight with you: what you're describing about them sounds serious enough to act on now, not to watch and wait.\n\n" +
  "If you can, talk to them directly and ask whether they are thinking about ending their life. Asking does not put the idea there, and it is usually what opens the conversation.\n\n" +
  "If they are in immediate danger — they have hurt themselves, they have a plan, or you cannot reach them — call 112 for emergency help, or get them to the nearest emergency department.\n\n" +
  "You can also call a crisis line yourself for guidance on how to help someone else at risk. These lines advise family and friends, not only the person in crisis:\n\n" +
  "Tele-MANAS: 14416 (24×7)\n" +
  "Vandrevala Foundation: +91 9999666555\n" +
  "Sneha, Chennai: 044-24640050\n" +
  "iCall (TISS): 9152987821 — Mon–Sat, 8 am–9 pm\n" +
  "Emergency: 112\n\n" +
  "You're carrying something heavy, and you don't have to do it alone. I'm here.";
