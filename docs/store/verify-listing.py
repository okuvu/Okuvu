#!/usr/bin/env python3
"""Check every E19-S3 store asset against Google Play's limits, measuring the real files.

Reads:
  docs/store/listing-copy.md          -> title / short / full / email blocks (fenced, tagged)
  docs/store/icon-512.png             -> pixels + colour mode + byte size
  docs/store/feature-graphic-1024x500.png

Play limits enforced here (support.google.com/googleplay/android-developer/answer/9866151):
  app name           <= 30 characters
  short description  <= 80 characters
  full description   <= 4000 characters
  app icon           512x512, 32-bit PNG, <= 1024 KB
  feature graphic    1024x500, 24-bit PNG (no alpha), <= 15 MB

Exit code 0 when every check passes, 1 otherwise. Prints one line per check.
"""
import os
import re
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STORE = os.path.join(ROOT, "docs", "store")

LIMITS = {"title": 30, "short": 80, "full": 4000, "email": 320}
FIELDS = [
    ("title", "App name"),
    ("short", "Short description"),
    ("full", "Full description"),
    ("email", "Contact email"),
]

failures = []


def check(ok, line):
    print(("PASS  " if ok else "FAIL  ") + line)
    if not ok:
        failures.append(line)


def read_blocks():
    path = os.path.join(STORE, "listing-copy.md")
    text = open(path, encoding="utf-8").read()
    blocks = {}
    for m in re.finditer(r"```text (\w+)\n(.*?)\n```", text, re.S):
        blocks[m.group(1)] = m.group(2)
    return blocks


def text_checks(blocks):
    print("== copy ==")
    for key, label in FIELDS:
        if key not in blocks:
            check(False, f"{label}: block 'text {key}' not found in listing-copy.md")
            continue
        value = blocks[key]
        n = len(value)
        limit = LIMITS[key]
        if key != "full" and "\n" in value:
            check(False, f"{label}: {n} chars (multi-line; expected a single line)")
            continue
        if key == "full":
            check(n <= limit and n > 0, f"{label}: {n}/{limit} characters, {len(value.splitlines())} lines")
        else:
            check(n <= limit and n > 0, f"{label}: {n}/{limit} characters")

    short = blocks.get("short", "")
    check(short == short.strip(), "Short description has no leading/trailing whitespace")

    email = blocks.get("email", "")
    check(bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", email)), f"Contact email is a valid address: {email}")

    full = blocks.get("full", "")
    check("https://okuvu.in/privacy" in full, "Full description links the live privacy policy")
    check("not a therapist" in full.lower(), "Full description states it is not a therapist")
    banned = [
        "clinically validated", "clinically reviewed", "clinically proven",
        "medical device", "FDA", "CE marked", "therapy app", "treats",
        "cure", "diagnose", "HIPAA", "DPDP compliant", "certified",
    ]
    low = (full + " " + short).lower()
    hits = [b for b in banned if b.lower() in low]
    check(not hits, f"No clinical/certification claims in listing text (found: {hits or 'none'})")


def image_checks():
    print("== images ==")
    icon_path = os.path.join(STORE, "icon-512.png")
    im = Image.open(icon_path)
    size = os.path.getsize(icon_path)
    print(f"      icon: {im.size[0]}x{im.size[1]} mode={im.mode} bytes={size}")
    check(im.size == (512, 512), f"Icon is exactly 512x512 (measured {im.size[0]}x{im.size[1]})")
    check(im.mode == "RGBA", f"Icon is a 32-bit PNG with alpha (mode {im.mode})")
    check(size <= 1024 * 1024, f"Icon is under 1024 KB ({size} bytes)")
    alpha_min = im.getchannel("A").getextrema()[0] if im.mode == "RGBA" else None
    check(alpha_min == 255,
          f"Icon is full-bleed opaque, no transparent corners (min alpha {alpha_min})")

    fg_path = os.path.join(STORE, "feature-graphic-1024x500.png")
    fg = Image.open(fg_path)
    fg_size = os.path.getsize(fg_path)
    print(f"      feature graphic: {fg.size[0]}x{fg.size[1]} mode={fg.mode} bytes={fg_size}")
    check(fg.size == (1024, 500), f"Feature graphic is exactly 1024x500 (measured {fg.size[0]}x{fg.size[1]})")
    check(fg.mode == "RGB", f"Feature graphic is 24-bit with no alpha channel (mode {fg.mode})")
    check(fg_size <= 15 * 1024 * 1024, f"Feature graphic is under 15 MB ({fg_size} bytes)")


def main():
    text_checks(read_blocks())
    image_checks()
    print(f"== {len(failures)} failure(s) ==")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
