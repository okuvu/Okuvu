#!/usr/bin/env bash
# Turn an uploaded presenter clip into the physiological-sigh review cut.
#
#   ./sigh_from_upload.sh /path/to/clip.mp4
#   ./sigh_from_upload.sh /path/to/clip.mp4 0.4:6.0:7.0:15.0
#
# The second form is the accurate one: the four times are where the inhale
# starts, where the top-up sip starts, where the exhale starts, and where the
# exhale ends. Each phase is then retimed to Dr Goswami's 4 / 1 / 8 s, so the
# presenter's own pace does not matter and the captions cannot drift from the
# picture. Without them the whole clip is stretched as a single breath.
#
# Zero cost: no model is called. Source footage in, 28.000 s cut out.
set -euo pipefail

PY=/opt/data/reels/venv/bin/python
cd "$(dirname "$0")/.."

[[ $# -ge 1 ]] || { echo "usage: $0 CLIP [in:sip:out:end]" >&2; exit 2; }
SRC="$1"
PH="${2:-}"
if [[ ! -f "$SRC" ]]; then echo "not found: $SRC" >&2; exit 1; fi

OUT=evidence/sigh-video/upload
echo "=== 1/2 inspect ==="
"$PY" scripts/sigh_ingest.py inspect --input "$SRC"

echo
echo "=== 2/2 cut ==="
if [[ -z "$PH" ]]; then
  echo "no phases given: assuming the whole clip is ONE breath (keeps its proportions)"
  "$PY" scripts/sigh_ingest.py cut --input "$SRC" --out "$OUT"
else
  "$PY" scripts/sigh_ingest.py cut --input "$SRC" --out "$OUT" --phases "$PH"
fi

echo
echo "review copy: $(pwd)/$OUT/sigh-demonstration.mp4"
