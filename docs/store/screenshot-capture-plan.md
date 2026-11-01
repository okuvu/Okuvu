# Okuvu — phone screenshot capture plan (E19-S3)

**Status: BLOCKED-ON-DEVICE.** No screenshots exist yet. They cannot be produced on this
host: there is no Android device attached, no emulator package installed, no emulator
system image, no `/dev/kvm`, and the CPU exposes no virtualisation flags (`vmx`/`svm`).
See §7 for the exact commands and output. Everything else about the listing is finished;
this file is the runbook that turns "no screenshots" into "two or more real ones" in about
20 minutes on a phone that has the prod build.

Play requires **2–8 phone screenshots**, taken from the app itself. This plan produces
**five**, in this order, because that is the order the store shows them.

---

## 1. What Play will accept

| Rule | Value |
|---|---|
| Count (phone) | 2 minimum, 8 maximum |
| Format | JPEG or 24-bit PNG, **no alpha** |
| Minimum side | 320 px |
| Maximum side | 3840 px |
| Aspect ratio | **no more than 2:1** — i.e. anywhere between 16:9 and 9:16 |

That last row is the trap: a modern phone captures ~9:20 (1080×2400 = 2.22:1), which Play
rejects. Raw `screencap` output therefore has to be cropped to 9:16 before upload. §5 does
this with `docs/store/finalize-screenshots.py`, which crops (never stretches, never pads
with invented chrome) and writes 1080×1920.

Source: <https://support.google.com/googleplay/android-developer/answer/9866155>

---

## 2. Before capturing

1. **Use the prod build**, package `ai.okuvu.app` (`flutter build apk --flavor prod`), so the
   screenshots show the store binary, not the dev flavour: the dev flavour has an
   `applicationIdSuffix ".dev"` and points at a different host.
2. **Use a demo client account provisioned by a therapist**, not a real client's data. The
   account must be one the team owns, with a name like `Demo Client`, so no real person's
   journal entries, mood history or chat turns end up in a public store listing. This is
   the one hard rule: a screenshot is published forever and cannot be "deleted", so no real
   health data may appear in one.
3. **Seed engagement data** on that account before capturing (at least three chat turns, one
   saved journal entry, a few days of mood check-ins, one upcoming appointment). Empty
   states make a listing look abandoned; fabricated-looking data makes it look fake. Real
   demo data on a demo account is the only honest middle.
4. **Turn off anything that can leak or clutter**: notifications (Settings → Notifications),
   Do Not Disturb on, and make sure no OTP code, no phone number and no real therapist name
   is on screen. If the assigned therapist's name is a real staff member, use a demo
   therapist record instead.
5. **Normalise the device** so the UI renders at its intended size and frames are stable:

```bash
adb shell settings put system font_scale 1.0
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell wm size            # note the panel size, e.g. 1080x2400
```

6. **Never capture**: the crisis overlay, an error/retry state, the consent screen mid-flow,
   the OTP screen with a live code, or anything showing the waitlist for a real number.

---

## 3. The five frames

Navigate inside the app by tapping; the manifest declares no deep-link `VIEW` intent filter,
so `adb shell am start -d okuvu://...` will not work. Launch with:

```bash
adb shell monkey -p ai.okuvu.app -c android.intent.category.LAUNCHER 1
```

| # | Screen (route) | What the frame must show | Why it is in the listing |
|---|---|---|---|
| 01 | **Home** (`/home`) | The `OKUVU` app bar, the time-of-day greeting, the Today card, the mood check-in row, the next-session card, and the **Breathe** tile | It is the first thing a new user sees: one glance says "daily companion", not "chatbot" |
| 02 | **Chat** (`/chat`) | Three or more visible turns of a real conversation with the companion, the `Your session` header, and the composer with the mic button | The core product. Show the voice affordance, since dictation is a headline feature |
| 03 | **Journal** (`/journal`) | A written entry with its selected emotion and intensity (or the journal list with two or three entries) | Proves there is a private, non-chat surface — the copy promises journal text is not shared with the therapist |
| 04 | **Progress** (`/progress`) | `Your Progress`, the mood trend chart over several days, and the care-journey stage | The "it builds over time" story, and the only frame that shows longitudinal value |
| 05 | **Appointments** (`/appointments`) | The upcoming appointment card and the therapist's note / homework for it | Shows the therapist connection is real, not decorative |

If only two are possible, capture **01 and 02** — the acceptance clause is "at least two
screenshots taken from the real app", and those two carry the product.

---

## 4. Capture

With the screen you want on the device, run:

```bash
mkdir -p raw
adb exec-out screencap -p > raw/01-home.png
```

Then navigate and repeat, changing only the filename:

```bash
adb exec-out screencap -p > raw/02-chat.png
adb exec-out screencap -p > raw/03-journal.png
adb exec-out screencap -p > raw/04-progress.png
adb exec-out screencap -p > raw/05-appointments.png
```

`exec-out` is binary-safe and avoids the CRLF corruption that `adb shell screencap -p >
file.png` can cause on Windows shells. If you are on Windows, use the two-step form instead:

```bash
adb shell screencap -p /sdcard/shot.png
adb pull /sdcard/shot.png raw/01-home.png
adb shell rm /sdcard/shot.png
```

Check every file is a real, complete PNG before moving on — a truncated capture is the most
common failure and it looks like a corrupt image rather than an error:

```bash
python3 -c "from PIL import Image; import sys; [print(p, Image.open(p).size) for p in sys.argv[1:]]" raw/*.png
```

On a 1080×2400 device each line must read `(1080, 2400)`.

---

## 5. Make them Play-compliant

```bash
python3 docs/store/finalize-screenshots.py raw/01-home.png raw/02-chat.png \
    raw/03-journal.png raw/04-progress.png raw/05-appointments.png
```

It crops the surplus to 9:16 and writes `docs/store/screenshots/01-home.png` … at exactly
1080×1920, 24-bit, no alpha, printing `PASS … ratio=1.778` per file. Commit those five
files. (The script's crop maths is already exercised and passing; see the evidence file. It
has never been run on a screenshot, because there is no device.)

---

## 6. Upload

Play Console → **Grow → Store presence → Main store listing → Graphics → Phone screenshots**.
Upload `01`–`05` in that order. Then confirm the listing shows them without the "Your app
needs a screenshot" warning, and re-read each one at thumbnail size: if the value is not
legible at ~200 px wide, it is the wrong frame.

---

## 7. Why this is blocked here (recorded, not assumed)

```console
$ ls -l /dev/kvm
ls: cannot access '/dev/kvm': No such file or directory
$ grep -c -E "(^flags.*(vmx|svm))" /proc/cpuinfo
0
$ nproc; free -m | sed -n 2p
4
Mem:            7941        3664        3517           2        1108        4277
$ ls /opt/data/home/.local/android/emulator
ls: cannot access '/opt/data/home/.local/android/emulator': No such file or directory
$ ls /opt/data/home/.local/android/system-images
ls: cannot access '/opt/data/home/.local/android/system-images': No such file or directory
$ adb devices
List of devices attached
```

No device, no emulator binary, no system image, no hardware virtualisation. Installing the
emulator package plus an API 36 system image would be a ~2 GB download and would then have
to boot under full software emulation (`-accel off`) on 4 shared cores with no GPU — the
usual outcome is a 20–30 minute boot that never reaches the launcher, and this task's time
box for proving or disproving emulator viability was 40 minutes. It was not attempted
further: the honest answer is that this host cannot produce a screenshot, and the runbook
above is worth more than a half-booted emulator.

Explicitly **not** done, and not acceptable as a substitute: golden/widget renders from
`flutter test`, screenshots of a Figma or HTML mockup, or screenshots of the therapist
portal. None of those are "screenshots taken from the real app", and presenting them as such
would be a false claim in the evidence.

---

## 8. Definition of done for this clause

- [ ] Five PNGs in `docs/store/screenshots/`, each 1080×1920, 24-bit, no alpha
- [ ] Each shows a screen from §3 with demo-account data only
- [ ] Uploaded to Play Console → Main store listing → Phone screenshots
- [ ] Listing preview renders them without a warning
- [ ] `evidence/E19-S3.md` updated: clause moves from BLOCKED-ON-DEVICE to DONE, with the
      device model, Android version, build flavour and the five filenames
