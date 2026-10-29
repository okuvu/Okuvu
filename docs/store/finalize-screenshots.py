#!/usr/bin/env python3
"""Turn raw device screenshots into Play-compliant phone screenshots.

Why this exists: Play rejects any phone screenshot whose long side is more than twice its
short side (i.e. anything between 16:9 and 9:16 is accepted; 20:9 is not). Every modern
Android phone captures at ~9:20 (e.g. 1080x2400), so raw `adb exec-out screencap -p` output
is *not* uploadable as-is. This script crops the surplus from the bottom (never stretches,
never letterboxes with invented content) and writes a 9:16 PNG.

Usage:
  python3 docs/store/finalize-screenshots.py raw/01-home.png raw/02-chat.png ...
  -> writes docs/store/screenshots/01-home.png ... at 1080x1920, 24-bit, no alpha

Input images must be real captures from the app (`adb exec-out screencap -p`). This script
does not create or synthesise screenshots; it only crops and rescales what it is given.
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "docs", "store", "screenshots")

TARGET_W, TARGET_H = 1080, 1920  # 9:16
MAX_RATIO = 2.0


def finalize(path):
    im = Image.open(path)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        alpha_min = im.getchannel("A").getextrema()[0]
        if alpha_min < 255:
            raise SystemExit(f"{path}: has transparency; Play wants 24-bit PNG/JPEG")
        im = im.convert("RGB")
    else:
        im = im.convert("RGB")
    w, h = im.size

    # 1. crop to the target aspect ratio, taking the surplus off the bottom edge
    if h / w > TARGET_H / TARGET_W:
        keep_h = round(w * TARGET_H / TARGET_W)
        top = 0
        im = im.crop((0, top, w, top + keep_h))
    elif w / h > TARGET_W / TARGET_H:
        keep_w = round(h * TARGET_W / TARGET_H)
        left = (w - keep_w) // 2
        im = im.crop((left, 0, left + keep_w, h))

    # 2. scale to exactly 1080x1920
    im = im.resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)

    name = os.path.splitext(os.path.basename(path))[0] + ".png"
    os.makedirs(OUT, exist_ok=True)
    dest = os.path.join(OUT, name)
    im.save(dest, "PNG", optimize=True)
    return dest


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    for src in argv:
        dest = finalize(src)
        im = Image.open(dest)
        long_side, short_side = max(im.size), min(im.size)
        ratio = long_side / short_side
        ok = im.size == (TARGET_W, TARGET_H) and ratio <= MAX_RATIO and im.mode == "RGB"
        print(f"{'PASS' if ok else 'FAIL'}  {os.path.relpath(dest, ROOT)}: "
              f"{im.size[0]}x{im.size[1]} mode={im.mode} ratio={ratio:.3f}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
