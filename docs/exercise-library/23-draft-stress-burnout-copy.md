# Worksheet draft wording for review, NOT approved

Generated from the catalogue in `packages/shared-types/worksheets`. Do not edit by
hand: change the catalogue, then regenerate. This is the document the owner reads to
approve wording, so it can never describe a worksheet differently from the app.

**Status: drafts.** 9 worksheets are written and none of them is
approved. Every one is switched off for clients: no card in their Library, no direct
open, no assignment from the portal. A therapist can preview them. Nothing is
switched on until you say the wording is approved.

Every worksheet goes through the same safety check the journal uses on every written and
spoken answer, with the same response. None of the rows below asks for weight, body
measurements, calories, food amounts or medicines, and none adds answers into a total,
a level or a label.

---

## 1. Worry time

**The brief:** A daily time and length for worry time, a parked list, and a still bothering / not anymore review for each worry. Daily email reminder, no app notification.

- id: `ws_worry_time`
- Library description: Give worrying one time and one place, instead of all day.
- opens: A — therapist-assigned
- load: light · about 10 minutes
- care plan label: anxiety_worry
- deeper safety screen: no (the shared check on every answer still runs)

> Worrying has a way of spreading across the whole day. Giving it one time and one place doesn't make it disappear — it gives it somewhere to wait.

- **datetime** — What time each day do you want to give it?
  - required
  - helper: Pick a time when you can usually stop for a bit. It doesn't have to be perfect, and you can move it later.
- **choice** — How long do you want?
  - required
  - helper: A shorter window is easier to keep. You can always finish early.
  - option: 10 minutes
  - option: 15 minutes
  - option: 20 minutes
- **row list** — What's parked for that time?
  - helper: During the day, when a worry turns up, put it here instead of carrying it round. When your worry time comes, come back and look at each one.
  - column `worry` (text): The worry
  - column `review` (choice): When you came back to it
    - Still bothering me
    - Not anymore
- **closing reflection** — What do you notice about the ones you parked?
  - helper: Optional. A word is enough.

> A worry kept for later is a worry you're not carrying all day.

---

## 2. Brain-dump

**The brief:** One long answer, typed or spoken. At the end: Save it / Let it go (delete).

- id: `ws_brain_dump`
- Library description: Empty the whole swirl onto one page, then decide whether to keep it.
- opens: S — the client can open it themselves
- load: light · about 5 minutes
- care plan label: anxiety_worry
- deeper safety screen: no (the shared check on every answer still runs)

> Nothing here has to be tidy. Put the whole swirl down in one place, and let it be as messy as it actually is.

- **long text** — What's in your head right now?
  - helper: One long list is fine. Nothing has to be in order. You can type this or say it out loud — whichever is easier.
- **choice** — What would you like to do with it?
  - required
  - option: Save it
    - helper: It goes into Past me, private unless you choose to share it.
  - option: Let it go
    - helper: This deletes it straight away. If OKUVU already checked in about something you wrote, your therapist may still know that a check-in happened.

> You got it out of your head. That's the whole job.

**Delete rule:** if `keep` is answered `delete`, the saved entry is deleted straight away, using the same delete as Past me.

---

## 3. Unhooking from a thought

**The brief:** Short answer: the thought. The app shows it back as "I'm having the thought that…" then "I notice I'm having the thought that…". 0–100 belief before and after. Never rewrites the thought.

- id: `ws_unhooking`
- Library description: Say a thought back to yourself as a thought, and notice if it loosens.
- opens: A — therapist-assigned
- load: light · about 10 minutes
- care plan label: anxiety_worry
- deeper safety screen: no (the shared check on every answer still runs)

> A thought can feel like a fact about the world. Saying it back as a thought — in your own words — is how it starts to sound like one.

- **short text** — What's the thought that keeps coming?
  - required
  - helper: Write it the way it arrives, exactly as harsh as it sounds. Nothing here is edited.
- **scale 0 100** — How much do you believe it right now?
- **echo** — Here it is again, a little further away.
  - helper: These are your own words. Nothing has been changed.
- **scale 0 100** — And now, having read it back?
- **closing reflection** — What's different, if anything, about the thought now?
  - helper: Optional. Nothing has to have changed.

> The thought didn't have to change for you to step back from it.

---

## 4. SOS calm

**The brief:** One-tap card on Home and in chat: the existing long-out-breath exercise, then 5-4-3-2-1 grounding. Nothing to type.

- id: `ws_sos_calm`
- Library description: One tap: a long breath out, then look around the room. Nothing to type.
- opens: S — the client can open it themselves
- load: light · about 3 minutes
- care plan label: anxiety_worry
- deeper safety screen: no (the shared check on every answer still runs)

> You don't have to explain anything. Let's take one long breath out first, then look around the room together.

- **instruction** — Start with the long breath out. It's one breath, then another — you can stop whenever you want.

> You're here. Take your time leaving.

---

## 5. Sitting with not knowing

**The brief:** What I'm unsure about, 0–10 discomfort, one small way to let it stay unknown, 0–10 again.

- id: `ws_sitting_with_not_knowing`
- Library description: Let one unanswered question stay open, and see how it feels afterwards.
- opens: A — therapist-assigned
- load: light · about 5 minutes
- care plan label: anxiety_worry
- deeper safety screen: no (the shared check on every answer still runs)

> Some things don't have an answer yet. Trying to force one can keep you awake. This is a few minutes of letting a question stay open.

- **short text** — What are you unsure about?
  - required
  - helper: A few words. You don't have to explain the whole situation.
- **scale 0 10** — How uncomfortable does leaving it unknown feel?
- **short text** — One small way you'll let it stay unknown today
  - helper: Something you can actually do, or actually not do. "I'll wait until Thursday before deciding" counts. Checking it one more time doesn't.
- **scale 0 10** — And now, having written that?
- **closing reflection** — What do you notice?
  - helper: Optional.

> Not knowing for a while is not the same as giving up.

---

## 6. Big day planner

**The brief:** For exams, placements and interviews: the date, prep steps with dates, an on-the-day checklist, and what I want to remember.

- id: `ws_exam_career_pressure`
- Library description: Get the practical parts of a big day out of your head and onto one page.
- opens: S — the client can open it themselves
- load: light · about 10 minutes
- care plan label: anxiety_worry
- deeper safety screen: no (the shared check on every answer still runs)

> Big days take up a lot of room in your head. Putting the practical parts somewhere helps you keep your head for the day itself.

- **datetime** — When is it?
  - required
  - helper: The date is enough.
- **row list** — What needs doing before then?
  - helper: One step per line, with the day you will do it. Small steps are easier to keep.
  - column `step` (text): What
  - column `by_when` (datetime): By when
- **checklist** — On the day
  - helper: Tick these as they happen. Nothing here is a rule.
  - option: eat something before I go
  - option: leave earlier than I need to
  - option: take what I need with me
  - option: put my phone on silent
  - option: get there and sit down for a minute
  - option: plan something kind for afterwards
- **short text** — What do you want to remember on the day?
  - helper: One sentence you'd want to read at the door.
  - example: I've done the work. I just have to turn up.

> The day will go how it goes. You'll have done what you could.

---

## 7. Social situation prep

**The brief:** The situation, the prediction, 0–10 worry, one small thing to try. Afterwards: went as feared / better than feared / didn't do it, and what actually happened.

- id: `ws_social_situation_prep`
- Library description: Write the prediction before, and what actually happened after.
- opens: A — therapist-assigned
- load: light · about 10 minutes
- care plan label: anxiety_worry
- deeper safety screen: no (the shared check on every answer still runs)

> Before something social, the mind often writes the ending in advance. This is somewhere to write that ending down — and then, later, what actually happened.

- **short text** — What's the situation?
  - required
  - helper: A few words is enough.
  - example: Drinks with the team on Friday.
- **short text** — What do you think will happen?
  - helper: The version your mind keeps showing you, in its own words.
- **scale 0 10** — How worried do you feel about it?
- **short text** — One small thing you'll try
  - helper: Small is the point. Say one sentence. Stay ten minutes. Arrive and leave when you like.
- **choice** — If you have done it — how did it go?
  - helper: Leave this until afterwards. You can come back to this worksheet.
  - option: Went as feared
  - option: Better than feared
  - option: Didn't do it
- **short text** — What actually happened?
  - helper: Just what happened, in plain words.
  - shown when `outcome` is as_feared / better

> A prediction written down is a prediction you can check.

---

## 8. Pressure map

**The brief:** One line per area with expectations (studies, career, money, family, marriage, friends, future): who expects what, 0–10 how heavy, and whose expectation it mostly is.

- id: `ws_family_expectations`
- Library description: See where the pressure comes from, and whose expectation it really is.
- opens: A — therapist-assigned
- load: light · about 10 minutes
- care plan label: anxiety_worry
- deeper safety screen: no (the shared check on every answer still runs)

> A lot of pressure comes from what we think other people expect. Mapping it shows which of it is yours, and which you picked up somewhere else.

- **row list** — Which areas are carrying expectations?
  - helper: One line for each area that applies — studies, career, money, family, marriage, friends, the future. Skip the ones that carry nothing.
  - column `area` (choice): Area
    - Studies
    - Career
    - Money
    - Family
    - Marriage
    - Friends
    - The future
  - column `who` (text): Who expects what?
  - column `heavy` (scale_0_10): How heavy does it feel?
  - column `whose` (choice): Whose expectation is it mostly?
    - Mostly mine
    - Mostly other people's
- **closing reflection** — What do you notice, seeing them side by side?
  - helper: Optional.

> Naming whose expectation it is doesn't settle it. It does make it easier to see.

---

## 9. Exposure ladder (therapist-only)

**The brief:** Therapist-only. Built in the portal with the client: steps rated 0–100, unlocked one at a time. The client rates 0–100 before and after; above 79 shows grounding and a pause line.

- id: `ws_exposure_ladder`
- Library description: Therapist-built: graded steps, unlocked one at a time.
- opens: T — therapist-only: never a Library card, never assignable, never suggested by chat
- load: demanding · about 20 minutes
- care plan label: anxiety_worry
- deeper safety screen: no (the shared check on every answer still runs)

> Your therapist builds this ladder with you, in session. Each step is added together, and unlocked when you are both ready for it.

- **instruction** — You will see only the steps that have been unlocked for you. For each one, rate how difficult it feels before you try it, and again afterwards. If a step feels like too much on the day, it can wait.
- **scale 0 100** — Before you try this step, how difficult does it feel?
- **scale 0 100** — And afterwards?

> Each step is yours to take when you are ready.

---

## To approve

Reply with the worksheet names whose wording is approved, and any line you want
changed. Approval flips that row to `approved` in a new migration — the wording itself
is edited in `packages/shared-types/worksheets/<batch>.ts`, never in a screen.
