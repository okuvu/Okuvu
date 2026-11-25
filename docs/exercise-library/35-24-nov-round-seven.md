# Round seven, 24 November 2026 — Anxiety & Worry approved, and the read-back screened

**Status: not merged, not deployed, no app built.** Everything below is on
`feat/worksheet-rules`.

## 1. The nine approved

The owner approved all nine Anxiety & Worry worksheets on 24 Nov 2026: five as
written (Worry time, Brain-dump, Big day planner, Pressure map, Exposure ladder,
plus the exposure pause line) and four after the revisions he dictated
(Unhooking from a thought, SOS calm, Sitting with not knowing, Social situation
prep).

- The approval is `20261124220000_approve_anxiety_worry_nine`, generated from the
  catalogue, carrying the approved copy with the status.
- The approved copy is recorded in `34-approved-anxiety-worry-copy.md`, and
  `__tests__/worksheets.test.ts` checks the catalogue against it sentence by
  sentence — a paraphrase fails the build.
- Pressure map stays one line per area: no grouped piece, as the owner decided.
- The Exposure ladder is approved and `therapist_only`. Approval is not
  publication: `CLIENT_LIBRARY_CATALOGUE` excludes it, and the api's list query
  filters `access_mode`.

## 2. The revisions, as applied

| Worksheet | Change |
|---|---|
| Unhooking from a thought | Intro second sentence is now "Saying it back as a thought, in your own words, helps it sound like what it is: a thought." |
| Unhooking from a thought | The thought is safety-screened **before** the read-back is drawn |
| SOS calm | Intro ends "…then notice what's around you."; closing is "Stay here as long as you need." |
| Sitting with not knowing | "keep you awake" → "keep you stuck"; the 0–10 sliders read "10 = very hard" |
| Social situation prep | "Didn't do it" now asks "What got in the way?" — optional, helper "No judgement. This helps you and your therapist plan better." |

## 3. The read-back cannot skip its check

The echo piece now carries `screened: true`, required by the validator, and the
app no longer builds the frames itself. `POST /worksheets/:toolId/readback`
screens the thought with the same check the journal uses and:

- returns the frames with the client's words when the level is S0;
- withholds them for **any** other level — S2 included — and returns the safety
  response (help card, helplines, safety plan, therapist alert);
- flags with `source: 'worksheet_readback'` and no content when the answer is
  flagged, and queues a recheck when the check is unavailable.

Known limitation, stated rather than papered over: nothing is saved at that
point in the worksheet, so the words on the flag are not stored. An urgent
harm-to-someone alert raised from this route therefore cannot show the client's
sentence in the portal. Closing that needs the route to persist a real
`WorksheetResponse` (the alternative is accepting that the words arrive only if
the client goes on to save). This is the owner's call.

## 4. The reminder email — wording written, NOT approved

`WORRY_REMINDER_EMAIL` in `worksheets/anxiety-worry.ts`, gated by
`WORRY_REMINDER_COPY_APPROVED = false`. Both the api's sweep and the worker's
trigger read the same flag; while it is false nothing is sent and the sweep
answers `{ sent: 0, skipped: 0, waitingForApproval: true }`.

Subject: `A reminder from OKUVU`
Preview: `The time you set aside for today.`

Body:

> Hello,
>
> This is the time you set aside for yourself today. It has come round.
>
> Open OKUVU when you're ready — everything you put aside is waiting there.
>
> If today doesn't work, you can move it to another time. Nothing is lost.
>
> OKUVU

Neither the subject nor the preview names worry, anxiety or mental health; a test
checks both against that word list. The previous sender's subject was "Your worry
time", which broke the owner's constraint — that is what changed.

## 5. What was built

- **Client, worry time:** settings (time, length, pause), the parked list, and
  the review with Still bothering me / Not anymore.
- **Client, exposure ladder:** unlocked steps only, 0–100 before and after, and
  at 80+ the approved pause line plus grounding.
- **Portal, exposure ladder:** add, edit, reorder, remove, unlock/lock, and the
  client's two ratings as two numbers — never a difference, total, average or
  chart.
- **Worker:** a daily trigger for the reminder sweep, inert without the internal
  secret or `OKUVU_API_URL`, one call per IST day slot, failures logged and
  retried on the next run.
- **SOS calm:** a one-tap card on Home and the screen it opens (extended exhale,
  then 5-4-3-2-1), hidden unless the worksheet is in the client's Library list.

Not built, plainly: ~~SOS calm is not yet reachable from chat~~ — **now built, see
§7**; and the exposure ladder has no client deep link, because a door to it would
be a door the rule says must not exist (it is reached from an assignment or a
notification).

## 6. Re-sent on request

- Gold-set v2.8 results: `evidence/r6-v28-gate/README.md`.
- v2.9 wording (medication, other people, acting in anger):
  `32-v29-proposed-wording.md`, approved and applied as `a2-okuvu-v2.9.txt`,
  scored five times and **not** promoted — `evidence/r7-v29-gate/README.md`.

## 7. SOS calm in chat, and one alert path that could crash

Built after the brief, because the brief asked for SOS calm "on Home and in chat"
and only Home existed.

- `SosCalmChatButton` sits in the chat app bar and opens `/library/sos` — the same
  screen Home opens, so both doors lead to the same two exercises.
- It renders only when `ws_sos_calm` is in the client's Library listing, which is
  the same fact the Home card reads. A draft, a withdrawn row, or a client who
  cannot see it gets no button, no disabled icon, no tooltip that hints it exists.
- It is hidden while the crisis overlay is up: during a crisis the safety response
  is the only thing on screen, and a second door out of it is not help.
- Three tests, the negative cases first: absent from the listing, present but
  `available: false`, and present-and-available (labelled from the listing's own
  label, not a copy).

The same pass found a real defect in the alert path that the earlier green run had
hidden. `notifyTherapistsOfSafetyFlag` documents "never throws" and did throw: its
catch blocks logged through `identityRef('c', flag.user_id)`, and `identityRef`
calls `.trim()` on its argument. A flag row that reached the notifier without a
user id — which a hand-rolled test double produced, and a partial row could —
turned a caught error into an unhandled rejection. Under Node's default that ends
the process, on the path that tells a therapist a client is at risk.

Two fixes, both in the function rather than around it:

1. Logging is now failure-proof: the two reference helpers catch and fall back to
   `client_unknown` / `address_unknown`, so a log line can never be the thing that
   throws.
2. A store that answers `undefined` is treated as having no assignments
   (`?? []`) instead of dereferencing it.

And the test double that exposed it is now realistic — Prisma's `select` returns
six fields, so the mock returns six — plus two regression tests that assert the
contract directly: no user id, and a store that answers nothing.

The api suite was exiting 1 on this before the fix (2,150 passing plus 1 unhandled
error). It exits 0 now.
