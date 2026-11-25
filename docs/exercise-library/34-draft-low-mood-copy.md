# Low Mood worksheets — draft wording for review, NOT approved

Generated from `packages/shared-types/worksheets/low-mood.ts`. Do not edit by hand:
change the catalogue, then regenerate.

**Status: drafts.** These 9 worksheets are written and none of them is
approved. Every one is switched off for clients: no card in their Library, no direct
open, no assignment from the portal. A therapist can preview them. Nothing is switched
on until you say the wording is approved.

All nine go through the same safety check the journal uses on every written and spoken
answer, with the same response. Meet the inner critic and the Comparison check also
carry the deeper screen you named on 24 November 2026: skipping meals, restricting
food, making yourself sick, exercising to punish yourself, hating your body, days
without sleep, wanting not to wake up, wanting to hurt someone, and self-harm.

None of them asks for weight, body measurements, calories, food amounts or medicines,
and none of them adds answers into a total, a level or a label. The one log reads back
in words only: no score, no average, no ranking of feelings.

---

## 1. One small thing

**The brief:** For heavy days: one tiny action from six options, or your own. Then did it / not this time, with a warm line either way.

- id: `ws_one_small_thing`
- Library description: One tiny thing for a heavy day. Tiny is the point.
- opens: S — the client can open it themselves
- load: light · about 3 minutes
- care plan label: low_mood
- deeper safety screen: no (the shared check on every answer still runs)

> On a heavy day, the list of everything you should be doing can be the heaviest thing of all. Let's shrink it to one small thing — something so small it almost feels too easy.

- **choice** — What's one small thing you could do right now?
  - required
  - helper: Pick whatever feels possible today. Nothing here is too small.
  - option: Drink a glass of water
  - option: Open a window
  - option: Wash my face
  - option: Step outside for two minutes
  - option: Message one person
  - option: Put on one song
  - option: Something of my own
- **short text** — What's your small thing?
  - required
  - helper: Anything at all. It only has to be doable today.
  - shown when `pick` is something_else
- **choice** — Did it happen?
  - helper: Both answers are fine.
  - option: Did it
  - option: Not this time

> Either way, you showed up on a heavy day. That isn't nothing.

---

## 2. Mood and activity log

**The brief:** A list of entries: time, what I was doing, feelings. A weekly view in words of which activities came with better feelings, with no score.

- id: `ws_mood_activity_log`
- Library description: Note what you were doing and how it felt, then read the week in your own words.
- opens: S — the client can open it themselves
- load: light · about 5 minutes
- care plan label: low_mood
- deeper safety screen: no (the shared check on every answer still runs)

> How you feel and what you're doing are more connected than they look. Log a few moments across the week, and you can read back which things tended to come with which feelings.

- **datetime** — When was this?
  - required
- **short text** — What were you doing?
  - required
  - helper: A few words is plenty — "chai with a friend", "walk after dinner", "scrolling in bed".
- **feelings picker** — How did you feel?
  - required
  - helper: Pick up to three.
  - feelings offered: sad, scared, angry, ashamed, happy, calm, numb, worried, panicky, unsafe, on edge
- **closing reflection** — Anything you notice, looking back over the week?
  - helper: There's no right answer. This is just for you.

> Each entry is one moment. It is not a verdict on the week.

**Read back:** the last 7 days of this worksheet's own entries, grouped by the words in `doing` and listing the feelings picked in `feelings`. In words only: no score, no average, no ranking of feelings.

---

## 3. Strengths spotting

**The brief:** A checklist of strengths, then one recent time you used one.

- id: `ws_strengths`
- Library description: Notice what you're already good at, and one time you used it.
- opens: S — the client can open it themselves
- load: light · about 5 minutes
- care plan label: low_mood
- deeper safety screen: no (the shared check on every answer still runs)

> Low mood makes strengths hard to see. They stop feeling like strengths and start feeling like nothing special. They are still there. This is a few minutes of looking properly.

- **checklist** — Which of these are true of you, at least some of the time?
  - helper: Tick as many as fit. This isn't boasting — it's just true.
  - option: Kind
  - option: Loyal
  - option: Funny
  - option: A good listener
  - option: Curious
  - option: Patient
  - option: Honest
  - option: Creative
  - option: Determined
  - option: Thoughtful
  - option: Practical
  - option: Brave
- **short text** — One time recently you used one of them
  - required
  - helper: Even a small time counts — holding a door, remembering something, saying no.

> You didn't have to become someone else to have these. They were already yours.

---

## 4. Things I might enjoy

**The brief:** A checklist of everyday ideas for young people in India. The picked ones are carried into the existing Small things planner, which is not changed.

- id: `ws_things_i_might_enjoy`
- Library description: Everyday things worth trying, and a way to carry the ones you pick into your planner.
- opens: S — the client can open it themselves
- load: light · about 5 minutes
- care plan label: low_mood
- deeper safety screen: no (the shared check on every answer still runs)

> When you've felt low for a while, it's easy to forget what you actually enjoy, or to believe nothing would help anyway. Here are some ordinary things. Tick anything that sounds even slightly possible.

- **checklist** — Which of these might be worth a try?
  - helper: Nothing here is a rule, and nothing has to be done today.
  - option: Chai with a friend
  - option: A walk, anywhere
  - option: Cooking something simple
  - option: A game — phone, board or cards
  - option: Music, loud or quiet
  - option: Calling a cousin
  - option: Street food you like
  - option: A cycle ride
  - option: Cricket, watching or playing
  - option: Sitting on the terrace at sunset
  - option: Drawing or doodling
  - option: A film with someone

> Picking is the easy half. When you're ready, the planner is somewhere to put the ones you chose.

**Carries over:** the options picked in `ideas` are seeded into `ws_small_things`'s own unsaved draft (its `plan` list, in the `what` column), and that worksheet opens prefilled. Button: "Take these to my Small things planner". Nothing is saved on the client's behalf, no row they already wrote is overwritten, and the target worksheet is unchanged.

---

## 5. Tiny steps ladder

**The brief:** The problem, a list of steps from smallest to biggest, and a date for the first step.

- id: `ws_tiny_steps`
- Library description: Turn one big thing into steps, from the smallest to the biggest.
- opens: A — therapist-assigned
- load: light · about 10 minutes
- care plan label: low_mood
- deeper safety screen: no (the shared check on every answer still runs)

> A big task stays impossible while it's still one big task. Broken into steps, the first one is usually something you could do today.

- **short text** — What's the thing you've been putting off?
  - required
  - helper: One line. It doesn't have to be worded well.
- **row list** — What are the steps, smallest first?
  - helper: Start with something almost too easy. The last one can be big — you won't be doing it today.
  - column `step` (text): Step
- **datetime** — When will you do the first one?
  - helper: A day is enough. If it slips, it slips — you can change it.
- **closing reflection** — Which step feels most doable right now?

> You don't have to climb it today. You just have to know where the first step is.

---

## 6. Meet the inner critic

**The brief:** Name the critic, what it usually says, when it is loudest, what it protects you from, and what you would say back in your own words. High load.

- id: `ws_inner_critic`
- Library description: Get to know the critical voice — what it says, and what you'd say back.
- opens: A — therapist-assigned
- load: demanding · about 15 minutes
- care plan label: low_mood
- deeper safety screen: yes

> Most people have a voice inside that is harsher than they would ever be to a friend. This is a place to describe it properly, as something separate from you, with its own habits.

- **short text** — If this voice had a name, what would it be?
  - required
  - helper: Something silly is fine. A name makes it easier to hear as one voice rather than the truth.
- **long text** — What does it usually say?
  - required
  - helper: Write it the way it actually speaks, as harsh as it is. Nothing here is edited or softened.
- **short text** — When is it loudest?
  - helper: A time of day, a situation, a kind of person. Anything you have noticed.
- **short text** — What might it be trying to protect you from?
  - helper: Critics often started as protection. There's no right answer here.
- **short text** — What would you like to say back to it?
  - helper: In your own words. It doesn't have to be kind — it just has to be yours.

> You named it, so it's a voice now, not the truth about you.

---

## 7. Reconnect planner

**The brief:** A list of people you miss. Pick one, choose how to reach out and a date. Afterwards: did it / not yet.

- id: `ws_reconnect_planner`
- Library description: Pick someone you miss, choose how to reach out, and set a day.
- opens: A — therapist-assigned
- load: light · about 10 minutes
- care plan label: low_mood
- deeper safety screen: no (the shared check on every answer still runs)

> When you've been low, people can drift without anyone deciding to. Picking one person and one small way to reach out is easier than trying to fix everything at once.

- **row list** — Who do you miss?
  - helper: One name per line. No need to say why.
  - column `who` (text): Who
- **choice** — How would you like to reach out?
  - helper: The smallest one that feels possible is the right one.
  - option: A message
  - option: Send a meme
  - option: A call
  - option: Meet up
- **datetime** — When?
- **choice** — How did it go?
  - helper: Not yet is fine. It stays here for whenever you're ready.
  - option: Did it
  - option: Not yet

> Reaching out once doesn't undo the distance. It's still a start.

---

## 8. Comparison check

**The brief:** Where you were, how it left you feeling, what you compared yourself to, what the post does not show, one small thing now. High load. No weight, body or food fields.

- id: `ws_comparison_check`
- Library description: Look at where comparison happens, what it leaves out, and one small thing to do now.
- opens: A — therapist-assigned
- load: demanding · about 10 minutes
- care plan label: low_mood
- deeper safety screen: yes

> Comparing yourself to other people is close to automatic, and phones make it constant. This is a few minutes of looking at it closely, without deciding you should stop feeling it.

- **choice** — Where were you when it happened?
  - required
  - option: Instagram
  - option: YouTube
  - option: College
  - option: Family
  - option: Somewhere else
- **feelings picker** — How did it leave you feeling?
  - required
  - helper: Pick up to three.
  - feelings offered: sad, scared, angry, ashamed, happy, calm, numb, worried, panicky, unsafe, on edge
- **short text** — What were you comparing yourself to?
  - required
  - helper: A post, a person, a way someone's life looked.
- **short text** — What doesn't that post or person show?
  - helper: Everyone's day has parts nobody photographs.
- **short text** — One small thing you'll do now
  - helper: Something for you, not for how it looks. Closing the app counts.

> You saw it clearly for a minute. That's the skill, and it gets easier with practice.

---

## 9. The morning after a miracle

**The brief:** If things got better overnight, what would you notice first? Where you are now on 0–10, and what one step up would look like.

- id: `ws_miracle_question`
- Library description: Imagine things had changed overnight, and find the first small step.
- opens: A — therapist-assigned
- load: light · about 10 minutes
- care plan label: low_mood
- deeper safety screen: no (the shared check on every answer still runs)

> This is an old question and it still works. Imagine you go to sleep tonight and, while you sleep, the problem gets easier — not solved, just easier. You wake up and nobody has explained anything to you.

- **long text** — What would you notice first, before anyone told you anything?
  - required
  - helper: Small and ordinary is good — what you'd see, who you'd speak to, what you'd do differently.
- **scale 0 10** — Where are you now, on the way to that morning?
- **short text** — What would one step up from here look like?
  - helper: One step. Not the whole way.

> You don't need the whole picture. One step you can actually see is enough to move.

---

## To approve

Reply with the worksheet names whose wording is approved, and any line you want
changed. Approval flips that row to `approved` in a new migration: the wording itself
is edited in `packages/shared-types/worksheets/low-mood.ts`, never in a screen.
