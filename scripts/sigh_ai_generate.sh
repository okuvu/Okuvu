#!/usr/bin/env bash
# AI presenter for the physiological-sigh clip — generation stages.
#
#   ./sigh_ai_generate.sh plan     every request + price printed, nothing sent
#   ./sigh_ai_generate.sh hero     one presenter portrait  -> APPROVE BEFORE STAGE 2
#   ./sigh_ai_generate.sh sheet    3 turnaround views (identity refs)
#   ./sigh_ai_generate.sh frames   5 shot stills
#   ./sigh_ai_generate.sh clips    5 x 5 s Kling clips
#
# Frame-first, per the pipeline rule: no clip is generated from text, only from
# an approved still. Every stage refuses to run before the one above it exists.
set -euo pipefail

# --- spend lock -------------------------------------------------------------
# Rajwant's instruction (3 Nov 2026): no further spend on this clip. He supplies
# the presenter footage and this pipeline cuts it. Every paid stage is therefore
# refused unless someone deliberately unlocks it for that shell only.
if [[ "${1:-plan}" != "plan" && "${OKUVU_ALLOW_PAID_GEN:-0}" != "1" ]]; then
  cat >&2 <<'MSG'
Refusing to generate: paid stages are locked (no-budget instruction, 3 Nov 2026).

The presenter footage comes from Rajwant, and scripts/sigh_ingest.py conforms it
to Dr Goswami's beats at zero cost. Nothing here needs to run.

To override for a single shell, deliberately export:
  OKUVU_ALLOW_PAID_GEN=1 ./sigh_ai_generate.sh hero
MSG
  exit 1
fi

VG=(/opt/data/reels/venv/bin/python /opt/data/reels/videogen.py)
PY=/opt/data/reels/venv/bin/python
NAME=okuvu-guide
CHAR=/opt/data/reels/characters/$NAME
SEED=4127

DESC="Indian woman in her early thirties, shoulder-length dark hair loosely tied back, plain sage-green cotton top, no jewellery, no logos, calm and unhurried expression, seated"
STYLE="soft natural window daylight from the left, muted oat and sage palette, 35mm, shallow depth of field, gentle film grain, no warm orange grade"

# The presenter is present and steady; the breath itself is carried by the app's
# own circle and the captions. The model is never asked to animate a correct
# physiological sigh — that is precisely what generated video gets wrong.
S1="seated upright in a soft chair in a quiet consulting room, hands resting loosely in lap, looking calmly into the camera, shoulders level and completely still, mouth closed, no talking, subtle natural movement only, vertical portrait, waist up"
S2="same seat, three-quarter angle, one hand resting lightly on the lower ribs, posture steady, shoulders level, mouth closed, no talking, minimal movement, waist up"
S3="same seat, straight to camera, slight relaxed close-in, calm steady gaze, mouth closed, no talking, waist up"
S4="same seat, wider framing showing the quiet room and a plant, hands in lap, still shoulders, no talking, waist up"
S5="same seat, gentle settled posture, faint warm smile, eyes to camera, mouth closed, no talking, waist up"

shot() { local v="S$1"; echo "${!v}"; }

need_hero() {
  [[ -f "$CHAR/ref/hero.png" ]] || { echo "no hero yet — run: $0 hero" >&2; exit 1; }
}

stage="${1:-plan}"

case "$stage" in
  plan)
    echo "== hero portrait (\$0.03) =="
    "${VG[@]}" char-new --name "$NAME" --desc "$DESC" --style "$STYLE" --seed "$SEED" --dry-run
    echo
    echo "== remaining stages, payloads printed against a stand-in hero =="
    STUB=/opt/data/cache/scratch/okuvu-guide
    rm -rf "$STUB"; mkdir -p "$STUB/ref"
    ffmpeg -v error -y -f lavfi -i "color=c=0xB0A6D8:s=1080x1350" -frames:v 1 "$STUB/ref/hero.png"
    "$PY" - "$STUB" "$DESC" "$STYLE" <<'PY'
import json, sys, pathlib
d, desc, style = sys.argv[1], sys.argv[2], sys.argv[3]
hero = str(pathlib.Path(d) / "ref" / "hero.png")
(pathlib.Path(d) / "bible.json").write_text(json.dumps(
    {"slug": "okuvu-guide", "name": "okuvu-guide", "desc": desc, "style": style,
     "seed": 4127, "hero": hero, "refs": [hero]}, indent=2))
PY
    export VIDEOGEN_CHAR_ROOT=/opt/data/cache/scratch
    export VIDEOGEN_STATE=/opt/data/cache/scratch/sigh-ai-dryrun-state.json
    echo "== 3 turnaround views (3 x \$0.03) =="
    "${VG[@]}" char-sheet --name "$NAME" --views 3 --dry-run
    for i in 1 2 3 4 5; do
      echo "== still $i (\$0.046) =="
      "${VG[@]}" frame --name "$NAME" --shot "$(shot "$i")" --out "$CHAR/frames/0$i.png" --dry-run
      echo "== clip $i (5 s, \$0.42) =="
      # dry-run: a stand-in still, since no real frame exists yet
      "${VG[@]}" clip --name "$NAME" --frame "$STUB/ref/hero.png" \
        --shot "$(shot "$i")" --dur 5 --dry-run
    done
    rm -rf "$STUB" /opt/data/cache/scratch/sigh-ai-dryrun-state.json
    echo
    echo "TOTAL: hero 0.03 + 3 views 0.09 + 5 stills 0.23 + 5 clips 2.10 = \$2.45 first pass."
    echo "       One re-roll of the clips as well = \$4.55."
    ;;

  hero)
    "${VG[@]}" char-new --name "$NAME" --desc "$DESC" --style "$STYLE" --seed "$SEED"
    echo
    echo "STOP. Open $CHAR/ref/hero.png and look at the face."
    echo "If it is wrong, re-run with a different SEED. Nothing else is generated until it is right."
    ;;

  sheet)
    need_hero
    "${VG[@]}" char-sheet --name "$NAME" --views 3
    echo "NEXT: inspect $CHAR/ref/sheet_*.png, then run: $0 frames"
    ;;

  frames)
    need_hero
    mkdir -p "$CHAR/frames"
    for i in 1 2 3 4 5; do
      echo "== still $i =="
      "${VG[@]}" frame --name "$NAME" --shot "$(shot "$i")" --out "$CHAR/frames/0$i.png"
    done
    echo
    echo "STOP. Look at all five stills: shoulders level, belly uncovered, no raised chest,"
    echo "no text on clothing, both hands visible. Then run: $0 clips"
    ;;

  clips)
    need_hero
    for i in 1 2 3 4 5; do
      [[ -f "$CHAR/frames/0$i.png" ]] || { echo "missing still 0$i — run: $0 frames" >&2; exit 1; }
      echo "== clip $i =="
      "${VG[@]}" clip --name "$NAME" --frame "$CHAR/frames/0$i.png" --shot "$(shot "$i")" --dur 5
    done
    echo
    echo "NEXT: assemble —"
    echo "  $PY /opt/data/okuvu/ts/scripts/sigh_video_ai.py \\"
    echo "    --presenter $CHAR/clips/*.mp4 --out /opt/data/okuvu/ts/evidence/sigh-video --poster"
    ;;

  *) echo "unknown stage: $stage" >&2; exit 2 ;;
esac
