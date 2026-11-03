#!/usr/bin/env python3
"""Physiological-sigh video: one caption schedule, two outputs.

SCHEDULE is the single source of truth for what the clip says and when. It uses
Dr Goswami's own numbers (4 s in, 1 s sip on top, 8 s out) and matches
`breathing_presets.dart` -> physiological_sigh, so the video cannot teach a pace
the exercise does not use.

  --placeholder   render the timing proof (app's own circle visual, no presenter)
  --input CLIP    cut real footage to the same schedule, captions burned in

Both paths emit 1080x1920, 30 fps, H.264, yuv420p, +faststart, 28.0 s.

Run with the reels venv (Pillow + numpy live there):
  /opt/data/reels/venv/bin/python scripts/sigh_video.py --placeholder --out DIR
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile

try:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    sys.exit("Pillow and numpy are required: use /opt/data/reels/venv/bin/python")

W, H, FPS = 1080, 1920, 30
DURATION = 28.0
TOTAL_FRAMES = int(round(DURATION * FPS))
CAPTION_BOTTOM = 1550

# --- the one schedule -------------------------------------------------------
# (start, end, phase, caption, second line)   phase: rest | in | sip | out
SCHEDULE = [
    (0.0, 2.0, "rest", "Physiological sigh", "Two rounds. Follow along."),
    (2.0, 6.0, "in", "Breathe in through your nose",
     "Let your belly and lower ribs widen — not your shoulders."),
    (6.0, 7.0, "sip", "One more small sip of air on top", ""),
    (7.0, 15.0, "out", "Long, slow breath out through your mouth",
     "Let the shoulders stay where they are."),
    (15.0, 19.0, "in", "In through your nose again", ""),
    (19.0, 20.0, "sip", "A small sip on top", ""),
    (20.0, 28.0, "out", "Now let it all out, slowly", ""),
]

# --- palette (Okuvu brand) --------------------------------------------------
OAT = (247, 243, 253)
LILAC = (237, 230, 251)
VIOLET = (123, 108, 217)
ROYAL = (94, 46, 145)
SAGE = (124, 158, 143)
SAGE_DEEP = (78, 117, 100)
HONEY = (232, 163, 61)
MUTED = (138, 126, 166)

PHASE_COLOUR = {"rest": MUTED, "in": VIOLET, "sip": HONEY, "out": SAGE_DEEP}

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def beat_at(t: float):
    for row in SCHEDULE:
        if row[0] <= t < row[1]:
            return row
    return SCHEDULE[-1]


def smoothstep(u: float) -> float:
    u = min(max(u, 0.0), 1.0)
    return u * u * (3.0 - 2.0 * u)


def lung_fill(t: float) -> float:
    """0 = empty, 1 = full breath, 1.12 = after the top-up sip."""
    row = beat_at(t)
    phase = row[2]
    u = (t - row[0]) / max(row[1] - row[0], 1e-6)
    if phase == "rest":
        return 0.0
    if phase == "in":
        return smoothstep(u)
    if phase == "sip":
        return 1.0 + 0.12 * smoothstep(u)
    return 1.12 * (1.0 - smoothstep(u ** 0.85))


# --- text helpers -----------------------------------------------------------
_font_cache: dict = {}


def font(path: str, size: int):
    key = (path, size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(path, size)
    return _font_cache[key]


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt, max_w: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w_ in words:
        trial = (cur + " " + w_).strip()
        if draw.textlength(trial, font=fnt) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w_
    if cur:
        lines.append(cur)
    return lines


def draw_caption(img: Image.Image, primary: str, secondary: str, alpha: float):
    if alpha <= 0.01:
        return
    d = ImageDraw.Draw(img)
    fp = font(FONT_BOLD, 58)
    fs = font(FONT_REG, 38)
    max_w = 860
    p_lines = wrap(d, primary, fp, max_w)
    s_lines = wrap(d, secondary, fs, max_w) if secondary else []
    line_h_p, line_h_s = 74, 48
    block_h = len(p_lines) * line_h_p + (26 + len(s_lines) * line_h_s if s_lines else 0)
    top = CAPTION_BOTTOM - block_h
    pad_x, pad_y = 34, 18
    widest = max((d.textlength(l, font=fp) for l in p_lines), default=0)
    x0 = (W - widest) / 2 - pad_x
    y0 = top - pad_y
    pill = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(pill).rounded_rectangle(
        [x0, y0, x0 + widest + 2 * pad_x, top + len(p_lines) * line_h_p + pad_y],
        radius=26, fill=(*VIOLET, int(232 * alpha)))
    img.alpha_composite(pill)
    d = ImageDraw.Draw(img)
    y = top
    for l in p_lines:
        lw = d.textlength(l, font=fp)
        d.text(((W - lw) / 2, y), l, font=fp, fill=(255, 255, 255, int(255 * alpha)))
        y += line_h_p
    if s_lines:
        y += 26
        for l in s_lines:
            lw = d.textlength(l, font=fs)
            d.text(((W - lw) / 2, y), l, font=fs, fill=(*SAGE_DEEP, int(235 * alpha)))
            y += line_h_s


def background() -> Image.Image:
    ramp = np.linspace(0, 1, H)[:, None]
    grad = (np.array(OAT)[None, :] * (1 - ramp) + np.array(LILAC)[None, :] * ramp)
    rng = np.random.default_rng(7)
    grad = grad + rng.uniform(-0.9, 0.9, size=grad.shape)
    arr = np.repeat(grad[:, None, :], W, axis=1).clip(0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGB").convert("RGBA")


BG = background()
CX, CY = W // 2, 700
R0, R_GROW = 218, 30


def draw_breath_circle(img: Image.Image, fill: float):
    """The app's own sigh visual: a circle that fills, swells a little more, empties.

    It is the same shape the exercise draws on the phone, so a clinician reviewing
    the clip is checking the pace against the thing clients will actually see.
    """
    r = R0 + R_GROW * min(fill, 1.0) + R_GROW * 0.45 * max(fill - 1.0, 0.0)
    box = [CX - r, CY - r, CX + r, CY + r]
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse(box, outline=(*VIOLET, 255), width=8)

    level = CY + r - 2 * r * min(fill, 1.0)   # water line
    water = Image.new("RGBA", img.size, (0, 0, 0, 0))
    wd = ImageDraw.Draw(water)
    wd.rectangle([CX - r, level, CX + r, CY + r], fill=(*VIOLET, 58))
    # clip the water to the circle
    clip = Image.new("L", img.size, 0)
    ImageDraw.Draw(clip).ellipse(box, fill=255)
    water.putalpha(Image.composite(water.getchannel("A"), Image.new("L", img.size, 0), clip))
    layer.alpha_composite(water)
    if fill > 0.02:
        d.line([(CX - r * 0.92, level), (CX + r * 0.92, level)], fill=(*VIOLET, 150), width=4)

    if fill > 1.0:  # the top-up sip gets its own ring, so the beat is visible
        extra = (fill - 1.0) / 0.12
        rr = r + 16 + 10 * extra
        d.arc([CX - rr, CY - rr, CX + rr, CY + rr], 200, 340,
              fill=(*HONEY, int(90 + 120 * extra)), width=6)
    img.alpha_composite(layer)


def draw_chrome(img: Image.Image, t: float):
    d = ImageDraw.Draw(img)
    small = font(FONT_REG, 24)
    d.text((70, 250), "TIMING PREVIEW — APP VISUAL, NO PRESENTER", font=small, fill=(*MUTED, 235))
    rnd = 1 if t < 15.0 else 2
    label = f"Round {rnd} of 2" if t >= 2.0 else "Get comfortable"
    f2 = font(FONT_REG, 30)
    lw = d.textlength(label, font=f2)
    d.text((W - 70 - lw, 249), label, font=f2, fill=(*MUTED, 240))


def draw_timeline(img: Image.Image, t: float):
    """Seven beat blocks to scale, with a playhead — the pacing sheet made visible."""
    d = ImageDraw.Draw(img)
    x0, x1 = 90, W - 90
    y0, y1 = 1046, 1098
    span = x1 - x0
    for i, (b0, b1, phase, _c, _c2) in enumerate(SCHEDULE):
        bx0 = x0 + span * (b0 / DURATION)
        bx1 = x0 + span * (b1 / DURATION)
        pad = 3 if i not in (0, len(SCHEDULE) - 1) else 0
        d.rounded_rectangle([bx0 + pad, y0, bx1 - pad, y1], radius=8,
                            fill=(*PHASE_COLOUR[phase], 150))
    # one legend row instead of per-block labels, so nothing can collide
    fl = font(FONT_REG, 27)
    items = [("in 4 s", VIOLET), ("sip 1 s", HONEY), ("out 8 s", SAGE_DEEP)]
    widths = [26 + 10 + d.textlength(txt, font=fl) for txt, _c in items]
    gap = 54
    total = sum(widths) + gap * (len(items) - 1)
    lx = (W - total) / 2
    for (txt, col), wdt in zip(items, widths):
        d.rounded_rectangle([lx, y1 + 18, lx + 26, y1 + 40], radius=6, fill=(*col, 210))
        d.text((lx + 36, y1 + 14), txt, font=fl, fill=(*col, 250))
        lx += wdt + gap
    # playhead
    px = x0 + span * min(t / DURATION, 1.0)
    d.line([(px, y0 - 12), (px, y1 + 10)], fill=(*ROYAL, 255), width=5)
    d.ellipse([px - 8, y0 - 22, px + 8, y0 - 6], fill=(*ROYAL, 255))


def draw_frame(t: float) -> Image.Image:
    img = BG.copy()
    row = beat_at(t)
    draw_chrome(img, t)
    draw_breath_circle(img, lung_fill(t))
    draw_timeline(img, t)
    span = row[1] - row[0]
    local = t - row[0]
    alpha = min(local / 0.25, 1.0, max((span - local) / 0.2, 0.0))
    draw_caption(img, row[3], row[4], alpha)
    return img


def render_placeholder(out_path: str, poster: str | None):
    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not found on PATH")
    cmd = ["ffmpeg", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", out_path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                            stderr=subprocess.PIPE)
    assert proc.stdin is not None and proc.stderr is not None
    try:
        for i in range(TOTAL_FRAMES):
            t = i / FPS
            img = draw_frame(t)
            if poster and abs(t - 4.2) < 0.5 / FPS:
                img.convert("RGB").save(poster)
            proc.stdin.write(img.convert("RGB").tobytes())
    finally:
        proc.stdin.close()
        err = proc.stderr.read().decode("utf-8", "replace")
        rc = proc.wait()
    if rc != 0:
        sys.exit(f"ffmpeg failed ({rc}):\n{err[-2000:]}")


# --- real footage -----------------------------------------------------------
def write_ass(path: str):
    """Burn-in captions for the filmed cut: same words, same clock."""
    head = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,DejaVu Sans,58,&H00FFFFFF,&H00FFFFFF,&H00D96C7B,&H00000000,-1,0,0,0,100,100,0,0,4,18,0,2,60,60,444,1
Style: Sub,DejaVu Sans,38,&H0064754E,&H0064754E,&H00FCF3F7,&H00000000,0,0,0,0,100,100,0,0,4,10,0,2,60,60,370,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    def ts(x: float) -> str:
        h = int(x // 3600)
        m = int((x % 3600) // 60)
        s = x % 60
        return f"{h}:{m:02d}:{s:05.2f}"

    lines = []
    for i, (t0, t1, _phase, cap, cap2) in enumerate(SCHEDULE):
        nxt = SCHEDULE[i + 1][0] if i + 1 < len(SCHEDULE) else t1
        end = min(t1, nxt) - 0.04
        lines.append(f"Dialogue: 0,{ts(t0)},{ts(end)},Cap,,0,0,0,,{{\\fad(180,140)}}{cap}")
        if cap2:
            lines.append(f"Dialogue: 0,{ts(t0)},{ts(end)},Sub,,0,0,0,,{{\\fad(180,140)}}{cap2}")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(head + "\n".join(lines) + "\n")


def render_footage(src: str, out_path: str, ass: str | None):
    """Crop any clip to 9:16, hold it to 28 s, burn the captions."""
    if not os.path.exists(src):
        sys.exit(f"input not found: {src}")
    tmp_ass = ass or os.path.join(tempfile.mkdtemp(), "sigh.ass")
    if not ass:
        write_ass(tmp_ass)
    vf = ("scale=1080:1920:force_original_aspect_ratio=increase,"
          "crop=1080:1920,setsar=1,"
          "tpad=stop_mode=clone:stop_duration=8,"
          "trim=duration=28,setpts=PTS-STARTPTS,"
          f"subtitles={tmp_ass}")
    cmd = ["ffmpeg", "-y", "-i", src, "-vf", vf, "-an",
           "-r", str(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", out_path]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"ffmpeg failed:\n{r.stderr[-2500:]}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--placeholder", action="store_true")
    ap.add_argument("--input")
    ap.add_argument("--out", required=True, help="output directory")
    ap.add_argument("--poster", action="store_true")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    if not args.placeholder and not args.input:
        ap.error("choose --placeholder or --input CLIP")
    if args.placeholder:
        out = os.path.join(args.out, "sigh-timing-preview.mp4")
        poster = os.path.join(args.out, "sigh-timing-preview-poster.png") if args.poster else None
        render_placeholder(out, poster)
        print(f"wrote {out}")
        if poster:
            print(f"wrote {poster}")
    if args.input:
        out = os.path.join(args.out, "sigh-demonstration.mp4")
        render_footage(args.input, out, None)
        print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
