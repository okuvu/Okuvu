#!/usr/bin/env python3
"""Build the Google Play store images for Okuvu from the app's own brand assets.

Inputs (read-only, from the Flutter app):
  apps/mobile/assets/brand/okuvu-appicon-1024.png   1024x1024 RGBA, rounded-square app icon
  apps/mobile/assets/brand/okuvu-mark-dark.png       800x800 RGBA, light spiral mark (for dark fills)
  apps/mobile/assets/fonts/Poppins-SemiBold.ttf      the app's real UI typeface

Outputs (docs/store/):
  icon-512.png                 512x512  24-bit RGB PNG, fully opaque, full-bleed square
  feature-graphic-1024x500.png 1024x500 24-bit RGB PNG, no alpha

Nothing here invents a visual identity: the icon is the shipped launcher art with its
transparent corner rounding filled in with the icon's own background gradient (Play applies
its own mask, so a pre-rounded icon would show a second rounded edge), and the feature
graphic is the shipped mark plus the app's own palette and typeface.

Requires: Pillow. Run from the repo root: python3 docs/store/build-assets.py
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "apps", "mobile", "assets")
OUT = os.path.join(ROOT, "docs", "store")

ICON_SRC = os.path.join(SRC, "brand", "okuvu-appicon-1024.png")
MARK_SRC = os.path.join(SRC, "brand", "okuvu-mark-dark.png")
FONT_SEMIBOLD = os.path.join(SRC, "fonts", "Poppins-SemiBold.ttf")
FONT_REGULAR = os.path.join(SRC, "fonts", "Poppins-Regular.ttf")

# Palette sampled from the shipped icon + the app's live theme (lib/src/theme/app_colors.dart).
BG_TOP = (52, 21, 91)      # icon gradient, top
BG_BOTTOM = (88, 42, 138)  # icon gradient, bottom
LAVENDER = (241, 236, 255)  # wordmark fill, as in okuvu-mark-dark's #EDE9FE
MUTED = (205, 194, 240)     # supporting line


def estimate_background(img, cells=64, blur=1.4):
    """Estimate the icon's own background gradient across the whole square.

    The launcher icon is a rounded square on a transparent field with a smooth purple
    gradient behind the mark. Edge-extending the rows leaves streaks, so instead the
    background is reconstructed: average the opaque pixels on a coarse grid, fill the
    grid's empty corner cells by nearest-neighbour propagation, blur the grid, then
    upscale. Only the transparent region is taken from this estimate.
    """
    img = img.convert("RGBA")
    w, h = img.size
    step = w // cells
    px = img.load()

    grid = []
    for gy in range(cells):
        row = []
        for gx in range(cells):
            acc = [0, 0, 0]
            n = 0
            for y in range(gy * step, (gy + 1) * step):
                for x in range(gx * step, (gx + 1) * step):
                    p = px[x, y]
                    if p[3] > 200:
                        acc[0] += p[0]
                        acc[1] += p[1]
                        acc[2] += p[2]
                        n += 1
            row.append(tuple(c / n for c in acc) if n else None)
        grid.append(row)

    # propagate known cells outward until the grid is complete
    while any(c is None for row in grid for c in row):
        pending = [[grid[y][x] for x in range(cells)] for y in range(cells)]
        changed = False
        for y in range(cells):
            for x in range(cells):
                if grid[y][x] is not None:
                    continue
                acc = [0.0, 0.0, 0.0]
                n = 0
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < cells and 0 <= nx < cells and grid[ny][nx] is not None:
                            for i in range(3):
                                acc[i] += grid[ny][nx][i]
                            n += 1
                if n:
                    pending[y][x] = tuple(c / n for c in acc)  # type: ignore[assignment]
                    changed = True
        if not changed:
            break
        grid = [[c if c is not None else pending[y][x] for x, c in enumerate(row)]
                for y, row in enumerate(pending)]

    small = Image.new("RGB", (cells, cells))
    sp = small.load()
    for y in range(cells):
        for x in range(cells):
            sp[x, y] = tuple(round(v) for v in grid[y][x])
    small = small.filter(ImageFilter.GaussianBlur(blur))
    return small.resize((w, h), Image.Resampling.BICUBIC)


def flatten_icon(src):
    """Composite the rounded-square icon onto its reconstructed background."""
    src = src.convert("RGBA")
    bg = estimate_background(src)
    out = Image.composite(src.convert("RGB"), bg, src.getchannel("A"))
    return out


def build_icon():
    src = Image.open(ICON_SRC)
    flat = flatten_icon(src)
    icon = flat.resize((512, 512), Image.Resampling.LANCZOS)
    # Play asks for a 32-bit PNG "with alpha"; this icon is full-bleed, so every pixel is
    # opaque (alpha 255) and Play's own corner mask does the rounding.
    icon = icon.convert("RGBA")
    path = os.path.join(OUT, "icon-512.png")
    icon.save(path, "PNG", optimize=True)
    return path


def vertical_gradient(size, top, bottom):
    w, h = size
    grad = Image.new("RGB", (1, h))
    gd = grad.load()
    for y in range(h):
        t = y / (h - 1)
        gd[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return grad.resize((w, h), Image.BILINEAR)


def build_feature_graphic():
    W, H = 1024, 500
    # Play's cutoff zones for the 1024x500 feature graphic: key content must stay inside
    # this box or it can be cropped in the large-format surfaces.
    SAFE_L, SAFE_T, SAFE_R, SAFE_B = 152, 76, 872, 424

    bg = vertical_gradient((W, H), BG_TOP, BG_BOTTOM)

    # soft glow behind the lockup, so the mark does not sit on a flat field
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse((140, 20, 560, 480), fill=64)
    glow = glow.filter(ImageFilter.GaussianBlur(110))
    bg = Image.composite(Image.new("RGB", (W, H), (116, 88, 196)), bg, glow)

    # The mark is a small companion to the wordmark, not a second app icon: Play asks that
    # feature graphics not repeat the icon at large scale, since the two are shown together.
    mark = Image.open(MARK_SRC).convert("RGBA")
    mark = mark.crop(mark.getbbox())  # trim the 800x800 padding down to the spiral itself
    target_h = 150
    scale = target_h / mark.height
    mark = mark.resize((round(mark.width * scale), target_h), Image.Resampling.LANCZOS)

    draw = ImageDraw.Draw(bg)
    wordmark_font = ImageFont.truetype(FONT_SEMIBOLD, 78)
    tagline_font = ImageFont.truetype(FONT_REGULAR, 33)

    word = "OKUVU"
    tracking = 7
    widths = [draw.textlength(ch, font=wordmark_font) for ch in word]
    word_w = sum(widths) + tracking * (len(word) - 1)

    tag_lines = ["An AI companion for", "your mental wellbeing"]
    tag_w = max(draw.textlength(t, font=tagline_font) for t in tag_lines)
    tag_line_h = 40
    tag_h = tag_line_h * len(tag_lines)

    text_w = int(max(word_w, tag_w))
    gap = 44
    total_w = mark.width + gap + text_w
    x = SAFE_L + (SAFE_R - SAFE_L - total_w) // 2
    block_h = 78 + 18 + tag_h
    block_top = SAFE_T + (SAFE_B - SAFE_T - block_h) // 2

    mark_x = x
    mark_y = block_top + (block_h - mark.height) // 2 - 6
    bg.paste(mark, (mark_x, mark_y), mark)

    text_x = x + mark.width + gap
    # wordmark, drawn glyph by glyph for letterspacing
    cx = text_x
    for ch, cw in zip(word, widths):
        draw.text((cx, block_top - 14), ch, font=wordmark_font, fill=LAVENDER)
        cx += cw + tracking

    ty = block_top + 96
    for line in tag_lines:
        draw.text((text_x, ty), line, font=tagline_font, fill=LAVENDER)
        ty += tag_line_h

    # marigold accent rule closing the tagline, matching the icon's dot colour
    draw.line((text_x, ty + 20, text_x + 58, ty + 20), fill=(232, 163, 61), width=4)

    # everything above must fit the safe box
    content = (min(mark_x, text_x), min(mark_y, block_top - 14), text_x + text_w, ty + 22)
    if not (content[0] >= SAFE_L and content[1] >= SAFE_T
            and content[2] <= SAFE_R and content[3] <= SAFE_B):
        raise SystemExit(f"feature graphic content {content} escapes the safe box "
                         f"{(SAFE_L, SAFE_T, SAFE_R, SAFE_B)}")
    print(f"      feature graphic content box {content} inside safe box "
          f"{(SAFE_L, SAFE_T, SAFE_R, SAFE_B)}")

    path = os.path.join(OUT, "feature-graphic-1024x500.png")
    bg.convert("RGB").save(path, "PNG", optimize=True)
    return path


def main():
    os.makedirs(OUT, exist_ok=True)
    for p in (build_icon(), build_feature_graphic()):
        im = Image.open(p)
        print(f"{os.path.relpath(p, ROOT)}: {im.size[0]}x{im.size[1]} mode={im.mode} "
              f"bytes={os.path.getsize(p)}")


if __name__ == "__main__":
    sys.exit(main())
