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

// Deterministic substitute selector. `safetyState` is the A1 state this turn
// was classified at (the orchestrator passes what it has; block paths pass
// the same state they were gated on).
export function getSafeFallback(safetyState: string): string {
  return safetyState === 'S2' ? A9_POST_S2_FALLBACK : A9_POST_DEGRADED_RESPONSE
}

// OKUVU v2.0: A1 classified this turn S3 (elevated risk — hopelessness,
// worthlessness, or escape themes, without a stated plan or method). This is
// the router's 'deterministic-grounding' agent (a8-router.ts) — the same
// tier of clinical determinism as crisis (S4), one step down: A2 is skipped
// entirely, but this always gets a real, persisted, grounding-oriented
// reply, never silence. Unlike the block path, this one IS allowed to offer
// a body-first exercise (that's its entire purpose); it's held to the rest
// of the contract (warm, thread-holding, no machinery talk). Content TBD by
// whoever owns crisis/grounding copy — same open item as A9_PRE_BLOCKED_
// RESPONSE and the crisis path's no-script gap.
export const A8_S3_GROUNDING_RESPONSE =
  "It sounds like things feel really heavy right now. Let's slow down together — " +
  "can you take a breath with me, and tell me what's around you right now?"
