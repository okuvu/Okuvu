# "All" worksheets — draft wording for review, NOT approved

Generated from `packages/shared-types/worksheets/all-plans.ts`. Do not edit by hand:
change the catalogue, then regenerate.

**Status: drafts.** These 4 worksheets are written and none of them is
approved. Every one is switched off for clients: no card in their Library, no direct
open, no assignment from the portal. A therapist can preview them. Nothing is switched
on until you say the wording is approved.

All four go through the same safety check the journal uses on every written and spoken
answer, with the same response. The Sleep diary also carries the deeper screen you named
on 24 November 2026: skipping meals, restricting food, making yourself sick, exercising
to punish yourself, hating your body, days without sleep, wanting not to wake up,
wanting to hurt someone, and self-harm.

None of them asks for weight, body measurements, calories, food amounts or medicines —
the Sleep diary deliberately has no medicine field — and none of them adds answers into
a total, a level or a label.

Muscle relaxation and Safe place are audio-guided in intent. Nothing is recorded: the
bodies below are the scripts you have to approve, and the voice is a separate decision.

---

## 1. Body map

**The brief:** The body outline piece. Tap where you feel something, then use the feelings picker for that spot, with how strong it is there.

- id: `ws_body_map`
- Library description: Mark where in the body a feeling shows up, and how strong it is there.
- opens: S — the client can open it themselves
- load: light · about 5 minutes
- care plan label: all
- deeper safety screen: no (the shared check on every answer still runs)

> Feelings show up in the body before we have words for them — a tight chest, a heavy stomach, shoulders up by the ears. Tap wherever you notice something today. There's no right place to find.

- **body outline** — Where do you notice something right now?
  - required
  - helper: Tap as many places as fit, up to three. Nothing has to be there.
  - feelings offered: sad, scared, angry, ashamed, happy, calm, numb, worried, panicky, unsafe, on edge

> You noticed where it lives. That is often the first step to it easing.

---

## 2. Sleep diary

**The brief:** Bedtime, wake time, 0–10 how rested, screens before bed (yes/no), short notes. No medicine field. The deeper safety screen applies.

- id: `ws_sleep_diary`
- Library description: Record sleep and wake times and how the day felt, to spot a pattern.
- opens: S — the client can open it themselves
- load: light · about 3 minutes
- care plan label: all
- deeper safety screen: yes

> Sleep and mood pull on each other, and it's hard to see the pattern from inside a tired week. A short note each morning is enough — this isn't a test, and a bad night is still useful information.

- **datetime** — Which night is this?
  - required
  - helper: The night you are writing about.
- **datetime** — What time did you get into bed?
- **datetime** — What time did you get up?
  - helper: Getting up, not waking — they are often different.
- **scale 0 10** — How rested do you feel today?
- **choice** — Were you on a screen in the hour before bed?
  - option: Yes
  - option: No
- **short text** — Anything worth noting about last night?
  - helper: Waking in the night, a racing mind, a late message, something on your mind. A few words is enough.

> One night is a data point, not a verdict. The pattern is what helps.

---

## 3. Muscle relaxation

**The brief:** Audio-guided. Tense and release each part of the body in turn. Script only — nothing recorded until the words and the voice are approved.

- id: `ws_muscle_relaxation`
- Library description: Tense and release each part of the body in turn, guided step by step.
- opens: S — the client can open it themselves
- load: light · about 10 minutes
- care plan label: all
- deeper safety screen: no (the shared check on every answer still runs)

> When the body holds tension for a long time, it stops noticing it. This is a few minutes of tensing each part gently, then letting it go — so the difference becomes something you can feel again. Nothing here should hurt. If a part is injured, skip it.

- **instruction** — Sit or lie somewhere comfortable. Let your hands rest. Take one slow breath out, and let your shoulders drop.
- **instruction** — Make a loose fist with both hands and gently tighten your arms. Hold for a moment — not hard, just enough to feel it. Now let go completely. Notice the difference for a few seconds.
- **instruction** — Lift your shoulders towards your ears and hold them there. Then let them fall. Feel how far down they go when you stop holding them.
- **instruction** — Scrunch your face gently — eyes, jaw, forehead. Hold, then release. Let your jaw come slightly apart.
- **instruction** — Tighten your stomach muscles gently, as if bracing. Hold, then let them soften. Let your breath go low into your belly.
- **instruction** — Point your toes away and tighten your legs. Hold, then release. Let your legs feel heavy where they are.
- **instruction** — Now the whole body at once, gently. Hold for a moment, then let everything go and breathe out slowly.
- **scale 0 10** — How does your body feel now?

> You don't have to carry it all in your muscles. Come back to this whenever the tension builds.

---

## 4. Safe place

**The brief:** Audio-guided. Build a calm place in the mind and return to it. Script only — nothing recorded until the words and the voice are approved.

- id: `ws_safe_place`
- Library description: Build a calm place in your mind, guided, to return to when things feel too much.
- opens: S — the client can open it themselves
- load: light · about 10 minutes
- care plan label: all
- deeper safety screen: no (the shared check on every answer still runs)

> Somewhere in your mind there is a place that feels calmer than here. It can be real or made up, somewhere you have been or somewhere you would like to be. We're going to spend a few minutes there.

- **instruction** — Sit or lie somewhere comfortable. Let your eyes close if that feels alright, or soften your gaze. Take one slow breath out.
- **short text** — Where is your place?
  - required
  - helper: A room, a beach, a hill, a corner of someone's house, somewhere you invent. A few words is enough.
- **instruction** — Picture it now. What can you see there — colours, light, the shape of things? Take a moment to look around it slowly.
- **instruction** — What can you hear in this place? Maybe it is quiet. Let the sounds be there without needing to change them.
- **instruction** — What does it feel like on your skin — the air, the ground under you, the temperature? Let yourself settle into that.
- **instruction** — Stay here a little longer. Nothing is needed from you in this place. When you are ready, take one slow breath and come back.
- **scale 0 10** — How do you feel now?

> This place is yours. You can come back to it whenever you need somewhere to put yourself down.

---
