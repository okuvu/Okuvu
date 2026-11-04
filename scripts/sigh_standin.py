#!/usr/bin/env python3
"""Stand-in presenter clip at a DELIBERATELY WRONG pace, for testing the ingest.

Simulates the real problem: someone uploads footage breathing at their own
rhythm (here one breath per 9.4 s: 4.6 in, 0.6 sip, 4.2 out) in landscape with
audio. The ingest must retime it onto Dr Goswami's 13 s cycle. Bar height in the
picture encodes the breath, so the output can be checked by measuring pixels
rather than by trusting the filter graph.

  /opt/data/reels/venv/bin/python scripts/sigh_standin.py --out DIR
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

W_, H_, FPS_ = 1280, 720, 25
DUR = 9.4
IN_, SIP_, OUT_ = 4.6, 0.6, 4.2
BAR_TOP, BAR_BOT, BAR_X0, BAR_X1 = 120, 660, 500, 600


def level(t: float) -> float:
    if t < IN_:
        return t / IN_
    if t < IN_ + SIP_:
        return 1.0 + 0.5 * (t - IN_) / SIP_
    return max(1.5 * (1 - (t - IN_ - SIP_) / OUT_), 0.0)


def frame(t: float) -> Image.Image:
    img = Image.new("RGB", (W_, H_), (30, 26, 44))
    d = ImageDraw.Draw(img)
    lv = level(t)
    # "torso" block that swells
    width = int(300 + 130 * min(lv, 1.0))
    d.rounded_rectangle([640 - width // 2, 200, 640 + width // 2, 690],
                        radius=60, fill=(150, 132, 205))
    d.text((60, 60), f"STAND-IN  t={t:5.2f}s", fill=(255, 255, 255))
    # breath bar, measurable
    h = (BAR_BOT - BAR_TOP) * min(lv / 1.5, 1.0)
    d.rectangle([BAR_X0, BAR_BOT - h, BAR_X1, BAR_BOT], fill=(240, 200, 90))
    d.rectangle([BAR_X0, BAR_TOP, BAR_X1, BAR_BOT], outline=(255, 255, 255), width=3)
    return img


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    raw = os.path.join(args.out, "standin-raw.mp4")
    n = int(round(DUR * FPS_))
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{W_}x{H_}", "-r", str(FPS_), "-i", "-",
         "-f", "lavfi", "-i", f"sine=frequency=220:duration={DUR}",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
         "-shortest", raw],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    assert proc.stdin is not None and proc.stderr is not None
    for i in range(n):
        proc.stdin.write(frame(i / FPS_).tobytes())
    proc.stdin.close()
    err = proc.stderr.read().decode("utf-8", "replace")
    if proc.wait() != 0:
        sys.exit(f"stand-in build failed:\n{err[-1500:]}")
    print(f"wrote {raw}  ({n} frames, {DUR}s, one breath per {DUR}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
