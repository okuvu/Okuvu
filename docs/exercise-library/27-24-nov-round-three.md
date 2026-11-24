# 24 November 2026, third round — approvals, the urgent screen, and the chat wording

The owner's instructions arrive in chat; this is the record of what he decided, what
it changed in the tree, and what is still waiting on him.

Everything here is on `feat/worksheet-rules`. Nothing is merged, deployed or built.

---

## 1. Unsent letter and Weighing it up — APPROVED

He read the revised wording and approved both:

> "Approve both revised drafts: Unsent letter and Weighing it up."

- **Unsent letter** (`ws_unsent_letter`) — approved with the revised helper under
  "Write the letter" and the line under "Delete it".
- **Weighing it up** (`ws_pros_cons_change`) — approved with the first question,
  the four boxes rewritten around "this change", and the readiness helper
  "Readiness can change from day to day."

Both are `status: 'approved'` with `approved_at = 2026-11-24`, in their own
migration (`20261124180000_approve_stress_burnout_revised`), because they were
approved after a revision and the approval record has to say which text was read.
The eight approved earlier that day keep their own migration and are untouched.

The whole 24 Nov batch — ten worksheets — is now approved. Nothing from it is a
draft, and the two that carry the deeper screen (Doomscroll log, Unsent letter)
keep it.

**Hinglish is NOT written.** His instruction: "Note it for later. I'll approve the
translations separately, so don't write them now." So `content_hi` is null on all
ten, the Hinglish review document lists the two new rows as `_missing_`, and the
gate stays per row.

---

## 2. "Wanting to hurt someone" — the screen, approved and switched on

He approved the draft with three changes, then: "switch it on, build the urgent
marker, and show me the final wording."

### The final wording (verbatim, as it ships)

```
Thank you for writing this down.

It takes courage to say it out loud, and it does not make you a bad person. It means you want help before anything happens.

Three things that help right now. Put some distance between you and the person, if you can. Move away from anything you could use to hurt someone, or ask someone to keep it for now. Stay near someone you trust, so you are not carrying this alone. And if you think you might act on it — or you are not sure you can stop yourself — call 112 now. It is the emergency number, and they can help you stay safe.

[Emergency services — Ambulance, police and fire. 112 · tap to call]

If you're not about to act but these thoughts frighten you, you can talk them through with Vandrevala Foundation, any time, day or night.

[Vandrevala Foundation — 24 hours, call or WhatsApp. +91 9999 666 555 · tap to call]

Your therapist has been told this is urgent. They may not be able to reply straight away, so if you need help right now, call 112.

[My plan for hard moments]

You can come back to OKUVU whenever you're ready.
```

His three changes, applied exactly:

1. After "Put some distance between you and the person, if you can," add "Move
   away from anything you could use to hurt someone, or ask someone to keep it for
   now."
2. Replace "Your therapist has been alerted that this is urgent." with "Your
   therapist has been told this is urgent. They may not be able to reply straight
   away, so if you need help right now, call 112."
3. Below the 112 row: "If you're not about to act but these thoughts frighten you,
   you can talk them through with Vandrevala Foundation, any time, day or night."

### Vandrevala — checked current, 24 Nov 2026

The approved number is **+91 9999 666 555**, and it is the number on the
operator's own site:
<https://www.vandrevalafoundation.com/free-counseling/contact-us> — "Emergency
Helpline **+91 9999 666 555**", "Available 24 X 7 X 365", "You can call or
WhatsApp". That is the operator's page, not a directory, which is what the hours
claim needs. The 1860-2662-345 number stays retired (clinical decision, 1 Nov
2026).

### How it is wired

| Where | What |
|---|---|
| `apps/api/src/lib/harm-to-someone.ts` | The approved copy, as structured data plus one text rendering. One home; the app renders it, so there is no second copy in Dart. |
| `apps/api/src/lib/safety-check.ts` | The deeper screen now returns `screen: 'harm_to_someone'` and `urgent: true` when the harm-to-someone concern is the worst match and it is S3. A stronger first-person signal still wins: `worstExtraRisk` returns the S4 match when one exists, so self-harm or wanting not to wake up still gets the crisis card. |
| `apps/api/src/routes/worksheets.ts` | Flags with `source: 'harm_to_someone'` and `urgent: true`, and returns the screen in the save response so the app can render it. |
| `apps/api/src/lib/safety-flags.ts`, `lib/email.ts` | A new `urgent` boolean on `SafetyFlag` (migration, default false), carried to the alert email, which leads with "URGENT". |
| `apps/mobile/.../harm_to_someone_screen.dart` | The overlay: 112 first and tappable, Vandrevala after it, the alert line, the safety plan button (only when a plan exists), the closing line. Copy comes from the api. |
| `apps/therapist-portal/.../clients/[id]/safety/page.tsx` | A Safety card: urgent flags first and expanded, with the client's own words. |

### What is NOT true of it — read this before deploying

**The chat does not serve this screen.** The deeper screen is worksheet-scoped
(his rule 3 named the five worksheets), so a client who types "I want to hurt my
brother" into chat still goes through `a8-router.ts`, which has no
harm-to-someone branch — it falls to the governance path's policy line. That is a
routing change to the live chat with its own approval and gold-set implications,
and it is not in this round. It is the one remaining hole and it should be the
next thing decided.

---

## 3. The portal shows the client's own words on the urgent alert

His instruction: "In the portal, the urgent alert must show the client's own words,
so I can judge it myself."

Built as: the flag keeps its pointer (`subject_kind` + `subject_id`), stores no
text, and the Safety card resolves that pointer for **urgent harm-to-someone flags
only**, showing the answer verbatim. Every other source keeps the old rule. The
read is recorded in the clinical access log as `READ_HARM_TO_SOMEONE_WORDS`.

**This contradicts client-facing copy that is live**, and that is the item in
`28-privacy-wording-for-the-urgent-alert.md`. It is not merged, so nothing is
currently promising the old thing while doing the new one — but it must not be
deployed before he approves the new sentence.

---

## 4. Chat wording — APPROVED and applied as v2.7

He approved the proposal with four additions and one edit. `a2-okuvu-v2.7.txt` is
the file; `A2_PROMPT_VERSION = 'v2.7'`; the reasoning is in `prompts/index.ts`.

His changes, in his words:

- "Change 'or name a thinking trap at all' to: 'or name a thinking trap in what
  they said. You may say the name of the worksheet.'"
- "Add: 'Do not suggest a worksheet when they are very distressed or in crisis.
  Help them settle first.'"
- "Add: 'Only suggest worksheets they can open on their own, or ones their
  therapist has assigned to them. Never suggest the Unsent letter, A letter from a
  kind friend, or any other high-load worksheet unless their therapist assigned
  it.'"
- "Add: 'Suggest one worksheet at a time. If they say no or ignore it, don't
  suggest a worksheet again in this conversation.'"

### The list the chat receives — he asked whether it carries load level and assignment

It did not. Both are added:

- `getVisibleWorksheets()` returns `{ label, load_level, access, assigned }`.
  `assigned` is true when this client has an active Homework row for that tool.
- The prompt line reads, for example:
  - `Worry tree — light · they can open this themselves`
  - `Boundary planner — light · assigned to them by their therapist`
  - `Unsent letter — demanding · their therapist has to assign this one`
- A failed assignment lookup narrows the list (reports "none assigned") rather
  than widening it. Unrecognised access modes are treated as `assigned`.

**One sentence in that paragraph is mine, not his**, added so the list is usable:
"Each line of that list gives the worksheet's name, whether it is light or
demanding, and whether they can open it themselves or their therapist assigned
it." He approved adding the two facts; this is how the prompt says so. It is
flagged here so it can be changed in one word.

---

## 5. Gold-set

`pnpm --filter @okuvu/api eval:v2 --label v27-goldset` — 123 scenarios × 3 reps,
the product's own pipeline. Results are in the covering message and in
`evidence/v27-goldset/run-1.json`. v2.7 is the default in this branch; the run is
the gate for keeping it that way.
