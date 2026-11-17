# E17-S18 — four-arm S-07 emission probe

**Measured 16 Nov 2026**, `qwen.qwen3-32b-v1:0` in ap-south-1, temperature 0.7 (A2's
production setting), judge held on the same model at temperature 0, 21 scenarios ×
4 arms × 3 reps = 252 A2 calls. Report: `evidence/E17-S18-emission-4arm.json`.

## The question

A2 is the only agent on the turn path whose structured output is *requested in
prose*; A1, A9-pre and A9-post force a tool schema and returned `stopReason:
tool_use` on all 93 recorded calls. A2 drops its S-07 block on a large minority of
turns. Three explanations were on the table:

1. **size** — the sheet grew from 22,276 to 49,495 characters between v2.1 and v2.4;
2. **position** — the format contract's distance from the top grew 2.7× (§10 begins
   at character 43,344 of 49,495, i.e. 87.6% down the sheet);
3. **mechanism** — a 32B model will not reliably honour a prose format request at
   temperature 0.7, and the fix is a schema, not more words.

## Arms

| arm | sheet | what changed |
| --- | --- | --- |
| `base` | v2.4 | nothing — the shipped prompt |
| `v21` | v2.1 | nothing — the older, smaller reference sheet |
| `reorder` | v2.4 | §10+§11 moved ahead of §1. **No wording touched**: the probe asserts the non-blank line multiset is identical before and after, so it cannot silently become a wording edit |
| `schema` | v2.4 | the answer forced through a strict tool schema (`reply` + the ten S-07 fields, all required), the mechanism the other three agents already use |

Scenario set: seven each from `scope_boundary`, `clinical_content`, `tone_alliance`
— the categories where A2 actually answers. Crisis, ingestion and the fail-closed
constants are served by deterministic copy that carries no block and must not be
counted, or every arm's rate roughly doubles.

## Result

| arm | sheet chars | emission | 95% Wilson lower | judge satisfied |
| --- | --- | --- | --- | --- |
| `base` | 49,495 | **34/63 = 54.0%** | 41.8% | **60/63 = 95.2%** |
| `v21` | 22,276 | **50/63 = 79.4%** | 67.8% | 49/63 = 77.8% |
| `reorder` | 49,495 | **36/63 = 57.1%** | 44.9% | 59/63 = 93.7% |
| `schema` | 49,495 | **63/63 = 100%** | 94.3% | 56/63 = 88.9% |

Paired by (scenario, rep), exact binomial:

| pair | emission | judge satisfaction |
| --- | --- | --- |
| base vs v2.1 | 9 base-better / 25 v2.1-better, **p = 0.009** | 12 base-better / 1 v2.1-better, **p = 0.003** |
| base vs reorder | 12 / 14, **p = 0.85 — no effect** | 1 / 0, p = 1.0 |
| base vs schema | 0 / 29, **p = 3.7e-9** | 4 / 0, p = 0.125 |

Scenario-level stability (how many of the 21 scenarios emitted on all 3 reps):

| arm | always | mixed | never |
| --- | --- | --- | --- |
| `base` | 5 | 15 | 1 |
| `v21` | 11 | 10 | 0 |
| `reorder` | 5 | 12 | 4 |
| `schema` | **21** | 0 | 0 |

## What it settles

**Position is not the cause, and the arm I expected to win lost.** Moving the
format contract from 87.6% down the sheet to the top moved emission 54.0% → 57.1%,
which is a tie (p = 0.85), and it made three more scenarios emit on *no* rep while
base had one. The reordering hypothesis is dead on this model, at this n. It is
worth recording because it was the attractive one: it was the only prompt-size
lever that needed no clinical signature.

**Size is real, but the bytes bought quality.** v2.1 emits 25 points more often
(79.4% vs 54.0%, p = 0.009) and is dramatically worse as a conversation: 77.8%
against 95.2% judged satisfaction, with 12 judgements lost and 1 gained (p = 0.003).
So "shrink the sheet to recover emission" is arithmetically available and clinically
wrong — the sections added between v2.1 and v2.4 are doing the work the gate measures.

**The mechanism is the answer, and it is decisive.** Forcing a schema took emission
from 54.0% to 100% — 29 turns gained, zero lost (p = 3.7e-9), and every one of the
21 scenarios emitted on every rep, so the failure stops being sampling and becomes
a property of the call. This is the first arm in this thread that removes the
behaviour rather than reducing it.

## What it costs

Replies in the schema arm average 255 characters against base's 314 — 19% shorter.
Judge satisfaction is 88.9% against 95.2%, 4 judgements lost and none gained, which
is **not significant at this n** (p = 0.125) but points consistently one way across
four different scenarios (cc-07, sb-06, ta-05, ta-06), one rep each. Treat it as a
flattening cost that is probable and unproven: the honest statement is that the
schema arm buys certain emission for a probably-small quality cost, and that the
next run needs enough reps to resolve a 4-of-63 difference.

Cost: 2,798,754 input and 39,234 output tokens across 252 A2 calls = **$0.53 at
list price**, measured from the response `usage`. Judge calls are not metered by
the probe; by the same arithmetic they add roughly $0.30. All-in about **$0.85**.

## What it does not prove

- **All 21 scenarios are `S0`.** The probe has no near-crisis coverage, which is the
  same blind spot as the recorded corpus. Nothing here says anything about emission
  on a turn where safety state is S1+.
- **One model.** GLM 4.7 Flash already emits at 6.9% miss against Qwen's 38.8% on
  the same sheet, so the schema finding is about Qwen and says nothing about whether
  another model needs the constraint.
- **Three reps per scenario.** The per-scenario table is the honest view: base is
  mixed on 15 of 21 scenarios, i.e. dropout, not a hole. Any single run's rate is
  one sample of that.
- **Judge satisfaction is a proxy**, not a therapist's read. Four lost judgements is
  a signal to investigate those four replies by hand, not a verdict on the arm.
- **The schema arm's reply is a JSON string field.** Whether A9-post reviews it as
  faithfully as free prose is untested here; the probe judges the reply text, not
  the review path.

## Where the artifact came from

`apps/api/eval/v2/probe-emission-4arm.ts`, run as
`AWS_PROFILE=default ./node_modules/.bin/tsx eval/v2/probe-emission-4arm.ts --reps 3 --concurrency 6`.
`buildConversationalPrompt()` gained an optional second argument for the base
sheet, defaulting to the shipped `A2_PROMPT`, so no production path changes.
