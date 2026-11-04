#!/usr/bin/env python3
"""Physiological-sigh video, AI-presenter cut.

Same caption schedule and same breath clock as `sigh_video.py` (which drives the
timing proof), so the proof Dr Goswami reviews and the generated cut cannot drift.

Two halves:

  --vo            build the 28 s narration track, each line placed on its own
                  beat and trimmed of edge-tts padding
  --presenter F   composite the generated presenter clip(s) with the app's own
                  breath circle, the approved captions, the AI-generated label
                  and the narration -> the finished 1080x1920 clip

`--test` builds a synthetic presenter clip and runs the real compose path on it,
so the capture-dependent half is verified before any generation is paid for.

Run with the reels venv (Pillow, numpy, edge-tts live there):
  /opt/data/reels/venv/bin/python scripts/sigh_video_ai.py --vo --out DIR
  /opt/data/reels/venv/bin/python scripts/sigh_video_ai.py --presenter clip.mp4 --out DIR
"""
from __future__ import annotations

import argparse
import asyncio
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:  # pragma: no cover
    sys.exit("Pillow and numpy are required: use /opt/data/reels/venv/bin/python")

import sigh_video as base  # SCHEDULE, palette, captions, breath circle

W, H, FPS = base.W, base.H, base.FPS
DURATION = base.DURATION
TOTAL_FRAMES = base.TOTAL_FRAMES
SCHEDULE = base.SCHEDULE

VOICE = "en-IN-NeerjaNeural"
RATE = "-8%"

# Spoken lines placed on the breath clock. `at` is when the line starts; a short
# sip beat gets a short line. Nothing speaks across a phase change, so the voice
# never tells a client to breathe in while the exercise says out.
VO_PLAN = [
    (0.15, "Two rounds."),
    (2.10, "Breathe in through your nose."),
    (6.05, "And a sip."),
    (7.05, "Long, slow breath out through your mouth."),
    (11.20, "Let the shoulders stay where they are."),
    (15.10, "In through your nose again."),
    (19.05, "A sip."),
    (20.10, "Now let it all out, slowly."),
]

LABEL = "AI-GENERATED DEMONSTRATION"


# ------------------------------------------------------------------ narration
def _ff(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["ffmpeg", "-v", "error", "-y", *args],
                          capture_output=True, text=True)


def _dur(path: str) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                          "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True).stdout.strip()
    return float(out) if out else 0.0


async def _tts(text: str, out: str) -> None:
    import edge_tts
    await edge_tts.Communicate(text, VOICE, rate=RATE).save(out)


def build_vo(out_dir: str) -> str:
    """One narration track, 28.0 s, each line on its beat, no clipping."""
    os.makedirs(out_dir, exist_ok=True)
    parts = []
    for i, (at, text) in enumerate(VO_PLAN):
        raw = os.path.join(out_dir, f"vo_{i:02d}_raw.mp3")
        trimmed = os.path.join(out_dir, f"vo_{i:02d}.wav")
        asyncio.run(_tts(text, raw))
        # edge-tts pads ~0.9 s of silence either side; strip it or every line
        # lands late and the sip beats collide with the exhale.
        _ff("-i", raw, "-af",
            "silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB:"
            "detection=peak,areverse,"
            "silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB:"
            "detection=peak,areverse,aresample=48000",
            "-ac", "1", "-c:a", "pcm_s16le", trimmed)
        parts.append((at, trimmed, _dur(trimmed)))

    over = []
    for i, (at, path, d) in enumerate(parts):
        end = at + d
        nxt = VO_PLAN[i + 1][0] if i + 1 < len(VO_PLAN) else DURATION
        if end > nxt + 0.05:
            over.append(f"line {i} '{VO_PLAN[i][1]}' ends {end:.2f}s, next beat {nxt:.2f}s")
    if over:
        sys.exit("narration does not fit the breath clock:\n  " + "\n  ".join(over))

    # lay the clips onto a silent 28 s bed at their beat offsets
    args = ["-f", "lavfi", "-t", f"{DURATION}", "-i", "anullsrc=r=48000:cl=mono"]
    for _at, path, _d in parts:
        args += ["-i", path]
    chains, mix = [], []
    for i, (at, _path, _d) in enumerate(parts):
        ms = int(round(at * 1000))
        chains.append(f"[{i + 1}:a]adelay={ms}|{ms},volume=1.0[a{i}]")
        mix.append(f"[a{i}]")
    filt = ";".join(chains) + ";" + "".join(mix) + \
        f"amix=inputs={len(parts) + 1}:normalize=0:dropout_transition=0," \
        "loudnorm=I=-16:TP=-1.5:LRA=11[aout]"
    out = os.path.join(out_dir, "sigh-vo.m4a")
    r = _ff(*args, "-filter_complex", filt, "-map", "[aout]",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000", out)
    if r.returncode != 0:
        sys.exit(f"narration mix failed:\n{r.stderr[-2000:]}")

    print(f"narration {out}  {_dur(out):.2f}s  voice {VOICE} {RATE}")
    for at, _p, d in parts:
        print(f"  {at:5.2f}s  {d:4.2f}s")
    return out


# ------------------------------------------------------------------ picture
def _scrim() -> Image.Image:
    """Bottom fade so captions and the ring read over any footage."""
    ramp = np.clip((np.linspace(0, 1, H) - 0.42) / 0.58, 0, 1)[:, None] ** 1.5
    alpha = (ramp * 205).astype(np.uint8)
    arr = np.zeros((H, W, 4), dtype=np.uint8)
    arr[..., 3] = np.repeat(alpha, W, axis=1)
    return Image.fromarray(arr, "RGBA")


SCRIM = _scrim()
CX, CY, R = W - 196, 1152, 96          # compact ring, clear of the face


def draw_ring(img: Image.Image, fill: float) -> None:
    """The app's own sigh visual, sized for a presenter frame."""
    r = R + 0.16 * R * min(fill, 1.0) + 0.07 * R * max(fill - 1.0, 0.0)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([CX - r - 8, CY - r - 8, CX + r + 8, CY + r + 8], fill=(*base.OAT, 150))
    d.ellipse([CX - r, CY - r, CX + r, CY + r], outline=(*base.VIOLET, 255), width=6)
    level = CY + r - 2 * r * min(fill, 1.0)
    water = Image.new("RGBA", img.size, (0, 0, 0, 0))
    wd = ImageDraw.Draw(water)
    wd.rectangle([CX - r, level, CX + r, CY + r], fill=(*base.VIOLET, 78))
    clip = Image.new("L", img.size, 0)
    ImageDraw.Draw(clip).ellipse([CX - r, CY - r, CX + r, CY + r], fill=255)
    water.putalpha(Image.composite(water.getchannel("A"), Image.new("L", img.size, 0), clip))
    layer.alpha_composite(water)
    if fill > 1.0:
        extra = (fill - 1.0) / 0.12
        rr = r + 12 + 8 * extra
        d.arc([CX - rr, CY - rr, CX + rr, CY + rr], 200, 340,
              fill=(*base.HONEY, int(120 + 110 * extra)), width=5)
    img.alpha_composite(layer)


def draw_caption_plate(img: Image.Image, primary: str, secondary: str, alpha: float) -> None:
    """Both lines inside one plate.

    The timing proof drew the second line bare onto a light background; over
    footage that line disappears into the picture, so here the plate has to
    cover it. Same band and same sizes as the proof, so the reviewer is looking
    at the same position she approved.
    """
    if alpha <= 0.01:
        return
    d = ImageDraw.Draw(img)
    fp = base.font(base.FONT_BOLD, 58)
    fs = base.font(base.FONT_REG, 38)
    max_w = 860
    p_lines = base.wrap(d, primary, fp, max_w)
    s_lines = base.wrap(d, secondary, fs, max_w) if secondary else []
    lh_p, lh_s = 74, 48
    gap = 26
    block_h = len(p_lines) * lh_p + (gap + len(s_lines) * lh_s if s_lines else 0)
    top = base.CAPTION_BOTTOM - block_h
    pad_x, pad_y = 34, 18
    widest = max(
        max((d.textlength(l, font=fp) for l in p_lines), default=0),
        max((d.textlength(l, font=fs) for l in s_lines), default=0),
    )
    plate_w = widest + 2 * pad_x
    x0 = (W - plate_w) / 2
    plate = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(plate).rounded_rectangle(
        [x0, top - pad_y, x0 + plate_w, top + block_h + pad_y],
        radius=26, fill=(*base.VIOLET, int(236 * alpha)))
    img.alpha_composite(plate)
    d = ImageDraw.Draw(img)
    y = top
    for l in p_lines:
        lw = d.textlength(l, font=fp)
        d.text(((W - lw) / 2, y), l, font=fp, fill=(255, 255, 255, int(255 * alpha)))
        y += lh_p
    if s_lines:
        y += gap
        for l in s_lines:
            lw = d.textlength(l, font=fs)
            d.text(((W - lw) / 2, y), l, font=fs, fill=(*base.OAT, int(245 * alpha)))
            y += lh_s


def draw_frame_from(presenter: Image.Image, t: float, label: str = LABEL) -> Image.Image:
    img = presenter.convert("RGBA")
    img.alpha_composite(SCRIM)
    draw_ring(img, base.lung_fill(t))
    d = ImageDraw.Draw(img)
    f = base.font(base.FONT_BOLD, 26)
    d.rounded_rectangle([40, 236, 40 + d.textlength(label, font=f) + 34, 284],
                        radius=10, fill=(0, 0, 0, 150))
    d.text((57, 248), label, font=f, fill=(255, 255, 255, 235))
    row = base.beat_at(t)
    span = row[1] - row[0]
    local = t - row[0]
    alpha = min(local / 0.25, 1.0, max((span - local) / 0.2, 0.0))
    draw_caption_plate(img, row[3], row[4], alpha)
    return img


def decoders(paths: list[str]):
    """Yield 1080x1920 frames, cycling the clips but never repeating frames."""
    for p in paths:
        cmd = ["ffmpeg", "-v", "error", "-i", p, "-vf",
               "scale=1080:1920:force_original_aspect_ratio=increase,"
               "crop=1080:1920,setsar=1,fps=30", "-f", "rawvideo",
               "-pix_fmt", "rgb24", "-"]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        assert proc.stdout is not None
        size = W * H * 3
        try:
            while True:
                buf = proc.stdout.read(size)
                if len(buf) < size:
                    break
                yield Image.frombytes("RGB", (W, H), buf)
        finally:
            proc.stdout.close()
            proc.wait()


def render_presenter(paths: list[str], out_path: str, vo: str | None,
                     poster: str | None, label: str = LABEL,
                     frames_iter=None) -> None:
    cmd = ["ffmpeg", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"]
    if vo:
        cmd += ["-i", vo]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    if vo:
        cmd += ["-c:a", "aac", "-b:a", "192k", "-shortest"]
    cmd += [out_path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                            stderr=subprocess.PIPE)
    assert proc.stdin is not None and proc.stderr is not None
    frames = frames_iter if frames_iter is not None else decoders(paths)
    p = None
    try:
        for i in range(TOTAL_FRAMES):
            try:
                p = next(frames)
            except StopIteration:
                if p is None:
                    p = base.BG          # nothing decoded at all: fail soft
                # else hold the last decoded frame rather than end early
            img = draw_frame_from(p, i / FPS, label)
            if poster and abs(i / FPS - 4.2) < 0.5 / FPS:
                img.convert("RGB").save(poster)
            proc.stdin.write(img.convert("RGB").tobytes())
    finally:
        proc.stdin.close()
        err = proc.stderr.read().decode("utf-8", "replace")
        rc = proc.wait()
    if rc != 0:
        sys.exit(f"ffmpeg failed ({rc}):\n{err[-2500:]}")


def test_clip(path: str) -> str:
    """A stand-in presenter so the compose path is exercised for real."""
    _ff("-f", "lavfi", "-i",
        "testsrc2=size=720x1280:rate=30:duration=40,"
        "drawbox=x=0:y=0:w=720:h=1280:color=0x6b5f8a@0.25:t=fill",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", path)
    return path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vo", action="store_true", help="build the narration track")
    ap.add_argument("--presenter", nargs="+", help="generated presenter clip(s)")
    ap.add_argument("--preview", action="store_true",
                    help="brand background + narration, no presenter (labelled)")
    ap.add_argument("--test", action="store_true", help="synthetic presenter, real compose")
    ap.add_argument("--out", required=True)
    ap.add_argument("--poster", action="store_true")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    vo = os.path.join(args.out, "sigh-vo.m4a")
    if args.vo or args.presenter or args.test or args.preview:
        if not (os.path.exists(vo) and not args.vo):
            vo = build_vo(args.out)

    if args.preview:
        out = os.path.join(args.out, "sigh-voice-preview.mp4")
        poster = os.path.join(args.out, "sigh-voice-preview-poster.png") if args.poster else None
        render_presenter([], out, vo, poster,
                         label="PREVIEW — VOICE + TIMING, NO PRESENTER YET",
                         frames_iter=(base.BG for _ in range(TOTAL_FRAMES)))
        print(f"wrote {out}  {_dur(out):.2f}s")

    if args.presenter:
        out = os.path.join(args.out, "sigh-demonstration-ai.mp4")
        poster = os.path.join(args.out, "sigh-demonstration-ai-poster.png") if args.poster else None
        render_presenter(args.presenter, out, vo, poster)
        print(f"wrote {out}  {_dur(out):.2f}s")
        if poster:
            print(f"wrote {poster}")

    if args.test:
        src = test_clip(os.path.join(args.out, "_test_presenter.mp4"))
        out = os.path.join(args.out, "sigh-compose-test.mp4")
        poster = os.path.join(args.out, "sigh-compose-test-poster.png")
        render_presenter([src], out, vo, poster)
        print(f"wrote {out}  {_dur(out):.2f}s  (synthetic presenter: layout test only)")
        print(f"wrote {poster}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
