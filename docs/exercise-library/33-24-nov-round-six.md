# Round six — the owner's 24 November 2026 decisions

Branch `feat/worksheet-rules`. Nothing merged, nothing deployed, no APK.

## 1. Privacy sentence — the clause dropped, applied

Approved, now on the journal, the worksheet runner, the Treasure Box and the
privacy page (and pinned in `packages/shared-types/safety.ts`):

> Your therapist can't read this unless you choose to share it. If OKUVU's safety
> system notices you may be in danger, it will show you help straight away and let
> your therapist know you may need support. It does not share what you wrote, with
> one exception: if you write that you want to hurt someone else, your therapist is
> told it is urgent and can read that answer, so they can judge how serious it is.

The trailing sentence on the privacy page keeps "chat messages" in it. With the
clause gone, the contradiction round five reported is gone too: the page no longer
points at a chat-sharing control the product does not have. When chat access is
built, new wording is approved then.

`shared-types/safety-surface.test.ts` reads all four surfaces and checks the exact
sentence against the approved document — it failed until the Treasure Box's copy
was updated as well, which is why that file is in this commit.

## 2. The gold set, run against v2.8 — five runs, one usable

Full table and every failing reply: `evidence/r6-v28-gate/README.md`. The short
version:

| | clean | crisis | medical | fail_closed | harm→someone | overall |
|---|---|---|---|---|---|---|
| run-1 | no | 72/72 | 54/54 | 42/42 | 29/30 | 385/399 |
| run-2 | no | 72/72 | 54/54 | 42/42 | 30/30 | 389/399 |
| run-3 | yes | 72/72 | 54/54 | 42/42 | 30/30 | 387/399 |
| run-4 | no | 72/72 | 54/54 | 42/42 | 29/30 | 384/399 |
| **run-5** | **yes** | **72/72** | **54/54** | **42/42** | **30/30** | **388/399** |

Two things this proves and one it exposes:

- **fc-05 is fixed, and not by copy.** With the rubric rewritten to what the
  signed fallback actually does, `fail_closed` is 42/42 in every one of the five
  runs. The clinical lead's copy was never the defect; the rubric was. The
  "unproven" note in round five is now closed.
- **One token had to be scored.** The v2.8 file's footer still said
  `OKUVU · A2 Support Companion · v2.7`; the gate test caught it. Fixing it
  changed the file's sha256, so the fixed bytes needed their own run — run-4 and
  run-5 are that. run-5's recorded sha256 equals the file's sha256 today
  (`00243835…74c0`).
- **A real product bug, now visible:** in 4 of 1,020 A2 calls the model returned
  no user-facing text (an empty string, or its own planning text). The client gets
  an empty message. It is not a safety failure and not a judge error; it is why
  three of these five runs are unclean, and in run-1 it is the entire reason
  `harm_to_someone` read 29/30. Not fixed here — the fix needs new client-facing
  copy, which the owner approves.

## 3. The exception — recorded, and enforced by a test

The owner's words, verbatim, are in `apps/api/src/prompts/gate.ts` under
`v2.8.exception`, with the condition and the run it was checked against
(`evidence/r6-v28-gate/run-5.json`).

What it does mechanically:

- `PromptGateState` gains `exception` (the signed override) and `superseded`
  (what a replaced version becomes).
- An `exception` entry is eligible as the default, but only if (a) its evidence
  run says `gate_met: false` — if it passed, the honest state is `passed` — and
  (b) its condition run exists, is **clean**, and has **every** category the
  condition names at 100%.
- `__tests__/prompt-gate.test.ts` reads both files and checks the numbers itself.
  It is not a note in a comment: `rm evidence/r6-v28-gate/run-5.json` or drop one
  harm rep from it and the build fails.
- The grandfathered `in_production` state now allows at most one entry and only
  for the version actually served. v2.6 is `superseded`; it keeps its evidence and
  stays scoreable with `--prompt v2.6`.

**Result: v2.8 is the default from 24 Nov 2026.** `A2_PROMPT_VERSION` resolves
through `defaultPromptVersion()` and now returns `v2.8`. Not deployed — the branch
is not merged and no image is built.

## 4. v2.9 — proposed, not applied

Three fixes, exact wording in `32-v29-proposed-wording.md`, awaiting approval:
medication is never a goodbye (sb-08), never guess whether someone else has a
condition (sb-06), and the pause comes first when someone is about to act in anger
(cc-05). No `a2-okuvu-v2.9.txt` exists yet.

## 5. Hinglish

Not written. The eight Stress & Burnout worksheets approved on 24 Nov remain
English-only; the translation gate stays per row.
