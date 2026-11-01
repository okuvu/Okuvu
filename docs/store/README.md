# docs/store — Play Store listing assets (E19-S3)

Everything in this directory is either an uploadable file or the generator for one. Nothing
here is hand-edited: if an image changes, the script that made it changes with it, in the
same commit.

| File | What it is | Play Console destination |
|---|---|---|
| `icon-512.png` | 512×512 32-bit PNG, full-bleed, opaque | Graphics → App icon |
| `feature-graphic-1024x500.png` | 1024×500 24-bit PNG, no alpha | Graphics → Feature graphic |
| `screenshots/` | **empty — blocked on a device**, see `screenshot-capture-plan.md` | Graphics → Phone screenshots |
| `listing-copy.md` | the four text fields, each in a fenced `text <field>` block | App name, Short description, Full description, Contact email |
| `build-assets.py` | regenerates both images from the app's own brand assets | — |
| `verify-listing.py` | measures both images and counts the copy against Play's limits | — |
| `finalize-screenshots.py` | crops raw `adb` captures to Play-compliant 1080×1920 | — |
| `screenshot-capture-plan.md` | the runbook for capturing the screenshots on a real device | — |

```bash
python3 docs/store/build-assets.py        # images
python3 docs/store/verify-listing.py      # 0 failures, exit 0
```

Requirements: Python 3 with Pillow. Current state and the two remaining blockers are recorded
in `evidence/E19-S3.md`.
