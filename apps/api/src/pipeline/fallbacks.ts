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
// ─── E17-S7 revision 6 (1 November 2026, IST) — the operative copy ─────────
//
// Dr Shubhangi Goswami's clinical sign-off record revision 6 is the document of
// record (docs/Okuvu-Clinical-Sign-Off-Record-E17-S7-FINAL-rev6.docx, sha256
// bd352726…). It voids revisions 1–5 and the returned signed form of 31 Oct.
// Every string below is the shipping text from its §4, and every number block
// is its §2. Three rules govern this file now:
//
//   • The helpline block (§2) is five lines in her order, one service per line:
//     Tele-MANAS, Vandrevala, 112, SNEHA, iCall — with her hours and labels.
//     It is one constant, HELPLINE_BLOCK, because the same list written out
//     seven times is the drift that ends with two numbers disagreeing.
//   • The promise rule (§1.1): "I'm not going anywhere", "I'll stay with you"
//     and "I'm still here with you" appear in no string here, failure paths
//     included — on a failure path the promise is literally untrue. Where a
//     closing line is needed: "You can come back and write here whenever you
//     want."
//   • Any later edit to these texts voids her approval for the edited text and
//     it goes back to her before it changes (§9). __tests__/approved-copy.test.ts
//     enforces that by comparing the served strings against the paragraphs of
//     her document, extracted verbatim into fixtures/e17-s7-approved-copy.json.
//
// 112 in the S3 reply is intended by her (§5.2), closing the asymmetry rev 5
// flagged. NIMHANS 080-46110007 was retired by her on 1 Nov 2026 — see the
// comment at the end of HELPLINE_BLOCK.

// Her §2 block, verbatim: one service per line, each number tappable in the
// app equivalents, her labels and her hours. The order is a clinical decision,
// not alphabetical or by popularity: two 24-hour lines lead, 112 sits third
// rather than last, SNEHA is fourth, and iCall is last because it is not a
// 24-hour service.
// Removed by clinical decision, 1 November 2026 — NIMHANS 080-46110007.
// (Her exact sentence, dictated; it reverses her 31 Oct instruction to keep it.)
export const HELPLINE_BLOCK =
  "Tele-MANAS: 14416 (free, 24 hours)\n" +
  "Vandrevala Foundation: +91 9999 666 555 (24 hours, call or WhatsApp)\n" +
  "Emergency services: 112\n" +
  "SNEHA, Chennai: 044-24640050 (10am-10pm, every day)\n" +
  "iCall (TISS): 9152987821 (Monday to Saturday, 10am-8pm)";

// Her §2.1 short form, for the two failure paths that should offer one number
// to dial rather than five to choose between (items 5 and 6 of §4).
export const HELPLINE_SHORT_LINE =
  "If things feel heavier at any point, Tele-MANAS (14416) answers 24 hours a day, " +
  "and 112 is there in an emergency.";

// The closing line the promise rule substitutes for the promise itself (§1.1).
export const COME_BACK_CLOSING = "You can come back and write here whenever you want.";

// A9-pre (governance) rejected the message but A1 did not find crisis-level
// risk — the router's 'blocked' mode (a8-router.ts). Distinct from the crisis
// path: this always gets a real, persisted, non-alarming reply, never silence.
//
// rev 6 §4.3: her text, replacing a string she rejected outright. It names a
// route forward (the therapist, which every user of this product has) and
// invites something else, rather than inviting the same request again.
export const A9_PRE_BLOCKED_RESPONSE =
  "That's something I can't help with here. If it matters to you, it may be worth bringing to your " +
  "therapist. I'm glad to keep talking about anything else that's on your mind.";

// A9-post degraded (reviewer unavailable, non-S2).
// rev 6 §4.4: her text. Gone with the old copy: "I lost my footing for a
// moment", a metaphor for a server error that a distressed reader could take
// as the app being upset.
export const A9_POST_DEGRADED_RESPONSE =
  "Something went wrong on my side just now. Please say that again whenever you're ready.";

// A9-post S2 failover (reviewer unavailable at elevated risk): fail-closed, so
// the substitute leans steadier and asks even less.
// rev 6 §4.5: her text — the phrase dropped, the short line added. This is the
// path where the reviewer was unavailable at elevated risk, the one turn that
// could not be screened; it named no helpline before this revision.
export const A9_POST_S2_FALLBACK =
  "Take this at your own pace. " + HELPLINE_SHORT_LINE;

// A2 itself failed (timeout/api error): the turn never reached the model.
// rev 6 §4.6: same shape as §4.4 plus the short line, because the user's
// message was never answered at all.
export const A2_DEGRADED_RESPONSE =
  "Something went wrong on my side just now. Please say that again whenever you're ready. " +
  HELPLINE_SHORT_LINE;

// E17-S6 — served when a turn is refused because the session's token budget or
// the user's daily cost budget is exhausted (lib/token-budget.ts). It is a
// governed substitute like every constant above, and it names the helplines
// because the one case it must never fail is a user in distress arriving on a
// turn we cannot serve.
//
// rev 6 §4.7: her text. Her edit also reduced two negations to one flat denial,
// which a reader in distress is likelier to hold on to. The closing line is the
// promise rule's replacement, not "I'll be ready to pick this up with you soon".
export const BUDGET_PAUSED_RESPONSE =
  "We've reached the end of what I can do in this conversation for now, so I need to pause here. " +
  "This isn't about anything you said. If things feel like too much in the meantime, please reach " +
  "one of these:\n" +
  HELPLINE_BLOCK +
  "\n\n" +
  COME_BACK_CLOSING;

// ─── E17-S4 — the two paths a technical failure must land on ────────────────
//
// A1 could not classify AND the deterministic screen found no crisis phrasing:
// we are about to answer a turn whose risk we never assessed. The only honest
// answer is a static one: no model prose, no therapy.
//
// rev 6 §4.8: her text. The admission stays on purpose — the alternative is
// answering a turn whose risk was never assessed as if it had been. The opening
// line and "I'm not going anywhere" come out under the promise rule.
export const SAFETY_UNAVAILABLE_RESPONSE =
  "I can't check in on how you're doing the way I usually do right now, and I'd rather say that " +
  "plainly than answer you without knowing. If things are feeling like too much in the meantime, " +
  "please reach one of these:\n" +
  HELPLINE_BLOCK +
  "\n\n" +
  COME_BACK_CLOSING;

// A1 classified the turn fine, but the model that writes the reply is
// unreachable. The safety decision was made; only the reply is missing, so this
// copy does not re-open the safety question.
//
// rev 6 §4.9 (her final text, after she corrected her own first draft, which
// asked the user to retry twice in one sentence). The opening "I'm here with
// you, and I'm listening" is gone: it was the last promise-family opening in
// the failure set.
export const MODEL_UNAVAILABLE_RESPONSE =
  "Something on my side isn't working properly just now, so I don't want to answer you with words " +
  "I can't stand behind. If it's feeling heavy in the meantime, please reach one of these:\n" +
  HELPLINE_BLOCK +
  "\n\n" +
  "Please try again in a little while.";

// ─── E17-S9 — medical emergency: the ambulance, not the crisis card ────────
//
// Measured before written (evidence/E17-S5-orch-correction.md): four of the
// five gold-set medical emergencies classified S1/S2 and reached A2 as ordinary
// chat, where the reply was a mental-health card offered to someone describing
// a heart attack. These two constants are what the pipeline serves instead,
// deterministically: `agents/a1/medical-emergency-keywords.ts` is the screen,
// `a8-router.ts` is the decision, and neither A2 nor A9-post writes a word of
// the reply — so "112 in the first sentence" is a property of this file, not of
// a model's compliance.
//
// CLINICAL SIGN-OFF (E17-S7): both strings were new clinical content; she has
// now approved both with her own wording (rev 6 §4.1 and §4.2).

// rev 6 §4.1: her text — the opening kept, the last sentence replaced. The
// instruction that decides whether an ambulance can actually reach the person
// ("unlock the door") is now in the copy rather than only in a design document.
export const MEDICAL_EMERGENCY_RESPONSE =
  "Please call 112 for emergency medical help right now — that is the ambulance and emergency " +
  "number in India, and they can send help to you. What you've described is a medical emergency, " +
  "so please don't wait for me on this one: make the call first, and put it on speaker if you can. " +
  "If you can, unlock the door and stay where you can be reached. If someone is nearby, ask them " +
  "to help. You can write here again once you've called.";

// rev 6 §4.2: her text. The overlap case — the message is a physical emergency
// AND A1 still returned S4 (or flagged crisis language). 112 leads, the
// helplines follow, nothing is withdrawn. She cut the sentence that named a
// crisis the person had not disclosed while telling them to call an ambulance.
export const MEDICAL_EMERGENCY_CRISIS_RESPONSE =
  "Please call 112 for emergency medical help right now. That is the ambulance and emergency " +
  "number in India, and they can send help to you. Once you've called, if you'd like someone to " +
  "talk to, you can reach:\n" +
  HELPLINE_BLOCK;

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
// grounding-oriented reply, never silence.
//
// The copy is the clinical lead's own text: her S3 reply signed 31 October
// 2026 (E17-S7 row 1), with the rev 6 §2 block in place of the numbers she
// first wrote, and 112 inside it — which she has since stated is intended
// (§5.2), not drift. The opening and closing sentences are hers; the breath
// invitation stays; "you can keep writing here as well" is why the reply does
// not read as a hand-off out of the app.
export const A8_S3_GROUNDING_RESPONSE =
  "I want to take this seriously with you, and I don't want this app to be the only support you " +
  "have with it.\n\n" +
  "Please reach a person now rather than later:\n" +
  HELPLINE_BLOCK +
  "\n\n" +
  "While you call, try one slow breath in a longer breath out. Is there anyone with you right now? " +
  "You can keep writing here as well.";

// OKUVU v2.0 / E17-S7: A1 classified this turn S4 (crisis) — the router's
// 'crisis' agent. This is the reply a user in crisis actually reads, so it is
// the one string in this file that must not be a paraphrase: it is the clinical
// lead's own S4 card, signed 31 October 2026, with the rev 6 §2 block.
//
// What her text drops from the card it replaced: "and I don't want you to be on
// your own with it", "they're ready to talk with you", "I'll be here when
// you're ready to come back", and NIMHANS, retired 1 Nov 2026. What it adds:
// the referral to the user's therapist or someone they trust, which the old
// card left out.
export const CRISIS_RESPONSE =
  "I'm really glad you told me. What you are carrying sounds like too much to hold alone. Please " +
  "contact one of these right now:\n" +
  HELPLINE_BLOCK +
  "\n\n" +
  "I would suggest that you let your therapist or someone you trust know.";

// E17-S13 — third-party crisis. The one case `CRISIS_RESPONSE` above cannot
// cover: it is written in the second person, so serving it for someone else's
// risk tells the user to call a helpline about themselves. The v2 gate
// (eval/v2/gold-set.v2.json, csh-08 and csh-20) requires the crisis path for
// these turns AND requires the reply to name an escalation channel for the
// person at risk.
//
// rev 6 §7.1: the number list is her §2 block, and 112 stays where she wrote
// it. The surrounding body wording is NOT verbatim-approved — §8.1 item 3 puts
// it to her as its own item, and §8.1 item 2 asks whether the promise rule
// reaches the closing "I'm here." Until she answers, the body is unchanged and
// this comment is the flag: do not cite this card as clinically reviewed.
export const CRISIS_THIRD_PARTY_RESPONSE =
  "I'm really glad you told me — and I want to be straight with you: what you're describing about " +
  "them sounds serious enough to act on now, not to watch and wait.\n\n" +
  "If you can, talk to them directly and ask whether they are thinking about ending their life. " +
  "Asking does not put the idea there, and it is usually what opens the conversation.\n\n" +
  "If they are in immediate danger — they have hurt themselves, they have a plan, or you cannot " +
  "reach them — call 112 for emergency help, or get them to the nearest emergency department.\n\n" +
  "You can also call a crisis line yourself for guidance on how to help someone else at risk. " +
  "These lines advise family and friends, not only the person in crisis:\n" +
  HELPLINE_BLOCK + "\n\n" +
  "You're carrying something heavy, and you don't have to do it alone. I'm here.";
