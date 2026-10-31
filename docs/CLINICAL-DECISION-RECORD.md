# Okuvu — clinical decision record (working instrument)

Purpose: one place where each decision that belongs to the named clinical authority
(Shubhangi Goswami — see `00a-clinical-authority.md`) is written down as the *question*, the
*options*, my recommendation with its reason, and *what is live in the product today*. Her
answer goes in the slot beside it, with date and commit, and that answer is what the build
follows.

Why the commit matters: answers are pinned to the exact text she read. A later edit to a
prompt or a card cannot silently inherit her approval.

Baseline for this record: product repo `okuvu/ts`, branch `develop`, commit `c3caa7a`
(30 Oct 2026). Everything labelled "live" below was read from that tree, not from a plan
document. If the head moves, re-verify before presenting anything as current.

Status (updated 31 Oct 2026): **signed for the crisis copy.** Dr Goswami replied on 31 Oct with
a decision on all five rows of the S3/S4 sign-off pack, approving four of them and supplying
replacement text for the S3 reply and the S4 card. She also corrected the helpline set: iCall is
run by TISS, not IIT Bombay, and is not a 24×7 line, so it moves from first to last. That is her
first act as clinical authority on client-facing crisis content, and it is recorded in full in
`Okuvu-Clinical-Sign-Off-Record-S3-S4-E17-S7.docx` (31 Oct 2026), which is the artefact a signature
belongs on.

What is signed and what is not, plainly: the words of the S3 reply and the S4 card are approved,
the phrase list is approved with additions, the idiom guards are approved, and the precedence rule
is approved. **All of it is now built** — branch `feat/e17-s7-approved-copy`, commit `b7aca89`,
gate re-run on her exact texts (18/18, evidence/E17-S7.md) — but none of it is merged or deployed,
so the live service still serves the pre-signature copy at `c3caa7a`. Nothing in this record
authorises a public claim of clinical review — that remains D-G, and her own sequencing puts it last.

**Second message of 31 Oct 2026 — revision 2.** She answered all seven points this record had listed
as open, in eight numbered instructions: keep NIMHANS 080-46110007; keep Emergency 112; reply for a
friend by paraphrasing the S3 card in the third person and giving the same emergency numbers; keep
iCall but last; show both Vandrevala numbers (+91-9999666555 and 1860-2662-345); use her text for
self-injury ("cutting / cut myself"); Sneha and Tele-MANAS are the correct spellings; Tele-MANAS is
24×7 and the typographical slips are to be corrected. That adds **two signed surfaces** — the
third-party reply (csh-08) and the self-injury reply — and **reverses one earlier decision**: NIMHANS
is back in the set, as is the retired Vandrevala number. Recorded in full in
`Okuvu-Clinical-Sign-Off-Record-S3-S4-E17-S7.docx`, revision 2, which supersedes revision 1.

**Third message of 31 Oct 2026 — revision 3.** She answered all five points revision 2 left open, in
nine numbered instructions: Sneha's hours confirmed as 10 am–10 pm; NIMHANS placed before iCall; the
self-injury reply moved to the crisis tier ("if the app senses that the individual wants to cut or is
cutting, crisis card comes up"); the ask-about-intent passage dropped; "please let your therapist know"
retained because the app is therapist-guided; "trust me" removed; Hindi triggers answered in English
accepted for launch; one Vandrevala number only, +91 9999 666 555 with its 24×7×365 claim; iCall hours
corrected to Mon–Sat 10 am–8 pm. That **reverses one revision-2 decision** (show both Vandrevala
numbers → one), **closes the last routing question** (self-injury serves S4), and leaves the copy
settled. Recorded in full in `Okuvu-Clinical-Sign-Off-Record-S3-S4-E17-S7.docx`, revision 3, which
supersedes revision 2.

**Fourth message of 31 Oct 2026 — revision 4 (FINAL).** Her instruction: "All revisions discussed
are upgrades that need to be considered… My physical image sign does not matter. Consider the latest
doc with all revisions to be final. I am digitally approving that much." Recorded effect: the copy
and rules of revs 1–3 stand as approved by **digital approval**, and the returned sign-off form of
31 Oct 12:15 UTC is withdrawn as the operative artefact — it is retained as correspondence only. The
truth-telling consequence is that approval now rests on her written instruction in this channel
rather than on a signature image, which is what she asked for and is recorded here as such. Rev 4
also adds the two things she asked for once and for all: a mechanical inventory of every clinical
surface in the code (§5, 18 surfaces: 3 signed, 2 signed-with-stale-code, 13 never reviewed) and a
closed eight-item dependency register (§6, CD-1…CD-8) that supersedes every earlier ad-hoc list of
open points. Where each item stands is now §6 of that document, not the table below, which is kept
as history.

Where each item actually stands (31 Oct 2026, after her third message):

**Correction, 31 Oct 2026 (after rev 4 was issued):** CD-8 in the rev-4 register was wrong. The A1
severity definitions (the S1–S4 thresholds that select which card a person receives) are **not**
unreviewed. `docs/okuvu-v2.0/system-prompts/01-A1-Safety-Gate-v2.0.md:3` records
"Status: ✅ v2.0 — PASSED by Shubhangi (07 Sep 2026)", and `docs/CLINICAL-REVIEW-S3-CRISIS-COPY.md`
§7.3 states the classifier prompt is "already passed 07 September 2026; unchanged by this pack.
Nothing here re-opens it." The shipped rubric in `apps/api/src/agents/a1/prompts.ts` was verified
against that document (all nine never-rules, the five-level scale, the supremacy rule, the ambiguity
ladder, the fail-closed clause all present; two lines differ only in punctuation). CD-8 is therefore
**withdrawn** and the dependency register is seven items plus the twelve CD-2/CD-6/CD-7 copy items now
laid out in `Okuvu-Clinical-Review-Sheet-Unreviewed-Copy-E17-S7.docx`. The source document's own
footer still reads "Draft for discussion — Shubhangi's clinical review pending", which contradicts
its header; that footer belongs to the worked-example appendix and is a documentation defect to fix,
not a clinical gap.

| # | Item | Her answer | Cleared? |
|---|---|---|---|
| 1 | S3 reply (D-A) | **Signed 31 Oct**, rev 3 final: 112, iCall last at 10 am–8 pm, NIMHANS fourth, one Vandrevala number 24×7×365. Varies from `b7aca89`. | Yes — build at `b7aca89`; edits listed in rev 3 §9 needed first |
| 2 | Phrase list + precedence (D-B) | **Signed 31 Oct** — eleven phrases. Both idiom guards and all three deliberate omissions approved. Precedence: literal outranks the model on every message, raise-only. | Yes — builds as one change, list and guards together |
| 3 | Three unsigned cards (D-C) | **S4 card signed 31 Oct**, slips corrected, therapist line retained on her instruction. **Third-party card signed**, and rev 3 instruction 4 **drops** the ask-about-intent passage, so the shipped card is her words plus the number block. Medical cards still unsigned. | Two of three, and the third-party card is now clean of unreviewed technique |
| 4 | Harm-intrusion E17-S15 (D-D) | Approved in principle on three conditions; she still wants the exact current and proposed reply before it ships. | Conditional — the last look is still hers |
| 5 | Retention (D-E) | "Until deletion" accepted as an **interim** only; wants the lawyer call before it is final. | No — deferred to legal |
| 6 | Escalation route (D-F) | Signs only once alerts verifiably reach a human with a named backup clinician. | No — blocked on build evidence, not on her |
| 7 | Launch claims (D-G) | Explicitly last; depends on 1 and 2. | No — not reached |
| 8 | Helpline set (new, 31 Oct; **closed in rev 3**) | Complete and final: Tele-MANAS 14416 (24×7); Vandrevala +91 9999 666 555 (24×7×365); Sneha 044-24640050 (10 am–10 pm); NIMHANS 080-46110007 (24×7); iCall 9152987821 (Mon–Sat 10 am–8 pm); Emergency 112. | **Decided.** `b7aca89` matches only on which numbers exist; it needs NIMHANS inserted, iCall's hours changed, and the 24×7×365 label added |
| 9 | Self-injury reply (new, rev 2; **routed in rev 3**) | **Signed** in her wording with "trust me" removed. Rev 3 instruction 3 sends it to the **S4 crisis tier** when the app senses intent or act of cutting. | Copy and routing both decided. Consequence recorded in rev 3 §6.3 |

Tally (31 Oct 2026, rev 3): **eight items signed (S3 reply, phrase list, guards, precedence, S4 card,
third-party reply, self-injury reply, helpline set), one conditional (harm-intrusion), one partly signed
(medical cards), three still hers (retention, escalation, launch claims).** The copy is now settled;
the engineering obligation is unchanged and unstarted: make the rev-3 §9 edits, merge, deploy, then
re-run the gate on the new block.

All five points revision 2 listed are closed by her third message. What is still open, and is not
"answered" by silence:

- **The medical-emergency cards** — unsigned, and they are not untouched by this revision: they share
  the helpline constant, so they will start naming NIMHANS and printing iCall's 10 am–8 pm hours without
  having been reviewed. Fix: sign them, or give them their own constant.
- **Harm-intrusion (E17-S15)** — unchanged since 30 Oct: approved in principle on three conditions, and
  she still wants the exact current and proposed reply before it ships.
- **Retention, escalation route, launch claims (D-E, D-F, D-G)** — unchanged. Retention is deferred to
  legal, escalation waits on build evidence, launch claims come last by her own sequencing.
- **The waitlist case for "please let your therapist know"** — she retains the line because the app is
  therapist-guided, which is right for a user with an assigned therapist. A user between therapists, on
  the waitlist, or lapsed reads a referral to something they do not have.
- **A past-tense self-harm mention reaches the crisis card** — new in rev 3, and the one consequence she
  has not seen. "I used to cut myself" matches the detector, and signed precedence sends it to S4, where
  the card asks them to call "if you feel like cutting now". Three options are set out in rev 3 §6.3;
  the recommended one for launch is to accept it.

Facts verified 31 Oct 2026 that shape the copy: **iCall's hours** now agree with her — TISS's own iCall
page says Mon–Sat 10 am–8 pm, and it is iCall's separate helpline site that still prints 8 am–9 pm, so
the institute that runs the line backs her figure. **Sneha** publishes 044-24640050 as 10 am–10 pm,
all days; the 24-hour claim is their alternate line 044-24640060, which she chose not to show. **The
1860-2662-345 Vandrevala number** appears nowhere on the Foundation's current site, which is what
instruction 8 acts on by retiring it. One ordering point does not resolve: NIMHANS is 24×7 but sits
fourth, behind Sneha, because instruction 2 places it before iCall — recorded so nobody later re-sorts
the list as if it were an error.


Note on provenance: the operative artefact is the signed document she returned on 31 Oct 2026 at
12:15:53 UTC — "Okuvu E17-S7 — Clinical Sign-off Response.docx", Gmail message
`1a191e3838cfe5e6` to admin@okuvu.in, sha256 `af36ceb9ca7b3995d2299670d9d4d32a515f67190da810a212d7903d5290a1c9`,
holding signature image `word/media/image1.jpeg` in the Signature row. A byte-identical copy and its
extracted text sit in `evidence/shubhangi-signoff/`. That document governs; this file summarises it.
Her 30 Oct answers recorded in earlier versions were read from email on the day and are now partly
superseded — where the two differ, the signed 31 Oct text governs, and the one apparent conflict
(the pack recorded "remove 'take a breath with me'" while her approved S3 text keeps a reworded
breath) is reconciled in her favour: the breath instruction stays.

Workspace channel (checked 31 Oct): every decision in this file is sourced from email. Nothing here
is sourced from her seat on the Okuvu workspace at https://okuvu.usekeel.in, and that is an access
gap, not a finding — the tenant is a separate Keel/Open WebUI deployment on a GCP VM that this
machine holds no credentials for (gcloud session expired, no API key, empty vault). So no chat
approval is claimed, and equally, silence in that workspace cannot be read as her having declined
anything. If a decision is ever quoted as given "in the workspace", it needs a message id or a
screenshot before it goes near a release.

---

## D-A. The S3 reply (largest item)

**Question.** What does a person at S3 — hopelessness, burden themes, passive ideation, no
stated plan — read?

**Live now.** Grounding sentence + one crisis line + "I'm here with you", as the verbatim text
in `outbox/Okuvu-clinical-dependencies-Shubhangi.txt` §1. Each number in it was already
shipping elsewhere in the product; no new number was introduced. Sits in
`apps/api/src/pipeline/fallbacks.ts`; the earlier single-sentence breathing-only reply is gone.

**Options.**
1. Grounding + crisis line in the same reply (current).
2. Crisis line only, no grounding step.

**My recommendation: 1.** Reason: the S3 person is ambivalent by definition. A reply that only
redirects to a phone teaches people not to mention these moments, and it converts a
conversation the product can still hold into a handoff. The argument for 2 is dilution —
a helpline buried beside a breathing exercise may be skipped. That risk is real and it is
hers to weigh.

**Decision (Dr Goswami), 31 Oct 2026 — approved with edits.** Her text, verbatim:

> I want to take this seriously with you, and I don't want this app to be the only support you
> have with it. Please reach a person now rather than later (provide numbers here). While you
> call, try one slow breath in a longer breath out. Is there anyoe with you right now? You can
> keep writing here as well.

Explicit instruction: remove "I am not going anywhere". The numbers are now final from her third
message: Tele-MANAS 14416 (24×7), Vandrevala +91 9999 666 555 (24×7×365), Sneha 044-24640050
(10 am–10 pm), NIMHANS 080-46110007 (24×7), iCall 9152987821 (Mon–Sat 10 am–8 pm), Emergency 112.
"anyoe" → "anyone" authorised. **Status: approved, not built.** Date: 31 Oct 2026. Commit:
____________ Initials: **SG**

---

## D-B. The literal-phrase list and its precedence

**Question.** (a) Is the literal list complete and safe? (b) Should the two narrow figurative
exceptions exist ("kill myself laughing", "die of embarrassment")? (c) Does a literal phrase
outrank the model on every message, or only when the model is unreachable?

**Live now.** The literal list forces the crisis card even when the classifier returned
something lower — `apps/api/src/agents/a1/crisis-keywords.ts`, wired in
`apps/api/src/pipeline/orchestrator.ts`. Answer (c) is **already implemented as "outranks on
every message"**, because that was the only way to stop "I want to die" reaching the
breathing exercise. She is being asked to approve a rule in force, not to approve a proposal.

**My recommendation.** (a) list as-is, (b) yes to both exceptions, (c) keep the every-message
precedence.

**Decision (Dr Goswami), 31 Oct 2026 — approved, all three parts.**

- (a) List approved **with additions**: the five live phrases plus §5.6's five (`ending my life`,
  `ending it all`, `killing myself`, `marna chahta` / `marni chahti`, `khud ko khatam`) plus her
  own addition `jeena nahi chahti` / `jeena nahi chahta`. Eleven phrases in total.
- (b) Both idiom guards approved, and the three deliberate omissions with them (no guard on
  `suicide`, none on `end it all`, none on Hindi).
- (c) Precedence approved: a literal match outranks the model on every message and can raise the
  level to S4 and never lower it.

Two build notes that follow, neither of which is a clinical question: the guards must ship in the
same change as the precedence (§5.8 made them the price of it), and the Hindi phrases need their
typing variants (`nahin`, `nhi`) or the list will miss the messages it was added to catch.
Commit: ____________ Initials: **SG**

---

## D-C. Three unsigned clinical surfaces shipping today

Not three approvals — one prioritisation, then work in the order she sets.

| Surface | What it is | Where |
|---|---|---|
| S4 crisis card | what a person in explicit crisis reads; five named lines + 112; shipping since before the review | `apps/api/src/pipeline/fallbacks.ts` |
| Third-party crisis card | risk is someone else's; second-person card would be wrong; includes "ask them directly about intent", a technique not just wording | `apps/api/src/agents/a9-post/prompts.ts` |
| Medical emergency cards | "call 112" leads, over 18 tested phrasings | `apps/api/src/agents/a1/medical-emergency-keywords.ts` |

**My recommendation.** S4 card first — it is the worst moment in the product and the oldest
unsigned text. Third-party card second, because it contains a clinical instruction
(ask about intent) that has had no review at all. Medical cards third.

**Decision — order:** S4 card, then third-party card, then medical cards. Initialled SG, 30 Oct.

**Decision on the S4 card text (Dr Goswami), 31 Oct 2026 — approved with edits.** Her text,
verbatim:

> I'm really glad you told me. What you are carrying sound too much to hold alone. Please contact
> one of the these right now (put phone numbers here). I would suggest that you let you therapist
> or someone you trust know.

Four typographical fixes, authorised by her second message and applied in revs 2 and 3: "sound" →
"sounds like", "one of the these" → "one of these", "let you therapist" → "let your therapist", and
the placeholder rendered as the block. The referral — "let your therapist or someone you trust know" —
**stays**, on her instruction 5 of the third message: the app is therapist-guided. This is the first
clinical review this card has had. **Status: approved, not built.** Date: 31 Oct 2026. Commit:
____________ Initials: **SG**

The medical cards remain unsigned — and they inherit the shared helpline block, so they change with
this revision whether or not they are signed (§9 of the sign-off record).

---

## D-D. Harm-intrusion routing (E17-S15) — the one change that escalates less

**Question.** A user writes "I keep getting thoughts that I might hurt someone, I don't want
to, they just come." Intrusive thoughts are common and distressing, not intent. Today the
product answers with S3 crisis copy. Should it instead name the intrusive-thought pattern and
offer a way to relate to it, while a genuine stated intent or plan still reaches crisis on
every turn?

**Live now.** Current reply is the S3 copy — the worst-performing scenario in the quality
evaluation and the only place where the machine does the safer-looking and less helpful thing
at once. Open as E17-S15 on `develop`.

**My recommendation.** Make the change, with her written sign-off. Reason: the current reply
misreads a well-documented presentation as intent, which is both unhelpful and, for a person
frightened by their own thoughts, potentially harmful. The risk of the change is failing to
escalate a real risk, which is why it does not move without her.

**Decision (Dr Goswami):** ____________________  Date: __________  Commit: ____________

---

## D-E. Retention period

**Question.** What retention period applies to clinical records — conversations, session
summaries, journals, mood logs, therapist notes, appointments? Or: kept until the user deletes
their account, explicitly chosen?

**Live now.** No period. Records persist until account deletion, and removal follows the
deletion path that has been tested once and observed. Nothing ages out. The privacy policy
states this and claims nothing the code does not do. The checklist item requiring "a stated
retention period" (E16-S7) is therefore genuinely open.

**My recommendation.** A finite period for conversational content with a stated floor for
clinical notes, or an explicit "until deletion" decision — either is defensible; silence is
not, because it leaves a compliance gap open.

**Decision (Dr Goswami):** ____________________  Date: __________

---

## D-F. Escalation route

**Question.** Sign or mark up the clinical section of the on-call runbook, which documents
what happens when a user's safety signal needs a human, including the helpline block shown in
the product.

**Live now.** `docs/ONCALL-RUNBOOK.md` ships with "UNAPPROVED — PENDING CLINICAL OWNER" and a
blank signature table.

**Decision (Dr Goswami):** ____________________  Date: __________

---

## D-G. Launch claims matrix

**Question.** Approve, line by line, every public statement about clinical review, so that no
claim exceeds what has actually been signed. Depends on D-A and D-B.

**Live now.** No surface claims clinical review. That stays true until a signature exists.

**Decision (Dr Goswami):** ____________________  Date: __________

---

## D-H. Third-party reply — "a friend is at risk" (csh-08)

**Question.** What does the sender read when the risk is someone else's? The S3 and S4 cards are
second person, so serving either tells the user to call a helpline about themselves.

**Live now.** `CRISIS_THIRD_PARTY_RESPONSE` in `apps/api/src/pipeline/fallbacks.ts` (written for
E17-S13), long, with the corrected number list but no clinical review of its wording. It contains a
clinical technique: "talk to them directly and ask whether they are thinking about ending their life."
That passage has never been reviewed and is **not** covered by the decision below.

**Decision (Dr Goswami), 31 Oct 2026 — approved, by paraphrase.** Her words, verbatim:

> For a friend - suggest the same emergency numbers and paraphrase the same for the third person.
> Example - This must be too hard on them but this is a serious thing and I don't want this app to be
> the only support (followed by the emergency contacts).

Shipping text is her three moves plus the same number block plus 112, in the sign-off record §4.2.
**Status: approved, not built.** Date: 31 Oct 2026. Commit: ____________ Initials: **SG**

**Dropped, by her instruction 4 of the third message ("ok. drop it").** The ask-about-intent passage
is not in the shipped card: it is her words plus the number block, and the card's unsigned opening and
closing go with it. Nothing unreviewed is left on this surface.

---

## D-I. Self-injury reply — "cutting / cut myself"

**Question.** What does someone who names cutting read, given the detector already matches those
forms (added for E17-S13) and escalation on them has been running without a signed reply?

**Decision (Dr Goswami), 31 Oct 2026 — approved, with text.** Her words, verbatim:

> Cutting may seem temporarily relieving, but it can be very dangerous and fatal. It is a coping
> strategy but trust me, there are alternatives. Please let your therapist know and call any of the
> following numbers if you feel like cutting now.

Two edits authorised in her third message: "trust me," is removed (instruction 6), and "please let your
therapist know" **stays** as she wrote it (instruction 5) — revision 2's proposal to add "or someone you
trust" is withdrawn.

**Routing: decided.** Instruction 3 of her third message — "if the app senses that the individual wants
to cut or is cutting (in the sense of self harm), crisis card comes up" — sends this reply to the **S4
crisis tier**. Precedence is unchanged. The consequence: because precedence acts on every message and
the detector matches "cutting", a past-tense mention ("I used to cut myself") also reaches this card.
Three options are set out in rev 3 §6.3; accepting that is the recommendation for launch.
**Status: copy and routing signed. Date: 31 Oct 2026. Commit: ____________ Initials: **SG**

---

## D-J. Revision 5 of the sign-off record (31 Oct 2026, 18:59 UTC)

`docs/Okuvu-Clinical-Sign-Off-Record-E17-S7-FINAL-rev5.docx` is the final record. It is
**digitally approved**: her words were "My physical image sign does not matter. Consider the
latest doc with all revisions to be final. I am digitally approving that much." Revisions 1-4
and the returned form of 31 Oct 12:15 UTC are superseded.

Approved in this revision:

- **The helpline block**, one constant, four lines, 24-hour lines first: Tele-MANAS 14416
  (free, 24 hours); Vandrevala +91 9999 666 555 (24 hours, call or WhatsApp); Emergency 112;
  iCall 9152987821 (Mon-Sat, 10 am - 8pm). Short form for failure paths: "If things feel
  heavier at any point, Tele-MANAS (14416) answers 24 hours a day, and 112 is there in an
  emergency."
- **The promise rule**: "I'm not going anywhere", "I'll stay with you" and "I'm still here
  with you" come out of every string, failure paths included. Closing line where one is
  needed: "You can come back and write here whenever you want." Strikes a phrase from nine
  constants (record §3).
- **The twelve**: all nine failure/medical/degraded constants, `SAFE_FALLBACK` removed
  entirely, the crisis screen (footer "You can come back to OKUVU whenever you're ready",
  exit "Close"), and the age gate (18, hard stop, 1098 added, "yet" removed). Record §4 has
  each instruction beside the text that ships.
- **Phrase list**: "jeena nahi chahti/chahta" added to 5.6. Already live — the signed
  "jeena nahi" alternative matches both suffixed forms (tested against the live pattern).
- **§5.2 confirmed**: the phrase list still overrides the spending cap. `admitTurn()` in
  `lib/token-budget.ts` returns `crisis_bypass: 'crisis_language'` when over budget and the
  message matches; regex only, no model call, logged in the usage log.

Open — one word each, record §6 items 1, 2, 5 and 6:

1. **Sneha** — she wrote "SNEHA is verified, so keep it" but the block she supplied omits
   it. Recommendation: add as the fourth line, before iCall, with the 10 am - 10 pm hours she
   confirmed.
2. **NIMHANS 080-46110007** — she instructed "keep" on 31 Oct, the block omits it, and the
   code has already removed it. Retired, or omitted by oversight?
3. **MODEL_UNAVAILABLE_RESPONSE** — her literal edit yields two retry instructions in one
   sentence and leaves the opening "I'm here with you, and I'm listening", which is the
   promise family her own rule strikes.
4. **Third-party risk and the spending cap** — the bypass covers S4 language only; a message
   about someone else at risk gets the pause card when over budget. Recommendation: extend
   the bypass to the third-party predicate.

Two consequences recorded so they are not later read as drift: applying the block to the
shared constant amends the sign-off text of the S3 reply (112 returns to it), the S4 card
and the third-party card — this is why her approval of rev 5 covers those three. And
`SAFE_FALLBACK` is a sentinel as well as copy (worker failure path, canned-response hook,
five test assertions), so its removal is engineering work, not a deletion.

## What a signature here does NOT authorise

Not a claim of clinical review or endorsement on any public surface. Not the A1 classifier
prompt. Not a certification that the software already behaves as described — it approves
words and rules; engineering status is reported separately.

---

## Dependencies that are not hers (so nothing bounces back to her as a question)

If she raises one of these, the answer is who owns it and where it stands — not a decision
request.

| Dependency | Owner | State (31 Oct 2026) |
|---|---|---|
| DPDP review of the AWS data-processing agreement | Rajwant / legal | open; AWS DPA review not started |
| TRAI DLT registration for SMS | Rajwant | open; SMS cannot go live without it |
| Play Console developer account (personal vs organisation) | Rajwant | unknown — the 14-day closed test hinges on it |
| Therapist provisioning on the portal | build | open |
| Model route | decided | `qwen.qwen3-32b-v1:0` on Bedrock ap-south-1 |
| Building the approved copy (E17-S7) | build | open — precedence, guards, 11 phrases, S3 reply, S4 card, third-party reply, self-injury reply and the final helpline block are all approved and none of it is in code; rev 5 of the sign-off record §4 lists the shipping text for all twelve decisions and §6 the four one-word answers outstanding |

## Revision 6 (1 Nov 2026, IST) — final: all twelve closed

Her two messages of 31 Oct 2026 close every item this record has carried since rev 4. Recorded in
`Okuvu-Clinical-Sign-Off-Record-E17-S7-FINAL-rev6.docx`, which supersedes revs 1–5 **and** the
returned signed form of 31 Oct.

**The helpline block is final**, five lines, in her order: Tele-MANAS 14416 (free, 24 hours);
Vandrevala +91 9999 666 555 (24 hours, call or WhatsApp); Emergency services 112; SNEHA, Chennai
044-24640050 (10am–10pm, every day); iCall (TISS) 9152987821 (Mon–Sat, 10am–8pm). It applies
everywhere numbers appear, including the S3 reply — **112 in the S3 reply is intended by her**, which
closes the asymmetry rev 5 flagged.

**Three dated reversals, all hers, all recorded as reversals:** NIMHANS 080-46110007 is retired
everywhere (it was "keep" on 31 Oct); SNEHA is kept as the fourth line; the 1860-2662-345 number
stays retired (rev 2 had said show both). The code comment she dictated is exact: "Removed by
clinical decision, 1 November 2026".

**The four one-word items of rev 5 are closed:** SNEHA kept; NIMHANS removed; item 9 replaced with
her own corrected text (the double retry was a fault in her edit, her words); the spending-cap bypass
extended to `hasThirdPartyCrisisLanguage`, so a message about someone else at risk now always gets
the friend card instead of the pause card.

**Two standing rules she set:** (1) the promise rule — "I'm not going anywhere", "I'll stay with
you" and "I'm still here with you" come out of every string, failure paths included, because on a
failure path the promise is untrue; the closing line is "You can come back and write here whenever
you want." (2) record-keeping — her instructions are quoted verbatim with date and source, never
paraphrased in her voice. This record now follows both. Note the honest limit: her instructions
arrive in the review thread, not by email, so there is no email subject to cite; none is invented.

**Verified in code rather than assumed:** the phrase list does override the spending cap
(`admitTurn` → `hasCrisisLanguage` → `crisis_bypass`, a regex, no model call, logged as
`budget_bypass: 'crisis_language'`); "jeena nahi chahti/chahta" already fires because "jeena nahi" is
in the signed pattern; the A9-post approved-number list already excludes NIMHANS (five services), so
that half of her instruction confirms the code; and there is **no age check anywhere in the API** —
the gate is a Flutter screen, so her "server-side enforcement before any further users" is a release
gate, not a copy change.

**Still open, three one-word items** (rev 6 §8.1): whether the age-gate screen takes the full
five-line block or her own §4.12 text (applied as §4.12 — the more specific and better copy); whether
the promise rule reaches the friend card's closing "I'm here."; and whether the friend card body is
approved as recorded. Ours to deliver: the harm-intrusion reply (E17-S15), never yet sent to her.

## Recording an answer

A short reply with initials against each item plus anything to change is enough. On receipt:
write the answer into the slot above, record name, UTC date and the commit of the text she
read, and note any resulting build change with its story id. If she disagrees with something
already live, that answer changes live behaviour — say so plainly rather than filing it as a
future preference.
