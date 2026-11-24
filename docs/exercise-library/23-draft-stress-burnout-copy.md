# Stress & Burnout worksheets — draft wording for review, NOT approved

Generated from the catalogue in `packages/shared-types/worksheets`. Do not edit by
hand: change the catalogue, then regenerate.

**Status: drafts.** These are the worksheets the owner sent back for a wording
change on 24 November 2026, plus any later draft. They are switched off for clients:
no card in their Library, no direct open, no assignment from the portal. A therapist
can preview them. Nothing is switched on until you say the wording is approved.

The other eight of the 24 Nov batch were approved as written that day; their copy is
in `25-approved-stress-burnout-copy.md`.

Both go through the same safety check the journal uses on every written and spoken
answer, with the same response. The Unsent letter also carries the deeper screen (eating
and body, sleep, self-harm, harm to someone else). Neither asks for weight, body
measurements, calories, food amounts or medicines, and neither adds answers into a
total, a level or a label.

---

## 8. Unsent letter

**The brief:** Who it is to, then the letter (typed or spoken). At the end: Keep it privately / Delete it.

- id: `ws_unsent_letter`
- Library description: Write what was never said, then choose whether to keep it.
- opens: A — therapist-assigned
- load: demanding · about 15 minutes
- care plan label: stress_burnout
- deeper safety screen: yes

> Some things never got said, and maybe they never will. Writing them down, with no plan to send them, can make a little more room inside you.

- **short text** — Who is this letter to?
  - helper: A name, a relationship, or just 'someone I used to know'. You don't have to explain.
- **long text** — Write the letter.
  - helper: Nobody reads this unless you choose to share it. If something you write sounds like you might not be safe, OKUVU will check in with you and may let your therapist know.
- **choice** — What would you like to do with it now?
  - required
  - helper: Keeping it saves it in Past me, private unless you share it later. Deleting removes it straight away.
  - option: Keep it privately
  - option: Delete it
    - helper: This deletes the letter. If OKUVU already checked in about something you wrote, your therapist may still know that a check-in happened.

> You wrote it, and you decided what happens to it. Both of those are yours.

**Delete rule:** if `keep` is answered `delete`, the saved entry is deleted straight away, using the same delete as Past me.

---

## 9. Weighing it up

**The brief:** Four boxes: good things about changing, good things about staying the same, costs of changing, costs of staying the same. 0–10 how ready I feel. Closing reflection.

- id: `ws_pros_cons_change`
- Library description: Look at both sides of changing, and of staying the same.
- opens: A — therapist-assigned
- load: light · about 10 minutes
- care plan label: stress_burnout
- deeper safety screen: no (the shared check on every answer still runs)

> When part of you wants to change and part of you doesn't, that's not a flaw. It's worth looking at both sides slowly.

- **short text** — What change are you thinking about?
  - required
  - helper: A sentence is enough. You can be as general or as specific as you like.
- **long text** — What might be good about this change?
  - helper: Even small good things. Nothing is too obvious.
- **long text** — What might be good about not making this change?
  - helper: There's usually something, or it would be easier to change.
- **long text** — What might this change cost you?
  - helper: Time, comfort, people, the way things are now.
- **long text** — What might not making this change cost you?
  - helper: It's alright if this is hard to answer. Take your time.
- **scale 0 10** — How ready do you feel to change, right now?
  - helper: There's no right number. Readiness can change from day to day.
- **closing reflection** — What do you notice, seeing all four side by side?
  - helper: Optional.

> Noticing both sides is not the same as staying stuck.

---

## To approve

Reply with the worksheet names whose wording is approved, and any line you want
changed. Approval flips that row to `approved` in a new migration — the wording itself
is edited in `packages/shared-types/worksheets/stress-and-burnout.ts`, never in a screen.
