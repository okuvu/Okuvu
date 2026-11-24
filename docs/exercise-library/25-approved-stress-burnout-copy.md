# Stress & Burnout worksheets — approved wording

Generated from the catalogue in `packages/shared-types/worksheets`. Do not edit by
hand: change the catalogue, then regenerate.

**Status: approved.** The owner approved these ten in two rounds on 24 November 2026:
eight as written, and Unsent letter and Weighing it up after the revisions he asked
for. This document is the record of that approval; `02-approved-worksheet-copy.md`
remains the record for worksheets 1-16 (9 November 2026).

All ten go through the same safety check the journal uses on every written and spoken
answer. The Doomscroll log and the Unsent letter also carry the deeper screen (eating
and body, sleep, self-harm, harm to someone else). None asks for weight, body
measurements, calories, food amounts or medicines, and none adds answers into a total,
a level or a label.

---

## 1. What's on my plate

**The brief:** A list the client adds tasks to. For each task: Must do / Can wait / Can drop or hand off. Closing reflection.

- id: `ws_whats_on_my_plate`
- Library description: Put everything down in one place, then decide what can wait.
- opens: S — the client can open it themselves
- load: light · about 5 minutes
- care plan label: stress_burnout
- deeper safety screen: no (the shared check on every answer still runs)

> When everything is in your head at once, it can all feel equally urgent. Writing it down helps you see what's actually there — and what can wait.

- **row list** — What's on your plate right now?
  - helper: One thing per line. Anything counts — big, small, work, home, the message you keep meaning to send.
  - column `task` (text): What
  - column `plan` (choice): What I'll do with it
    - Must do
    - Can wait
    - Can drop or hand off
- **closing reflection** — Was anything easier to decide once you saw it written down?
  - helper: There's no right answer. This is just for you.

> You don't have to do all of it. Deciding what can wait is part of the work.

---

## 2. Basics check

**The brief:** Checklist of six basics, a 0–10 "how empty does my tank feel" slider, one basic to look after today. No food amounts.

- id: `ws_basics_check`
- Library description: A quick look at the everyday basics, and one to look after today.
- opens: S — the client can open it themselves
- load: light · about 3 minutes
- care plan label: stress_burnout
- deeper safety screen: no (the shared check on every answer still runs)

> When you're running on empty, the basics are usually the first to go — and the hardest to notice. This is a quick look, not a test.

- **checklist** — Which of these have you had in the last day or two?
  - helper: Tick what's true. Nothing here is graded.
  - option: slept enough
  - option: ate proper meals
  - option: moved my body
  - option: took a break
  - option: went outside
  - option: talked to someone
- **scale 0 10** — How empty does my tank feel?
- **short text** — One basic I'll look after today
  - helper: Pick the easiest one, not the most important one.
  - example: Go to bed by eleven. Text my sister back.

> One basic, done today, is worth more than a perfect plan for next week.

---

## 3. Rest break

**The brief:** Choose 2, 5 or 10 minutes, then the countdown timer with a permission-to-rest line. Optional closing reflection.

- id: `ws_rest_break`
- Library description: Stop for a few minutes on purpose, with nothing to show for it.
- opens: S — the client can open it themselves
- load: light · about 5 minutes
- care plan label: stress_burnout
- deeper safety screen: no (the shared check on every answer still runs)

> Rest is not a reward you earn after everything else is done. It's part of how you keep going.

- **choice** — How long do you want to stop for?
  - required
  - option: 2 minutes
  - option: 5 minutes
  - option: 10 minutes
- **countdown timer** — You have permission to stop. Nothing needs to be earned first.
  - helper: Sit, lie down, look out of the window. Doing nothing is the point.
  - runs for 120 seconds; start button: Start the 2 minutes
  - shown when `length` is two
- **countdown timer** — You have permission to stop. Nothing needs to be earned first.
  - helper: Put the phone down if you can. The world will still be there after.
  - runs for 300 seconds; start button: Start the 5 minutes
  - shown when `length` is five
- **countdown timer** — You have permission to stop. Nothing needs to be earned first.
  - helper: Ten minutes is a real rest, not a long one. You can stop earlier if you want.
  - runs for 600 seconds; start button: Start the 10 minutes
  - shown when `length` is ten
- **closing reflection** — Anything different after stopping for a moment?
  - helper: Optional. A word is enough.

> Stopping is a skill. You just practised it.

---

## 4. Boundary planner

**The brief:** Short answers: the situation, who it involves, what I want to say no to. Long answer: what I will say. 0–10 how hard this feels. Closing reflection.

- id: `ws_boundary_planner`
- Library description: Work out what you want to say no to, and the words to say it.
- opens: A — therapist-assigned
- load: light · about 10 minutes
- care plan label: stress_burnout
- deeper safety screen: no (the shared check on every answer still runs)

> A boundary is a sentence about what you can and can't do. It's easier to say when you've decided the words before you need them.

- **short text** — What's the situation?
  - helper: A few words is enough.
  - example: My manager keeps adding work at 7pm.
- **short text** — Who is it with?
  - helper: A name, a role, or just 'someone at home'.
- **short text** — What do you want to say no to?
  - example: Taking on another project this month.
- **long text** — What will you say? Write it the way you'd actually say it.
  - helper: Short and plain usually works better than a speech. You can change it after you've said it out loud once.
  - example: I can't take another project this month. I can start it in December.
- **scale 0 10** — How hard does this feel to say?
- **closing reflection** — What would make it a little easier to say?
  - helper: Where you say it, who is nearby, what you do straight afterwards.

> You're allowed to take up space in your own life.

---

## 5. Priority sorter

**The brief:** A list of tasks. Each one gets Urgent and important / Important, not urgent / Urgent, not important / Neither. Then pick the one to do first.

- id: `ws_priority_sorter`
- Library description: Sort what you are carrying into four boxes, then pick one to start.
- opens: A — therapist-assigned
- load: light · about 5 minutes
- care plan label: stress_burnout
- deeper safety screen: no (the shared check on every answer still runs)

> Not everything urgent is important, and not everything important is urgent. Sorting it takes a minute and saves a lot.

- **row list** — Add the things you're carrying.
  - helper: Urgent means it needs doing soon. Important means it matters to you. Most things are only one of the two.
  - column `task` (text): What
  - column `box` (choice): Which box
    - Urgent and important
    - Important, not urgent
    - Urgent, not important
    - Neither
- **short text** — Which one will you do first?
  - helper: One only. The rest can wait their turn.

> You don't have to do it all today. You just have to know what's first.

---

## 6. Doomscroll log

**The brief:** Date and time, how long (under 15 min / 15–60 min / over an hour), feelings before and after, what pulled me in.

- id: `ws_scrolling_log`
- Library description: Note when you scrolled, how long, and how it felt before and after.
- opens: S — the client can open it themselves
- load: light · about 3 minutes
- care plan label: stress_burnout
- deeper safety screen: yes

> Scrolling isn't a moral failure. It's easier to change when you can see what it does for you — and what it costs.

- **datetime** — When did this happen?
- **choice** — How long were you scrolling?
  - option: Under 15 minutes
  - option: 15–60 minutes
  - option: Over an hour
- **feelings picker** — How did you feel just before you picked up your phone?
  - feelings offered: sad, scared, angry, ashamed, happy, calm, numb, worried, panicky, unsafe, on edge
- **feelings picker** — And afterwards?
  - feelings offered: sad, scared, angry, ashamed, happy, calm, numb, worried, panicky, unsafe, on edge
- **short text** — What pulled you in?
  - helper: Boredom, a notification, a feeling you didn't want, a habit. All of these count.

> Noticing is the whole exercise. Nothing here has to be different next time.

---

## 7. Weekly load check

**The brief:** 0–10 for this week's load, a list of the biggest demands, a closing reflection. Past weeks read as a list in Past me: no graph, no score.

- id: `ws_weekly_load_check`
- Library description: Look at how much you carried this week, and what it was made of.
- opens: A — therapist-assigned
- load: light · about 5 minutes
- care plan label: stress_burnout
- deeper safety screen: no (the shared check on every answer still runs)

> Once a week, it helps to look at how much you were carrying — not to judge it, just to see it.

- **scale 0 10** — How heavy did this week feel?
- **row list** — What were the biggest things you carried this week?
  - helper: Work, people, money, health, things you kept saying you would do.
  - column `demand` (text): What
- **closing reflection** — What do you notice, looking at this week?
  - helper: You can see your past weeks in Past me, under this worksheet.

> However heavy the week was, you carried it. That counts.

---

## 10. Caring load check

**The brief:** Checklist of caring tasks, 0–10 how stretched I feel, one bit of help I could ask for.

- id: `ws_caring_load_check`
- Library description: Name the caring you carry, and one bit of help you could ask for.
- opens: A — therapist-assigned
- load: light · about 5 minutes
- care plan label: stress_burnout
- deeper safety screen: no (the shared check on every answer still runs)

> Looking after other people is real work, even when nobody counts it as work. This is a place to put it down for a minute.

- **checklist** — Which of these are you carrying at the moment?
  - helper: Tick as many as are true. Some of them are easy to miss.
  - option: looking after a family member
  - option: the household
  - option: money and bills
  - option: emotional support for someone
  - option: appointments and paperwork
  - option: something else
- **scale 0 10** — How stretched do you feel?
- **short text** — One bit of help you could ask for
  - helper: It can be small. Someone else making dinner once. An hour to yourself.

> Asking for help is part of caring, not a break from it.

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
