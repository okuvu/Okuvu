#!/usr/bin/env python3
"""Turn an uploaded presenter clip into the physiological-sigh review cut.

The point of this tool: the footage is NOT assumed to be at Dr Goswami's pace.
A person filmed breathing naturally will be at 9 s a breath or 16 s a breath,
and burning captions over that produces exactly the fault Rajwant reported in
the app -- the words and the movement disagree. So the cut CONFORMS the
footage to the approved schedule instead of hoping:

    0.0 -  2.0   first frame held frozen   ("Two rounds. Follow along.")
    2.0 - 15.0   one breath cycle            (4 s in / 1 s sip / 8 s out)
   15.0 - 28.0   the same cycle again

One breath cycle is retimed to exactly 13.000 s (pitch-preserved if the source
audio is kept), so the pace cannot drift no matter what was uploaded.
Output is always 1080x1920, 30 fps, exactly 28.000 s / 840 frames.

Modes
  inspect   probe a file: duration, fps, size, rotation, audio; suggest a cycle
  cut       build the review cut (default: our approved narration + captions)

Examples
  python scripts/sigh_ingest.py inspect --input ~/upload.mp4
  python scripts/sigh_ingest.py cut --input ~/upload.mp4 --out evidence/sigh-video
  python scripts/sigh_ingest.py cut --input ~/upload.mp4 --cycle 1.2:10.6 --out ...
  python scripts/sigh_ingest.py cut --input ~/upload.mp4 --audio source --captions off

Use the reels venv (Pillow lives there):
  /opt/data/reels/venv/bin/python scripts/sigh_ingest.py ...
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

W, H, FPS = 1080, 1920, 30
DURATION = 28.0
LEAD_IN = 2.0
CYCLE = 13.0
TOTAL_FRAMES = int(round(DURATION * FPS))     # 840
CYCLE_FRAMES = int(round(CYCLE * FPS))        # 390
LEAD_FRAMES = int(round(LEAD_IN * FPS))       # 60

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
NARRATION = os.path.join(REPO, "evidence", "sigh-video", "sigh-vo.m4a")

sys.path.insert(0, HERE)
try:
    from sigh_video import SCHEDULE, write_ass  # one caption schedule, never a copy
except ImportError:
    sys.exit("cannot import SCHEDULE from scripts/sigh_video.py")


def run(cmd: list[str], what: str) -> None:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"{what} failed ({r.returncode}):\n{r.stderr[-2500:]}")


def probe(src: str) -> dict:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json",
         "-show_format", "-show_streams", src],
        capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"cannot read {src}:\n{r.stderr[-1200:]}")
    return json.loads(r.stdout)


def describe(info: dict) -> dict:
    v = next((s for s in info["streams"] if s.get("codec_type") == "video"), None)
    a = next((s for s in info["streams"] if s.get("codec_type") == "audio"), None)
    if v is None:
        sys.exit("no video stream in that file")
    num, _, den = v.get("r_frame_rate", "30/1").partition("/")
    fps = float(num) / float(den or 1)
    rot = 0
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(float(sd["rotation"]))
    rot = rot or int(float((v.get("tags") or {}).get("rotate", 0) or 0))
    return {
        "duration": float(info["format"].get("duration") or v.get("duration") or 0),
        "width": int(v.get("width") or 0),
        "height": int(v.get("height") or 0),
        "fps": fps,
        "rotation": rot,
        "codec": v.get("codec_name"),
        "audio": None if a is None else {
            "codec": a.get("codec_name"),
            "channels": a.get("channels"),
            "sample_rate": a.get("sample_rate"),
            "duration": float(a.get("duration") or 0),
        },
    }


def cmd_inspect(src: str) -> None:
    d = describe(probe(src))
    print(f"file        {src}")
    print(f"duration    {d['duration']:.3f} s")
    print(f"frame       {d['width']}x{d['height']} @ {d['fps']:.3f} fps"
          + (f"  (rotation {d['rotation']})" if d["rotation"] else ""))
    print(f"video codec {d['codec']}")
    if d["audio"]:
        au = d["audio"]
        print(f"audio       {au['codec']} {au['channels']}ch "
              f"{au['sample_rate']} Hz, {au['duration']:.3f} s")
    else:
        print("audio       none")
    print()
    # Orientation decision: a landscape phone clip needs the subject centred,
    # and a tall enough source that the 9:16 crop does not cut the head off.
    if d["rotation"] in (90, -90, 270):
        print("note        rotate metadata present; ffmpeg will autorotate")
    aspect = d["width"] / max(d["height"], 1)
    if aspect > 1.05:
        print("note        landscape source: cropping to 9:16, subject must be centred")
    if d["duration"] < CYCLE:
        print(f"WARN        clip is {d['duration']:.2f} s, shorter than one "
              f"{CYCLE:.0f} s cycle; it will be slowed down to fit")
    print(f"cut plan    hold first frame {LEAD_IN:.0f} s, then this clip as ONE "
          f"breath cycle retimed to {CYCLE:.0f} s, played twice")
    if d["audio"]:
        print("            source audio present -> choose --audio source|narration")
    else:
        print("            no source audio -> our approved narration is used")


PHASE_TARGETS = (4.0, 1.0, 8.0)   # in, sip, out — Dr Goswami's v2.0.0 numbers


def build_segment(src: str, dst: str, a: float, b: float, target: float) -> None:
    """Retime ONE phase to its exact length, so the beats cannot drift."""
    span = max(b - a, 0.05)
    speed = target / span
    vf = (f"setpts={speed:.9f}*(PTS-STARTPTS),"
          f"scale={W}:{H}:force_original_aspect_ratio=increase,"
          f"crop={W}:{H},setsar=1,fps={FPS},"
          f"trim=end={target},setpts=PTS-STARTPTS")
    run(["ffmpeg", "-y", "-ss", f"{a}", "-to", f"{b}", "-i", src,
         "-an", "-map", "0:v:0", "-vf", vf,
         "-t", f"{target}", "-r", str(FPS),
         "-c:v", "libx264", "-preset", "medium", "-crf", "18",
         "-pix_fmt", "yuv420p", dst], f"retime {a:.2f}-{b:.2f}s -> {target:.0f}s")


def build_cycle(src: str, dst: str, a: float, b: float, keep_audio: bool,
                phases: tuple[float, float, float, float] | None = None) -> None:
    """Build the 13 s cycle.

    With `phases` (in-start, sip-start, out-start, out-end) each phase is
    retimed on its own to 4 / 1 / 8 s, so a presenter who breathed 6 in and
    4 out still lands on the clinician's beats. Without `phases` the whole clip
    is stretched as one breath, which keeps the source's proportions — only
    correct if those proportions were already right.
    """
    if phases is None:
        span = max(b - a, 0.05)
        speed = CYCLE / span
        vf = (f"setpts={speed:.9f}*(PTS-STARTPTS),"
              f"scale={W}:{H}:force_original_aspect_ratio=increase,"
              f"crop={W}:{H},setsar=1,fps={FPS},"
              f"trim=end={CYCLE},setpts=PTS-STARTPTS")
        cmd = ["ffmpeg", "-y", "-ss", f"{a}", "-to", f"{b}", "-i", src]
        if keep_audio:
            cmd += ["-af", f"atempo={1/speed:.9f},aresample=48000",
                    "-map", "0:v:0", "-map", "0:a:0"]
        else:
            cmd += ["-an", "-map", "0:v:0"]
        cmd += ["-vf", vf,
                "-t", f"{CYCLE}", "-r", str(FPS),
                "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
        cmd += ["-c:a", "aac", "-b:a", "160k"] if keep_audio else []
        cmd += [dst]
        run(cmd, "cycle conform")
        return

    if keep_audio:
        sys.exit("--audio source cannot be combined with --phases: retiming each "
                 "phase separately makes the presenter's own voice unusable.")
    p0, p1, p2, p3 = phases
    wid = os.path.dirname(dst)
    segs = []
    for i, (s0, s1, tgt) in enumerate(((p0, p1, PHASE_TARGETS[0]),
                                       (p1, p2, PHASE_TARGETS[1]),
                                       (p2, p3, PHASE_TARGETS[2]))):
        seg = os.path.join(wid, f"seg{i}.mp4")
        build_segment(src, seg, s0, s1, tgt)
        segs.append(seg)
    concat(segs, dst, wid)


def build_freeze(cycle: str, dst: str, tmp: str) -> None:
    png = os.path.join(tmp, "first.png")
    run(["ffmpeg", "-y", "-i", cycle, "-frames:v", "1", png], "grab first frame")
    run(["ffmpeg", "-y", "-loop", "1", "-i", png, "-t", f"{LEAD_IN}", "-r", str(FPS),
         "-vf", f"scale={W}:{H},setsar=1",
         "-c:v", "libx264", "-preset", "medium", "-crf", "18",
         "-pix_fmt", "yuv420p", dst], "freeze lead-in")


def concat(parts: list[str], dst: str, tmp: str) -> None:
    lst = os.path.join(tmp, "parts.txt")
    with open(lst, "w", encoding="utf-8") as fh:
        for p in parts:
            fh.write(f"file '{p}'\n")
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", lst,
         "-c", "copy", "-movflags", "+faststart", dst], "concat")


def find_ass() -> str:
    """Reuse the committed caption file if present, else write it from SCHEDULE."""
    for cand in (os.path.join(REPO, "evidence", "sigh-video", "sigh.ass"),
                 os.path.join(HERE, "sigh.ass")):
        if os.path.exists(cand):
            return cand
    path = os.path.join(tempfile.mkdtemp(), "sigh.ass")
    write_ass(path)
    return path


def measure(path: str) -> dict:
    info = probe(path)
    v = next(s for s in info["streams"] if s.get("codec_type") == "video")
    frames = v.get("nb_frames")
    dur = float(info["format"].get("duration") or 0)
    loud = None
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", path,
         "-af", "loudnorm=I=-16:TP=-1.5:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True)
    if "input_i" in r.stderr:
        tail = r.stderr[r.stderr.rfind("{"):r.stderr.rfind("}") + 1]
        try:
            loud = float(json.loads(tail)["input_i"])
        except Exception:
            loud = None
    return {"duration": dur, "frames": int(frames) if frames else None,
            "lufs": loud, "has_audio": any(
                s.get("codec_type") == "audio" for s in info["streams"])}


def contact_sheet(path: str, dst: str) -> list[str]:
    from PIL import Image
    marks = [1.0, 5.0, 10.0, 14.0, 20.0, 26.0]   # rest, inhale, sip, end of exhale, cycle 2 in, cycle 2 out
    dur = float(probe(path)["format"].get("duration") or 0)
    marks = [min(m, max(dur - 0.1, 0.0)) for m in marks]
    tiles = []
    tmp = tempfile.mkdtemp()
    for i, t in enumerate(marks):
        f = os.path.join(tmp, f"f{i}.png")
        run(["ffmpeg", "-y", "-ss", f"{t}", "-i", path, "-frames:v", "1", f], f"grab {t}s")
        im = Image.open(f).convert("RGB").resize((360, 640), Image.Resampling.LANCZOS)
        tiles.append((t, im))
    sheet = Image.new("RGB", (360 * len(tiles), 640), (247, 243, 253))
    for i, (_t, im) in enumerate(tiles):
        sheet.paste(im, (360 * i, 0))
    sheet.save(dst)
    return [f"{t:.0f}s" for t in marks]


def compose_final(joined: str, dst: str, audio: str, captions: bool) -> None:
    """Composite the app's caption plate onto every frame, then mux audio.

    Done in-process rather than via an ASS subtitle filter: the filter's text
    has no wrapping and stacks both lines on the same baseline, which clipped
    the long exhale line and overprinted the secondary line. This uses the same
    draw_caption() that produced the preview Dr Goswami reviews, so the burned
    captions and the app's on-screen captions are the same typography.
    """
    from PIL import Image
    from sigh_video import beat_at, draw_caption

    dec = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", joined,
         "-vf", f"scale={W}:{H},setsar=1,fps={FPS}",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert dec.stdout is not None

    enc_cmd = ["ffmpeg", "-y", "-v", "error",
               "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
               "-r", str(FPS), "-i", "-"]
    if audio == "narration":
        enc_cmd += ["-i", NARRATION, "-map", "0:v:0", "-map", "1:a:0",
                    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                    "-c:a", "aac", "-b:a", "160k", "-ar", "48000"]
    elif audio == "source":
        enc_cmd += ["-i", joined, "-map", "0:v:0", "-map", "1:a:0",
                    "-c:a", "aac", "-b:a", "160k", "-ar", "48000"]
    else:
        enc_cmd += ["-an"]
    enc_cmd += ["-t", f"{DURATION}", "-r", str(FPS),
                "-c:v", "libx264", "-preset", "medium", "-crf", "19",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart", dst]
    enc = subprocess.Popen(enc_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    assert enc.stdin is not None and enc.stderr is not None

    nbytes = W * H * 3
    try:
        for i in range(TOTAL_FRAMES):
            buf = dec.stdout.read(nbytes)
            if len(buf) < nbytes:
                break
            t = i / FPS
            img = Image.frombytes("RGB", (W, H), buf).convert("RGBA")
            if captions:
                row = beat_at(t)
                span = row[1] - row[0]
                local = t - row[0]
                alpha = min(local / 0.25, 1.0, max((span - local) / 0.2, 0.0))
                draw_caption(img, row[3], row[4], alpha)
            enc.stdin.write(img.convert("RGB").tobytes())
    finally:
        enc.stdin.close()
        eerr = enc.stderr.read().decode("utf-8", "replace")
        dec.stdout.close()
        dec.wait()
        rc = enc.wait()
    if rc != 0:
        sys.exit(f"final encode failed:\n{eerr[-2500:]}")


def cmd_cut(src: str, out: str, cycle: tuple[float, float] | None,
            audio: str, captions: bool,
            phases: tuple[float, float, float, float] | None = None) -> bool:
    os.makedirs(out, exist_ok=True)
    d = describe(probe(src))
    if cycle is None:
        a, b = 0.0, d["duration"]
    else:
        a, b = cycle
        if b > d["duration"] + 0.05:
            sys.exit(f"cycle end {b:.2f}s is past the clip ({d['duration']:.2f}s)")
    if b - a < 1.0:
        sys.exit(f"cycle is only {b - a:.2f}s; need at least one full breath")
    keep_audio = audio == "source" and d["audio"] is not None
    if audio == "source" and d["audio"] is None:
        print("note: --audio source but the clip has no audio; using narration")
        audio = "narration"
    if audio == "narration" and not os.path.exists(NARRATION):
        sys.exit(f"approved narration missing: {NARRATION}")

    tmp = tempfile.mkdtemp(prefix="sigh-ingest-")
    try:
        cyc, frz = os.path.join(tmp, "cycle.mp4"), os.path.join(tmp, "freeze.mp4")
        joined = os.path.join(tmp, "joined.mp4")
        if phases:
            p0, p1, p2, p3 = phases
            print(f"phases      in {p0:.2f}-{p1:.2f}s -> 4 s | "
                  f"sip {p1:.2f}-{p2:.2f}s -> 1 s | out {p2:.2f}-{p3:.2f}s -> 8 s")
            print(f"conforming  one breath cycle -> {CYCLE:.3f}s cycle")
        else:
            print(f"conforming  {a:.2f}s–{b:.2f}s ({b - a:.2f}s) -> {CYCLE:.3f}s cycle")
            print("WARN        no --phases given: the source's own proportions are "
                  "kept, so the sip may not land at 6 s")
        build_cycle(src, cyc, a, b, keep_audio, phases)
        ci = probe(cyc)
        cv = next(s for s in ci["streams"] if s.get("codec_type") == "video")
        c_dur = float(ci["format"].get("duration") or 0)
        c_fr = int(cv.get("nb_frames") or 0)
        print(f"cycle       {c_dur:.3f} s, {c_fr} frames "
              f"(expected {CYCLE:.3f} s, {CYCLE_FRAMES})")
        if abs(c_dur - CYCLE) > 0.05 or c_fr != CYCLE_FRAMES:
            sys.exit("cycle conform did not land on the 13 s beat — refusing to "
                     "build a cut whose picture and captions would disagree")
        build_freeze(cyc, frz, tmp)
        concat([frz, cyc, cyc], joined, tmp)

        final = os.path.join(out, "sigh-demonstration.mp4")
        compose_final(joined, final, audio if audio != "source" else ("source" if keep_audio else "none"),
                      captions)

        m = measure(final)
        ok = True
        if abs(m["duration"] - DURATION) > 0.05:
            print(f"FAIL duration {m['duration']:.3f}s, expected {DURATION:.3f}s")
            ok = False
        if m["frames"] is not None and m["frames"] != TOTAL_FRAMES:
            print(f"FAIL {m['frames']} frames, expected {TOTAL_FRAMES}")
            ok = False
        if (audio != "none") != m["has_audio"]:
            print("FAIL audio presence does not match the requested mode")
            ok = False
        poster = os.path.join(out, "sigh-demonstration-poster.png")
        marks = contact_sheet(final, poster)
        print(f"\nwrote       {final}")
        print(f"duration    {m['duration']:.3f} s   frames {m['frames']}   "
              f"audio {'yes' if m['has_audio'] else 'no'}"
              + (f"   {m['lufs']:.1f} LUFS" if m["lufs"] is not None else ""))
        print(f"poster      {poster}   (frames at {', '.join(marks)})")
        print("VERIFIED" if ok else "NOT VERIFIED")
        return ok
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    pi = sub.add_parser("inspect")
    pi.add_argument("--input", required=True)
    pc = sub.add_parser("cut")
    pc.add_argument("--input", required=True)
    pc.add_argument("--out", required=True)
    pc.add_argument("--cycle", help="a:b seconds = ONE breath cycle "
                                    "(default: the whole clip)")
    pc.add_argument("--audio", choices=["narration", "source", "none"],
                    default="narration")
    pc.add_argument("--captions", choices=["on", "off"], default="on")
    pc.add_argument("--phases", help="a:b:c:d = start of inhale, start of sip, "
                                     "start of exhale, end of exhale. Each phase is "
                                     "retimed to 4 / 1 / 8 s so the beats cannot drift.")
    args = ap.parse_args()

    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not on PATH")
    if args.cmd == "inspect":
        cmd_inspect(args.input)
        return 0
    cyc = None
    if args.cycle:
        try:
            a_s, b_s = args.cycle.split(":")
            cyc = (float(a_s), float(b_s))
        except ValueError:
            sys.exit("--cycle must look like 1.2:10.6")
    ph = None
    if args.phases:
        try:
            parts = [float(x) for x in args.phases.split(":")]
        except ValueError:
            sys.exit("--phases must look like 0.4:6.0:7.0:15.0")
        if len(parts) != 4:
            sys.exit("--phases needs exactly four times")
        if any(parts[i] >= parts[i + 1] for i in range(3)):
            sys.exit("--phases times must increase")
        ph = (parts[0], parts[1], parts[2], parts[3])
        cyc = (ph[0], ph[3])
    ok = cmd_cut(args.input, args.out, cyc, args.audio, args.captions == "on", ph)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
