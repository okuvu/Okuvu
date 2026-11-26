# "All" worksheets — approved wording

Generated from `packages/shared-types/worksheets/all-plans.ts`. Do not edit by hand:
change the catalogue, then regenerate.

**Status: approved and switched on.** The owner approved these four on 26 November
2026 and asked for them to be switched on the same day. The catalogue says
`approved`; rows in a deployed database are moved by their own migration
(`20261126130000_approve_all_plans_extras`), so a database that already ran the
drafts migration gets the approved wording and the current script timing, not a
stale body.

All four go through the same safety check the journal uses on every written and
spoken answer, with the same response. The Sleep check also carries the deeper
screen the owner named on 24 November 2026: skipping meals, restricting food,
making yourself sick, exercising to punish yourself, hating your body, days
without sleep, wanting not to wake up, wanting to hurt someone, and self-harm.

None of them asks for weight, body measurements, calories, food amounts or
medicines — the Sleep check deliberately has no medicine field — and none of them
adds answers into a total, a level or a label.

Unclench and My calm place are audio-guided in intent. No audio ships: the script
is read on screen one line at a time and nothing is recorded. The timing is the
owner's, set on 26 November 2026 — a line stays long enough to read it (one
second for every three words, never less than six), a line that says "hold" adds
five seconds for the hold, and every line is followed by ten seconds of quiet with
the line still on screen. The running times below are computed from the lines in
this document with the same rule the app uses.

---

## Running time

**Unclench** — 2 min 25 sec (145 seconds), 7 lines.

| Line | Words | Read | Hold | Quiet | On screen |
| --- | --- | --- | --- | --- | --- |
| Get comfortable, sitting or lying down. Let your hands rest. Breathe out slowly, and let your shoulders drop a little. | 20 | 7s | — | 10s | 17s |
| Hands and arms. Make two loose fists and tighten your arms, just a little. Hold… and let go. Notice how your hands feel now. | 24 | 8s | 5s | 10s | 23s |
| Shoulders. Lift them up towards your ears. Hold them there… and drop them. Feel how far they fall. | 18 | 6s | 5s | 10s | 21s |
| Face. Scrunch it up: eyes, forehead, jaw. Hold… and let go. Let your teeth come slightly apart. | 17 | 6s | 5s | 10s | 21s |
| Stomach. Tighten it gently, like you're bracing. Hold… and soften. Let your breath reach your belly. | 16 | 6s | 5s | 10s | 21s |
| Legs and feet. Point your toes and tighten your legs. Hold… and release. Let them feel heavy. | 17 | 6s | 5s | 10s | 21s |
| Now all of you together, gently. Hold… and let everything go. One long breath out. | 15 | 6s | 5s | 10s | 21s |

**My calm place** — 1 min 23 sec (83 seconds), 5 lines.

| Line | Words | Read | Hold | Quiet | On screen |
| --- | --- | --- | --- | --- | --- |
| Get comfortable. Close your eyes if that feels okay, or rest your eyes on one spot on the floor. Breathe out slowly. | 22 | 8s | — | 10s | 18s |
| Look around. What do you see? Colours, light, the shape of things. | 12 | 6s | — | 10s | 16s |
| Listen. What can you hear? Rain, waves, quiet, someone humming in the next room. | 14 | 6s | — | 10s | 16s |
| Feel it. The air on your skin, what's under you, warm or cool. | 13 | 6s | — | 10s | 16s |
| Stay a little longer. Nothing is expected of you here. When you're ready, take one slow breath and open your eyes. | 21 | 7s | — | 10s | 17s |

---

## 1. Where do I feel it?

**The brief:** The body outline piece. The client taps where they feel something, then uses the feelings picker for that spot. No strength rating: the approved copy asks only where and what.

- id: `ws_body_map`
- Library description: Feelings often show up in your body first. Find where.
- opens: S — the client can open it themselves
- load: light · about 5 minutes
- care plan label: all
- deeper safety screen: no (the shared check on every answer still runs)

> Before you have words for a feeling, your body often already knows. A tight chest. A knot in your stomach. Shoulders up near your ears. Tap where you notice something.

- **body outline** — Where do you feel it right now?
  - required
  - helper: Tap up to three spots. If you can't find anything, that's okay too.
  - when the limit is reached: You can pick up to three. Tap a spot again to remove it.
  - feelings offered: sad, scared, angry, ashamed, happy, calm, numb, worried, panicky, unsafe, on edge

> Now you know where it sits. Next time it turns up, you might notice it sooner.

---

## 2. Sleep check

**The brief:** Bedtime, wake time, 0–10 how rested, screens before bed (yes/no), short notes. No medicine field. The deeper safety screen applies.

- id: `ws_sleep_diary`
- Library description: Two minutes each morning. See how your sleep and your days connect.
- opens: S — the client can open it themselves
- load: light · about 3 minutes
- care plan label: all
- deeper safety screen: yes

> Bad sleep makes everything feel heavier, and when you're tired it's hard to see why. Jot down last night in under two minutes. A rough night is worth writing down too.

- **datetime** — Which night are you writing about?
  - required
  - helper: Usually last night.
- **datetime** — When did you get into bed?
- **datetime** — When did you actually get up?
  - helper: Getting up, not waking up. They're often different.
- **scale 0 10** — How rested do you feel?
- **choice** — Were you on your phone or a screen in the hour before bed?
  - helper: No judgement. Most of us were.
  - option: Yes
  - option: No
- **short text** — Anything about last night worth remembering?
  - helper: Woke up a lot, mind racing, a late-night call, a noisy house. A few words is enough.

> Done for today. Over a few mornings, you may start to see how your nights and days connect.

---

## 3. Unclench

**The brief:** Audio-guided. Tense and release each part of the body in turn. Script only — nothing recorded until the words and the voice are approved.

- id: `ws_muscle_relaxation`
- Library description: You're probably holding more tension than you think. Five minutes to let it go.
- opens: S — the client can open it themselves
- load: light · about 5 minutes
- care plan label: all
- deeper safety screen: no (the shared check on every answer still runs)

> Stress hides in your body: a clenched jaw, tight shoulders, fists you didn't know you were making. You'll gently tighten one part at a time, then let it go. Nothing should hurt. Skip any part that's sore or injured.

- **instruction** — Get comfortable, sitting or lying down. Let your hands rest. Breathe out slowly, and let your shoulders drop a little.
- **instruction** — Hands and arms. Make two loose fists and tighten your arms, just a little. Hold… and let go. Notice how your hands feel now.
- **instruction** — Shoulders. Lift them up towards your ears. Hold them there… and drop them. Feel how far they fall.
- **instruction** — Face. Scrunch it up: eyes, forehead, jaw. Hold… and let go. Let your teeth come slightly apart.
- **instruction** — Stomach. Tighten it gently, like you're bracing. Hold… and soften. Let your breath reach your belly.
- **instruction** — Legs and feet. Point your toes and tighten your legs. Hold… and release. Let them feel heavy.
- **instruction** — Now all of you together, gently. Hold… and let everything go. One long breath out.
- **scale 0 10** — How does your body feel now?

> That's it. Check in with your jaw and shoulders again later today.

---

## 4. My calm place

**The brief:** Audio-guided. Build a calm place in the mind and return to it. Script only — nothing recorded until the words and the voice are approved.

- id: `ws_safe_place`
- Library description: Build a place in your head you can go to when things get too loud.
- opens: S — the client can open it themselves
- load: light · about 10 minutes
- care plan label: all
- deeper safety screen: no (the shared check on every answer still runs)

> Think of a place where you feel calmer. It can be real or made up: your nani's kitchen, a quiet beach, your bed on a rainy afternoon. You'll spend a few minutes there. If anything feels uncomfortable, open your eyes and stop. You can come back another time.

- **short text** — Where's your place?
  - required
  - helper: A few words is enough. If nowhere real feels calm, make one up. That's completely fine.
- **instruction** — Get comfortable. Close your eyes if that feels okay, or rest your eyes on one spot on the floor. Breathe out slowly.
- **instruction** — Look around. What do you see? Colours, light, the shape of things.
- **instruction** — Listen. What can you hear? Rain, waves, quiet, someone humming in the next room.
- **instruction** — Feel it. The air on your skin, what's under you, warm or cool.
- **instruction** — Stay a little longer. Nothing is expected of you here. When you're ready, take one slow breath and open your eyes.
- **scale 0 10** — How do you feel now?

> Your place is yours. You can come back to it any time.

---
