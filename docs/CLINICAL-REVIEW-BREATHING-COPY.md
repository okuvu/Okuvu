# Breathing exercises — clinical copy review (round 2)

**What this is.** The Breathe section now carries a written explanation behind an (i) on each
technique, plus new pause/break wording. Rajwant's instruction on 4 Nov 2026 was explicit: send the
explanations to Dr Shubhangi Goswami and only put them in the app once she approves the script.

**State: APPROVED WITH CHANGES — v2.0.0 (3 Nov 2026, 19:15 UTC).** She approved the drop-down and
the (i) panel as described, replaced the technique set and the wording, and answered all three
questions. Her text, as it now ships, is in the appendix at the end of this document; v1.0.0 below is
kept only as the record of what was sent.

| Item | Value |
| --- | --- |
| Reviewer | Dr Shubhangi Goswami (clinical authority — `docs/00a-clinical-authority.md`) |
| Copy version | 1.0.0 |
| Sent | 4 Nov 2026, 00:24 IST / 3 Nov 2026 18:54 UTC |
| To / Cc | alphashubhangi@gmail.com / Rajwant@suvoksystem.com |
| From | okuvu &lt;admin@okuvu.in&gt; |
| Gmail message id | `1a1a2c3077d1bc02` |
| Bounce check | none (searched mailer-daemon / postmaster / Delivery Status Notification, no hits) |
| Reply | **Yes — 3 Nov 2026 19:15 UTC**, message id `1a1a2d6769fe9e01`: "Approved with changes" |

## What was asked of her

1. Are the four explanations right for our clients — anything to change, soften or take out?
2. Are the counts right as the normal pace (the three Slower/Standard/Faster paces are being
   removed)? Guided breathing 4-2-6 and extended exhale 4-2-8 are now very close — drop one, or
   make one clearly different?
3. Are 10 breaths per pause, and 30 as the ceiling for one sitting, about right? Should the typed
   answer be kept for the therapist, or left as a private moment that is not stored?

The app currently does **not** store the typed answer — it is a moment of reflection, and the copy
does not promise otherwise. If she asks for it to be kept, that is a server change and a separate row.

## 1. Box breathing — 4 in, 4 hold, 4 out, 4 hold

**What it is** — Four equal parts, one after another — breathe in, hold, breathe out, hold — like
walking round the four sides of a square.

**How to do it** — Breathe in through your nose for 4. Hold for 4. Breathe out through your nose or
your mouth for 4. Hold for 4. Then start the next round straight away. The shape on the screen grows
as you breathe in, waits while you hold, and shrinks as you breathe out, so you can follow it instead
of counting.

**Why it is taught** — The counting gives your attention something steady to hold on to, and an even
rhythm is easier to keep even when your mind is not. It is usually the first technique taught. Use it
when you notice yourself tensing, before something you are dreading, or when you want to come back to
the room you are in.

**If 4 feels too long** — Keep the same shape with 3.

## 2. Guided breathing — 4 in, 2 hold, 6 out

**What it is** — A slow breath with a longer out-breath — in for 4, a short pause of 2, out for 6.

**How to do it** — Breathe in through your nose for 4. Hold for 2. Breathe out through your mouth for
6, as if you were fogging a mirror. No gap — the next breath starts from the end of the out-breath.
The circle grows on the in-breath, stays still for the hold, and shrinks on the out-breath.

**Why it is taught** — The long out-breath is the part that settles fast, shallow breathing. Use it
when you notice your breathing has moved high into your chest, or when you want something slow to
follow rather than something to count.

## 3. Physiological sigh — 2 in, 2 more in, 8 out

**What it is** — Two breaths in through the nose — one ordinary, then a second small sip on top —
followed by one long sigh out through the mouth. It is the breath the body takes by itself after
crying or after a fright.

**How to do it** — Breathe in through your nose for 2. Without breathing out, take a second short
breath in on top of it, for 2. Then let a long, slow breath out through your mouth, for 8. No hold.
The next round starts straight away.

**Why it is taught** — When you are already wound up, a slow counted breath can feel impossible. The
second small breath in refills the tiny air sacs in the lungs that close up when you are tense, and
the long breath out is the release. Use it when you are already activated — not when you are calm.

## 4. Extended exhale — 4 in, 2 hold, 8 out

**What it is** — In for 4, hold for 2, out for 8 — the out-breath twice as long as the in-breath.

**How to do it** — Breathe in through your nose for 4. Hold for 2. Breathe out through your mouth or
nose for 8, slowly and without forcing it. If the 8 runs out before the circle has finished
shrinking, keep breathing out gently until it does rather than pushing.

**Why it is taught** — Same family as guided breathing, with a longer hold and a longer out-breath.
Choose it when you have the time to let the out-breath do most of the work — before sleep, or when
you cannot settle.

## Pause and break copy

- After every 10 breaths — **"Let's pause here. How are you feeling?"**, an optional free-text box,
  and two buttons: **Continue** and **Stop for now**.
- After 30 breaths — **"That's 30 breaths. A good place to stop."** / "Take a break and come back to
  it later — breathing practice works better in short sittings than in one long one." One button:
  **Start again**.
- Stopping early — **"You stopped at 12 breaths."** / "Come back whenever you like."

## When she replies

Record her own words and the message id here and in `breathingCopyReview`
(`breathing_content.dart`: `approvedOn`, `approvalMessageId`), then flip change-log row 10 from
`In progress` to `Ready`. If she changes any wording, bump the version to 1.1.0 and re-send — an old
sign-off must never be spent on new words.

---

# Appendix — v2.0.0, approved with changes (3 Nov 2026, 19:15 UTC)

Message id `1a1a2d6769fe9e01`, thread `1a1a2c3077d1bc02`, from alphashubhangi@gmail.com. What she
changed, in her own framing:

> "Guided breathing (4-2-6) and Extended exhale (4-2-8) are essentially the same exercise, so I would
> like four that are clearly different from each other, both to do and to watch. Please use the text
> below exactly."

The set: **Box breathing**, **Physiological sigh**, **Extended exhale** (replacing both Guided and
Extended) and **Humming breath** (new). The app's rendering of each is `breathing_content.dart`
version 2.0.0.

## Visuals (hers, one per technique)

- Box breathing: a dot travelling around the four sides of a square.
- Physiological sigh: a circle that fills, swells a little more, then empties slowly — guided by
  words, not numbers.
- Extended exhale: a wave that rises quickly and falls slowly, like a tide going out.
- Humming breath: ripples spreading outward from the centre during the hum.

## 1. Box breathing — 4 in, 4 hold, 4 out, 4 hold

**What it is:** Four equal parts – breathe in, hold, breathe out, hold – like walking around the four
sides of a square.

**How to do it:** Breathe in through your nose for 4. Hold for 4. Breathe out for 4. Hold for 4. Then
begin again. Follow the dot as it moves around the square, so you do not have to count.

**Why it helps:** Counting gives your attention something steady to hold on to, and an even rhythm is
easier to keep when your mind is not. Use it when you notice yourself tensing, before something you
are dreading, or when you want to come back to the room you are in.

**If 4 feels too long:** keep the same shape with 3. If holding your breath feels uncomfortable, skip
the holds.

## 2. Physiological sigh — a full breath in, a little more, a long breath out

**What it is:** A deep breath in through the nose until your lungs feel full, a small extra sip of air
on top, then one long sigh out through the mouth. It is the breath your body takes by itself after
crying or a fright.

**How to do it:** Breathe in through your nose and fill your lungs – take as long as you need. When you
feel full, take one more small sip of air on top. Then let it all go in a long, slow breath out through
your mouth, longer than your breath in. No holding. Go at your own pace; the screen is a guide, not a
rule.

**Why it helps:** When you are already wound up, a slow counted breath can feel impossible. This one
works with how your body already wants to breathe, and the long sigh out is the release. Use it when
you are already activated – not when you are calm. A few sighs are usually enough.

**If you feel light-headed:** stop and breathe normally for a moment.

Build note from her: no numbers on screen; three word cues in sequence — "Fill your lungs… in", "and a
little more", "now breathe out" — with the timing unhurried (roughly 4 seconds in, 1 for the top-up,
8 out).

## 3. Extended exhale — 4 in, 8 out

**What it is:** A slow breath where the out-breath is twice as long as the in-breath. No hold.

**How to do it:** Breathe in through your nose for 4. Breathe out slowly through your mouth or nose for
8, gently, without forcing it. Follow the wave – it rises as you breathe in and falls slowly as you
breathe out.

**Why it helps:** A long out-breath is one of the simplest ways to slow fast, shallow breathing. Use it
when your breathing has moved high into your chest, before sleep, or when you cannot settle.

**If 8 feels too long:** breathe out for 6. Never push the last bit of air out.

## 4. Humming breath — 4 in, 6 hum out

**What it is:** Breathe in through your nose, then breathe out with a soft, steady hum, lips gently
closed. You may know it from yoga as bhramari, the bee breath.

**How to do it:** Breathe in through your nose for 4. Close your lips and breathe out with a low,
comfortable hum for 6 – you should feel a gentle buzz in your face and chest. Watch the ripples spread
while you hum. Then breathe in and begin again.

**Why it helps:** The hum slows your out-breath for you without counting, and the buzz gives your mind
something to feel instead of think. Use it when your thoughts are racing and counting is not working.

**If you cannot make sound where you are:** hum very softly, or switch to Extended exhale.

## Her answer on pacing, ceiling and the typed answer

- **Pacing:** 10 breaths per pause for Box, Extended exhale and Humming (about 2–3 minutes). For the
  Physiological sigh, **pause after 5**, as repeated sighing can cause light-headedness.
- **Ceiling:** keep 30, but do not stop the person outright — "At 2 a.m. in distress, a hard stop can
  feel like being left alone." At 30, show the break message with **Done** as the main button and a
  smaller **Talk to Okuvu**.
- **Typed answer:** replace the typing box with three taps — **Calmer**, **About the same**, **Worse**.
  "A free-text box at 2 a.m. is a channel nobody is reading." If they tap **Worse**, offer **Talk to
  Okuvu** and the helplines. If free text is kept for any reason it must go through the safety check
  (A1) first.
- **Storage:** store only the technique, number of breaths and the tap answer; show it to the
  therapist only when breathing is assigned as homework, or when the client has agreed to share — the
  same permission model as chat access.

## Pause and break copy, as she wrote it

- After every 10 breaths (5 for the sigh): **"Let's pause here. How are you feeling now?"** Buttons:
  Calmer / About the same / Worse, then **Continue** and **Stop for now**.
- After 30 breaths: **"That's 30 breaths. A good place to rest – come back to it whenever you need."**
  Main button: **Done**. Smaller option: **Talk to Okuvu**.
- Stopping early: **"You took a moment for yourself. Come back whenever you like."** No breath count —
  "it reads like a score."

## Closed — the sigh video (dropped by the owner, 4 Nov 2026)

In her reply she asked for a 20–30 second video for the physiological sigh only, opened from the (i)
panel (no autoplay during the exercise), captions on by default, one person seated with belly and
lower ribs expanding, labelled "AI-generated demonstration" if it is AI, **and she wanted to see the
final video before it went in**: "AI video often gets breathing wrong (shoulders lifting, chest-only
breaths, no visible top-up). If it does not pass, we film a real person instead."

**Owner decision, 4 Nov 2026 — Rajwant, in session: "keep a visual guide as suggested and text support
as mentioned before. Omit the video support plan."** No clip is filmed, generated or shipped. The
physiological sigh keeps the two things she already approved for every technique: the on-screen
animation (a circle that fills, swells a little more, then empties — guided by words, not numbers) and
her written explanation behind the (i). The video lane's docs, scripts and evidence were deleted from
the branch (change log row 21) so nothing can be spent on it or accidentally revived.

**Closed with her, 4 Nov 2026.** The owner told Dr Goswami that no video will be made and she approved
that change, so nothing is owed on this half and there is no line left to send: her sign-off stands on
the two things that ship, the on-screen animation and her written explanation behind the (i). Nothing
was ever sent to her about the video — the email drafted for it was never delivered (Gmail
unreachable from this host) — so there was nothing to retract, only to state, and the owner did that.
