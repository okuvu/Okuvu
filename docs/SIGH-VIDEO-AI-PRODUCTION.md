# Physiological sigh — AI-presenter cut

Version 1.0.0 · 4 Nov 2026 · branch `feat/app-change-round-2`
Clinical authority: Dr Shubhangi Goswami · `docs/00a-clinical-authority.md`
Companion to `docs/CLINICAL-REVIEW-SIGH-VIDEO.md` (her beat sheet and caption wording).

Rajwant's decision of 4 Nov 2026: the clip is **AI-generated**, modelled on the
talking-head short he sent (`youtube.com/shorts/EbzqNQQBXj8` — a presenter in a
bright room, sticker title, straight into the instruction, no intro). The filmed
version stays possible; nothing here forecloses it.

---

## 1. The design decision that makes this clinically defensible

Her objection to AI video is specific and correct: generated demonstrations lift
the shoulders, breathe into the chest, and lose the top-up sip. Asked to animate
a *correct* physiological sigh, an image-to-video model gets it wrong.

So the model is never asked to. The split is:

| Carries | What |
|---|---|
| Human presence | one generated presenter, seated, steady, mouth closed, subtle natural movement only |
| Breath mechanics and timing | the app's own sigh circle — the exact shape the exercise draws on the phone |
| Words | captions burned in from the one approved schedule, plus narration |

A presenter who is *present* rather than *demonstrating* cannot teach the wrong
mechanics, because the mechanics never come from the model. This is also why the
prompts say `mouth closed, no talking`: no lip-sync to mismatch the narration.

Two consequences worth stating plainly:

- The clip teaches the pace from the circle, not from body movement. If she wants
  visible torso mechanics in the picture, that is a real shoot, not a prompt.
- Generated video is still generated. Every frame carries the
  `AI-GENERATED DEMONSTRATION` label, as her sheet requires.

## 2. Timeline — unchanged, her numbers

Identical to `docs/CLINICAL-REVIEW-SIGH-VIDEO.md` §2: 28.0 s, two rounds of
4 s in + 1 s top-up + 8 s out, drawn from `breathing_presets.dart` →
`physiologicalSigh` (4 / 1 / 0 / 8, cycles 1). The AI cut reads the **same
`SCHEDULE` list** in `scripts/sigh_video.py`, so the proof she has already seen
and the generated cut cannot diverge by a frame.

## 3. Presenter

Locked descriptor (in `scripts/sigh_ai_generate.sh`, and in
`/opt/data/reels/characters/okuvu-guide/bible.json` once generated):

> Indian woman in her early thirties, shoulder-length dark hair loosely tied
> back, plain sage-green cotton top, no jewellery, no logos, calm and unhurried
> expression, seated.

Look: soft window daylight from the left, muted oat and sage palette, 35 mm,
shallow depth of field, gentle grain, no warm orange grade. It has to sit next
to the app's own surfaces without looking like an advert.

Invented person, not a likeness of anyone real — the licence rule in
`short-form-video-production` → `references/ai-generation-pipeline.md`.

## 4. Shots

Five stills, each animated to a 5 s clip, cut onto the 28 s clock. All
`shoulders level`, `belly uncovered`, `waist up`, `mouth closed, no talking`.

| # | Still |
|---|---|
| 1 | seated upright in a quiet consulting room, hands in lap, looking calmly into the camera |
| 2 | three-quarter angle, one hand resting lightly on the lower ribs |
| 3 | straight to camera, slight relaxed close-in |
| 4 | wider, showing the room and a plant |
| 5 | settled posture, faint warm smile, eyes to camera |

Frame-first: each clip is generated **from its approved still**, never from text,
so the face does not drift between shots.

## 5. Cost

Priced from `videogen.py` (fal, verified prices):

| Item | Unit | Cost |
|---|---|---|
| presenter portrait (`flux-2-pro/edit`) | 1 | $0.03 |
| turnaround views | 3 | $0.09 |
| shot stills | 5 | $0.23 |
| clips (`kling-video/v3/standard`, 5 s) | 5 | $2.10 |
| **first pass** | | **$2.45** |
| with one full re-roll of the clips | | **$4.55** |

`videogen.py` hard-refuses any call that would break its budget cap
(`state.json`, default $5.00 — raise with `videogen.py budget --usd N`).

## 6. Stages

```bash
cd /opt/data/okuvu/ts
./scripts/sigh_ai_generate.sh plan     # every payload + price, sends nothing
./scripts/sigh_ai_generate.sh hero     # portrait — STOP and approve the face
./scripts/sigh_ai_generate.sh sheet    # identity refs
./scripts/sigh_ai_generate.sh frames   # 5 stills — STOP and approve mechanics
./scripts/sigh_ai_generate.sh clips    # 5 s each
/opt/data/reels/venv/bin/python scripts/sigh_video_ai.py \
  --presenter /opt/data/reels/characters/okuvu-guide/clips/*.mp4 \
  --out evidence/sigh-video --poster
```

Two human checkpoints, both before money is spent on the next stage: the face,
then the stills.

## 7. Narration

`scripts/sigh_video_ai.py --vo` builds a 28.0 s track: nine spoken lines, each
placed on its own beat, each trimmed of edge-tts padding, then loudness-normalised
(`I=-16`, `TP=-1.5`). The script **refuses to render** if a line runs past the
next beat — a voice still saying "breathe in" when the exercise has moved to the
out-breath is a defect, so it is a hard error rather than a judgement call.

Voice: `en-IN-NeerjaNeural` at `-8%`. It is a stand-in. A real recorded voice —
hers or a therapist's — should replace it before this ships; the timing slot is
already fixed, so swapping the audio does not move anything.

Spoken words match the approved captions, with the sip beats reduced to "And a
sip." / "A sip." because a 1 s beat cannot hold the written line. The written
captions keep her approved full wording.

## 8. What is verified, and what is not

Verified on this host:

- Narration track: 28.00 s, every line inside its beat (durations printed by
  `--vo`: 0.69 / 1.53 / 0.58 / 2.62 / 2.13 / 1.47 / 0.49 / 2.26 s).
- Compose path, run end to end on a **synthetic** presenter clip:
  `evidence/sigh-video/sigh-compose-test.mp4` — 1080×1920, 30 fps, H.264
  yuv420p, **28.000 s / 840 frames**, AAC audio, $7.6 MB. Frames inspected at
  3.2 s, 6.5 s, 9.0 s and 21.0 s: caption plate holds both lines, the ring and
  the top-up arc clear the caption block, the label sits in the top-left.
  First render had the secondary caption line drawn straight onto the picture
  (illegible over footage) — fixed by putting both lines inside one plate.
- Generation payloads: `sigh_ai_generate.sh plan` prints all 14 requests; the
  clip calls carry `start_image_url`, `duration: "5"`, `generate_audio: false`.

Not verified, and why:

- **No presenter footage exists yet.** The video lane needs an active `FAL_KEY`;
  the line in `/opt/data/.env` is commented out (line 205) and nothing on this
  host sets it. That single credential is the whole blocker.
- The fal model IDs and prices are from the pipeline reference, verified
  2026-10-27. With no key, the queue endpoint answers 405 before it validates a
  model name, so an ID change since then would only surface on the first call.
- Nothing has been seen on a handset, because it is a video and it is not in the
  app; and nothing enters the app until she has watched the finished cut.

## 9. Approval gate

Unchanged from `docs/CLINICAL-REVIEW-SIGH-VIDEO.md` §6, plus:

- [ ] She has watched the **generated** cut and passed it, knowing it is
      AI-generated (the label is on screen in every frame).
- [ ] She accepts that the demonstration is carried by the app's circle and the
      captions rather than by visible body movement (§1).
- [ ] The narration voice is replaced or accepted as a stand-in.
- [ ] `AI-GENERATED DEMONSTRATION` stays on screen in the shipped version.
