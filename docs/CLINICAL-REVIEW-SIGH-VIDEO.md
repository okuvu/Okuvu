# Clinical review — physiological sigh video (for Dr Shubhangi Goswami)

Version 1.0.0 · prepared 4 Nov 2026 · branch `feat/app-change-round-2`
Reviewer of record: Dr Shubhangi Goswami (clinical authority, `docs/00a-clinical-authority.md`)
Her request: reply of 3 Nov 2026, message id `1a1a2d6769fe9e01` — "20–30 second video for the
physiological sigh, opened from the (i) panel, captions on, one real person demonstrating …
AI video often gets breathing wrong (shoulders lifting, chest-only breaths, no visible top-up).
If it does not pass, we film a real person instead."

Status: **not in the app.** Nothing is wired into the (i) panel until she has seen and passed a
finished clip. This document is the sheet she signs off *before* anyone films, so the shoot is
right the first time.

---

## 1. What the clip has to show (her requirements, restated)

| Requirement | How this sheet meets it |
|---|---|
| 20–30 seconds | 28.0 s — two full breaths at her own pace |
| Opens from the (i) panel only | no autoplay during the exercise; a tap to play |
| Captions on by default | captions burned into the picture, so they cannot be switched off |
| One person demonstrating | filmed, not generated (see §5) |
| Belly and lower ribs expanding | framing shows the torso from waist to shoulders; the belly is never covered |
| No shoulder lift | shoulders stay below a fixed marker on screen; the sheet tells the presenter to keep them still |
| No chest-only breathing | the chest area is left clear on screen so a chest-only breath would be obvious |
| A visible top-up | the second small sip is a separate caption and a separate beat, not folded into the inhale |
| "AI-generated demonstration" label if AI | a corner label is carried in every frame of any generated cut |
| She sees the final video first | the approval gate in §6 |

## 2. Timing — her numbers, not ours

Her clinical instruction and the app's own preset are the same: **a full breath in, one more small
sip of air on top, then a long breath out.** In the app that is 4 s + 1 s + 8 s (`breathing_presets.dart`,
`physiological_sigh`). The video must match the exercise exactly, because it is the thing a client
will copy.

| # | Beat | Start | End | Length |
|---|---|---|---|---|
| 1 | Opening card, person seated and settled | 0.0 s | 2.0 s | 2.0 s |
| 2 | Breathe in through the nose | 2.0 s | 6.0 s | 4.0 s |
| 3 | Second small sip on top | 6.0 s | 7.0 s | 1.0 s |
| 4 | Long slow breath out through the mouth | 7.0 s | 15.0 s | 8.0 s |
| 5 | Breathe in again | 15.0 s | 19.0 s | 4.0 s |
| 6 | Second small sip | 19.0 s | 20.0 s | 1.0 s |
| 7 | Long slow breath out | 20.0 s | 28.0 s | 8.0 s |

Total **28.0 s**. One round is 13.0 s, which is the same cycle the app runs.

**No countdown digits appear on screen.** The app shows no numbers for the sigh (her choice — the
sigh is guided by words, not numbers, row 18 of `docs/APP-CHANGE-LOG.md`). A video with a counting
clock would teach a pace the exercise does not use.

## 3. Captions — exact wording for approval

| Beat | Caption (large) | Second line (small) |
|---|---|---|
| 1 | Physiological sigh | Two rounds. Follow along. |
| 2 | Breathe in through your nose | Let your belly and lower ribs widen — not your shoulders. |
| 3 | One more small sip of air on top | |
| 4 | Long, slow breath out through your mouth | Let the shoulders stay where they are. |
| 5 | In through your nose again | |
| 6 | A small sip on top | |
| 7 | Now let it all out, slowly | |

Three questions for her on the wording:

1. Beat 4 says "through your mouth". Her app copy does not say where the out-breath leaves. Is the
   mouth right for the sigh, or should it be "through your mouth or nose, whichever is comfortable"?
2. Beat 2 names the belly and the lower ribs. Is that the phrasing she wants a client to read, or
   should it stay her existing app sentence word for word?
3. Beat 7 ends without a closing instruction. Should there be a final card — for example "That's
   two. Sit for a moment." — and does she want it to carry any safety line?

## 4. On-camera sheet (for whoever films)

- Seated, side-on or three-quarter, **from the waist up**, loose clothing, no belt over the belly.
- One hand resting lightly on the belly is allowed and helps the viewer see the expansion; it must
  not press.
- Shoulders drop and stay down for the whole clip. Nothing in the upper chest moves.
- In through the nose, then a small extra sip, then the out-breath with the mouth slightly open.
- No talking, no music, no on-screen presenter name.
- Quiet room, one light source in front, camera at chest height, locked off — the phone must not move.
- Film **three full rounds** (about 40 s) so the edit can choose the two cleanest. Two rounds that
  breathe out of rhythm with each other cannot be cut together.
- Landscape or portrait is fine; the cut is 9:16 regardless.

## 5. Filmed or generated

Her stated position is that AI demonstration gets the mechanics wrong and that a real person is the
fallback. The workspace cannot generate this clip today in any case: the video lane needs an active
`FAL_KEY`, which is not configured (the line in `/opt/data/.env` is commented out). So the default
path is **a real person, filmed on a phone**, and this sheet is written for that.

If she would rather see a generated version first, the cost is roughly $9–10 of fal credit for
~28 s of Kling image-to-video at two-thirds takes, plus a frame-first still to approve before any
video is generated, and every frame carries the "AI-generated demonstration" label. Rajwant's
decision, not a clinical one — flagged here so it is not rediscovered later.

## 6. Approval gate

Nothing is wired in until she answers these, in writing:

- [ ] The seven beats and their lengths (§2) are clinically right.
- [ ] The captions in §3 are approved, with any rewordings.
- [ ] A real person on camera is acceptable, or she wants the generated cut first.
- [ ] The three questions in §3 are answered.
- [ ] Once a finished clip exists: **she has watched it and passed it.**

The approval is recorded by message id and date in this file. Editing a caption afterwards
invalidates it and needs a fresh review — the same rule as the 52 journal prompts.

## 7. What exists right now

- This sheet.
- A **28.0 s timing proof** (`evidence/sigh-video/sigh-timing-preview.mp4`, poster frame
  `sigh-timing-preview-poster.png`): 1080×1920, 30 fps, H.264, silent, exactly 28.000 s / 840 frames.
  It carries the exact caption schedule and the exact breath timing, drawn with the app's own sigh
  visual (the circle that fills, swells a little more, then empties) plus a beat strip with a
  playhead, so the pace can be checked against the thing clients actually see. It is labelled
  `TIMING PREVIEW — APP VISUAL, NO PRESENTER` in the corner and is **not** for the app. It exists so
  she can judge pace and wording before anyone films.
- `scripts/sigh_video.py` — the same caption schedule, in code, with `--input <clip>` to cut a real
  clip to this spec (1080×1920, 30 fps, H.264, captions burned in, 28.0 s). The footage path was run
  end to end on a 40 s 720×1280 synthetic clip: cropped to 9:16 with no letterboxing, held to exactly
  28.000 s / 840 frames, captions burned at the same position as the proof. Those test renders were
  verification and are not committed. The caption strings and their clock live in one list, so the
  proof and the filmed cut cannot drift.

The remaining input is the footage itself.
