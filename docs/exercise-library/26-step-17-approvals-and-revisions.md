# Step 17 — the owner's decisions on the Stress & Burnout batch

Status: **eight approved and switched on in the catalogue; two revised and still
drafts; nothing merged, no APK, no deploy.** Branch `feat/worksheet-rules`.

The owner's decisions, in chat, on 24 November 2026:

1. Approve as written: What's on my plate, Basics check, Rest break, Boundary
   planner, Priority sorter, Doomscroll log, Weekly load check, Caring load
   check.
2. Change two, and send the new wording:
   - **Unsent letter** — replace the helper above "Write the letter", and add a
     helper line under "Delete it".
   - **Weighing it up** — ask what the change is before the four boxes, and make
     the boxes refer to it; reword the readiness helper.
3. Weekly load check — show the load number beside each date in Past me, written
   as "7 out of 10". No graph, no average.
4. The four reused rows must show their new names, not the placeholder names.

## What changed in the catalogue

| Row | Status now | Note |
|---|---|---|
| `ws_whats_on_my_plate` | approved 2026-11-24 | unchanged copy |
| `ws_basics_check` | approved 2026-11-24 | unchanged copy |
| `ws_rest_break` | approved 2026-11-24 | unchanged copy |
| `ws_boundary_planner` | approved 2026-11-24 | unchanged copy, new name was already in place |
| `ws_priority_sorter` | approved 2026-11-24 | unchanged copy |
| `ws_scrolling_log` | approved 2026-11-24 | **Doomscroll log**; keeps the deeper screen |
| `ws_weekly_load_check` | approved 2026-11-24 | gains `timeline.leadField: 'load'` |
| `ws_caring_load_check` | approved 2026-11-24 | unchanged copy |
| `ws_unsent_letter` | **draft** | new helper + delete helper, awaiting approval |
| `ws_pros_cons_change` | **draft** | new first question, reworded boxes, awaiting approval |

Approval dates are per row: the eight carry `approved_at = 2026-11-24`, so the
9 Nov 2026 document is not retroactively changed by a later approval.

## The two revised drafts

Both are in `23-draft-stress-burnout-copy.md` for review, with the option helper
shown under the option it belongs to.

**Unsent letter.** The letter helper is now: "Nobody reads this unless you choose
to share it. If something you write sounds like you might not be safe, OKUVU will
check in with you and may let your therapist know." Under "Delete it": "This
deletes the letter. If OKUVU already checked in about something you wrote, your
therapist may still know that a check-in happened."

**Weighing it up.** A new first question — "What change are you thinking about?"
— a required short answer. The four boxes now read: "What might be good about
this change?", "What might be good about not making this change?", "What might
this change cost you?", "What might not making this change cost you?" The
readiness helper is now "There's no right number. Readiness can change from day
to day."

## Past me reads the load number

`content.timeline.leadField` names one `scale_0_10` piece. When a saved row has a
whole number 0-10 for it, the Past me excerpt starts with "7 out of 10" and then
the client's own words, joined with "·". It is content, not a tool id: only the
weekly load check declares it, so no other row's Past me entry changes. A value
that is not a whole number in range is ignored rather than clamped or rounded.

The validator refuses a `leadField` that is not an earlier `scale_0_10` piece and
refuses any key other than `leadField`, so a "lead" can never become a summary or
a computed figure.

## Migrations

Three, in order, each generated and byte-pinned by a test:

1. `20261109130000_seed_library_worksheets` — untouched (already applied).
2. `20261124140000_seed_stress_burnout_drafts` — still all ten rows, every one
   written `'draft'`, with the revised copy for the two that were sent back.
3. `20261124160000_approve_stress_burnout_eight` — INSERT … ON CONFLICT for the
   eight approved rows, carrying `'approved'` and `'2026-11-24'` with the copy.

Approval is a full upsert rather than `UPDATE … SET status`: the copy travels
with the status, so a promoted row can never keep a body the approval did not
cover.

## Verification

| Suite | Result |
|---|---|
| shared-types | 154 / 154 |
| api | 2059 / 2059 (116 files) |
| therapist portal | 431 / 431 (40 files) |
| shared-types `tsc` | clean |
| api `tsc` | clean, against a client generated from this branch's schema |

The Prisma client is shared with `/opt/data/okuvu/ts` through a symlinked
`node_modules`. It was generated from this branch's schema to typecheck the api,
then restored from a backup tarball, and the other checkout typechecks clean
again afterwards.

No Dart changed. The app already renders `option.description` under a choice, and
the body parser reads `version / intro / fields / closing` and ignores an unknown
top-level key, so `timeline` reaches the api and the app is unaffected.

## Tests updated, and why

- The approved-copy pin now reads two documents: `02-…` for worksheets 1-16 and
  `25-approved-stress-burnout-copy.md` for these eight.
- The library count moved from 16 to 24; the care-plan label list gained the
  eight.
- The draft count moved from 10 to 2, and the draft pins now name them.
- The rule-3 pin "every approved worksheet is shared-screen only" became "the
  only approved worksheet with the deeper screen is the Doomscroll log" — the
  old form was only true while all five sensitive rows were unapproved.
- The portal preview pin "every approved worksheet has both bodies" became "every
  approved worksheet has an English body", plus an explicit pin that the eight
  new rows have no Hinglish.
