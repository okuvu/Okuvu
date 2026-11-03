# Breathing exercises — clinical copy review (round 2)

**What this is.** The Breathe section now carries a written explanation behind an (i) on each
technique, plus new pause/break wording. Rajwant's instruction on 4 Nov 2026 was explicit: send the
explanations to Dr Shubhangi Goswami and only put them in the app once she approves the script.

**State: SENT, AWAITING REPLY.** Nothing in this document is approved copy yet. The text below is
byte-for-byte what the app renders (`apps/mobile/lib/src/features/home/breathing_content.dart`), so an
approval of this document covers what ships; any edit needs a new version and a fresh review.

| Item | Value |
| --- | --- |
| Reviewer | Dr Shubhangi Goswami (clinical authority — `docs/00a-clinical-authority.md`) |
| Copy version | 1.0.0 |
| Sent | 4 Nov 2026, 00:24 IST / 3 Nov 2026 18:54 UTC |
| To / Cc | alphashubhangi@gmail.com / Rajwant@suvoksystem.com |
| From | okuvu &lt;admin@okuvu.in&gt; |
| Gmail message id | `1a1a2c3077d1bc02` |
| Bounce check | none (searched mailer-daemon / postmaster / Delivery Status Notification, no hits) |
| Reply | **none yet** |

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
