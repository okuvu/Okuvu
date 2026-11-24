# "Wanting to hurt someone" — its own message, APPROVED and switched on

Status: **approved on 24 November 2026 and built.** He took the draft with three
changes and told me to switch it on and build the urgent marker. The shipped copy
lives in `apps/api/src/lib/harm-to-someone.ts`; the three changes and the final
wording are recorded in `27-24-nov-round-three.md` §2. This file is the proposal as
he read it, kept for the record.

What was written before his approval, for comparison: The current behaviour is unchanged: a hit on the
`wanting_to_hurt_someone` pattern shows the same help card every other flagged
answer gets, with the same therapist alert.

Owner's instruction, 24 Nov 2026: keep it off the crisis card, but give it its own
short message written for someone who is frightened of hurting another person.
Include 112, mark the therapist alert as urgent, and show the client their safety
plan.

---

## The message

Shown instead of the crisis card when "wanting to hurt someone" is the strongest
signal in the answer.

> **Thank you for writing this down.**
>
> It takes courage to say it out loud, and it does not make you a bad person. It
> means you want help before anything happens.
>
> Three things that help right now. Put some distance between you and the person,
> if you can. Stay near someone you trust, so you are not carrying this alone. And
> if you think you might act on it — or you are not sure you can stop yourself —
> **call 112 now**. It is the emergency number, and they can help you stay safe.
>
> <112 row, tappable: "Emergency services — Ambulance, police and fire.">
>
> Your therapist has been alerted that this is urgent.
>
> <Button: **My plan for hard moments** — opens their safety plan>
>
> You can come back to OKUVU whenever you're ready.

Notes on the wording, so it can be judged as wording rather than as a design:

- It names the fear plainly ("if you think you might act on it") instead of
  softening it into a helpline suggestion. Someone frightened of hurting another
  person needs to know we understood what they said.
- It does not ask them to call a helpline about themselves. The crisis card's
  first move is "you matter, call someone about you", and that is the wrong
  instruction for this disclosure — which is why it is off that card.
- "It does not make you a bad person" is doing clinical work: shame is the reason
  most of these disclosures stop at the first sentence.
- 112 appears once as a tap-to-call row and once in the sentence, because it is
  the only number in the approved set that can be sent to a person in immediate
  danger of acting.
- No promise about how fast the therapist answers. "Alerted that this is urgent"
  is a statement about what the platform did, not about the therapist's day.
- The safety plan button uses the crisis card's existing label, "My plan for hard
  moments", so there is one name for one thing across screens.

## What would change, behind the message

1. **Which screen.** Today every S3/S4 hit opens the crisis overlay. This concern
   would open its own short screen instead — but only when it is the strongest
   match. If the same answer also matches self-harm or wanting not to wake up,
   those still win and the crisis card is served, because that is about the
   person's own safety and it is the more protective answer.
2. **The alert.** The flag stays S3 (flagged: help card, therapist alert). It
   gains `urgent`: a new boolean on `SafetyFlag` (default false) and a distinct
   `source` value `worksheet_hurt_someone`, so the portal's Safety card can sort
   it to the top and label it Urgent, and the alert email's subject can say so.
   One column and one enum value; not built yet.
3. **The screen itself.** One new client screen, the copy above, the 112 row and
   the safety-plan button reused from the crisis overlay. No new helpline list —
   the approved five are unchanged, and this screen shows only 112 plus the plan.

## What this does not change

- The five approved helplines and their order on the crisis card.
- The journal's behaviour, or any existing worksheet's wording.
- The deeper screen's patterns: skipping meals, restricting food, making
  yourself sick, exercising to punish yourself, hating your body, not sleeping
  for days, wanting to sleep and not wake up, self-harm, and this one — all nine
  already match today. This page changes only what the client is shown for one of
  them, and how the therapist is alerted.
- Moderate concern on an unavailable check: still S2, still never crisis.

## Decision needed

Approve the wording above, change it, or reject it. On approval I switch it on
under the same branch, with the urgent marker and the tests; until then the
current help card is what a client sees for this disclosure.
