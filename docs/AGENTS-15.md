# The 15 agents: what now exists, and what it does not mean

Status: implementation complete on branch `feat/agents-15`. Written 27 Oct 2026.

## First, a correction to the brief

The repo had **4** of the 15 roster agents, not 6. `apps/api/src/agents/` held
A1, A2, A8 and A9. The other two directories are components, not roster
members:

| In the directory      | Is it a roster agent?                                        |
| --------------------- | ------------------------------------------------------------ |
| `a1/`                 | A1 — Alliance & Security                                     |
| `a2/`                 | A2 — Emotion Regulation                                      |
| `a8-router.ts`        | A8 — but only its routing half; selection did not exist      |
| `a9/`                 | A9 — System Guardian, pre-turn governance                    |
| `a9-post/`            | **No.** Pre-publication review of A2's draft; part of A9's job |
| `journal-prompt/`     | **No.** A prompt generator for the journalling feature        |

So **11 agents were missing**, not 9: A3, A4, A5, A6, A7, A10, A11, A12, A13,
A14, A15. All 11 are now implemented. Counting the roster strictly: 15 of 15.

## What was added

| Agent | Name | Writes | In turn loop | Tests |
| ----- | ---- | ------ | ------------ | ----- |
| A3 | Cognitive Restructuring | payload | yes | 21 |
| A4 | Behavioural Activation | payload | yes | 36 |
| A5 | Interpersonal Skills | payload | yes | 37 |
| A6 | Meaning & Values | payload | yes | 27 |
| A7 | Maintenance & Transition | payload | yes | 31 |
| A10 | Insight Generator (therapist-facing) | insight | no | 33 |
| A11 | Learning Optimiser (internal) | aggregate | no | 22 |
| A12 | Content Compiler (sole text writer) | text | yes | 18 |
| A13 | Delivery / Speaking (sole audio writer) | audio | no | 10 |
| A14 | Assessment & Measurement | assessment | no | 55 |
| A15 | Memory & Continuity | contract, memory | yes | 43 |

Plus, supporting them:

| File | Purpose | Tests |
| ---- | ------- | ----- |
| `agents/roster.ts` | The 15 agents as data; `validateRoster()` enforces authority rules | 22 |
| `agents/shared/json-call.ts` | One strict-JSON call path: schema, enum checks, fail-closed | covered above |
| `agents/shared/specialist.ts` | Specialist contract, grounding + forbidden-content guards | covered above |
| `agents/shared/types.ts` | The payload union every specialist and A12 share | covered above |
| `agents/a8-selection.ts` | A8's missing half: choose ≤2 specialists, deterministically | 14 |
| `pipeline/v2/turn.ts` | The 15-agent turn path, behind `OKUVU_AGENT_PIPELINE_V2` | 15 |

**Verified**: 384 new tests pass across 14 new test files; the full API suite is
999 tests in 54 files, 0 failures (615 before this change); `tsc -p
tsconfig.json --noEmit` is clean; 8,097 lines added across 52 files, no existing
behaviour modified.

## Rules, mechanised rather than documented

`validateRoster()` fails if any of these stops being true, and the roster has
22 tests that mutate it to prove each check fires:

- exactly one severity writer — A9. A1 may *signal* risk; it may not commit it.
- exactly one text writer — A12 — and it is the only client-facing agent.
- exactly one audio writer — A13 — and it writes nothing else.
- exactly one selector — A8.
- exactly six process specialists (A2–A7), all payload-only, all in-turn, none
  able to select or speak to the client.
- only A1 and A9 may veto.
- A10 and A11 can never be client-facing.

## Each agent's guards, briefly

**A3–A7** share one contract and five specific ones:

- refuse to run at S3/S4 *before* any model call, and the test asserts the model
  was never called;
- every quote must be grounded in the client's own message (`thought` for A3,
  `evidence` for A6, `anchor` for A7, `situation` for A5) — a model that tidies
  a client's words into something they never said is discarded, not repaired;
- forbidden-content lint over every rendered field: no advice, no diagnosis, no
  medication, no outcome promise;
- A4 rejects vague actions ("think positive") and requires an integer 0–10
  difficulty; A5 rejects second-person instruction in the client's script;
- A7 refuses a transition plan below 4 sessions — preparing someone for reduced
  contact in week one is harmful;
- any technical failure returns a **null payload**, never a plausible default.

**A10** refuses below 3 usable session summaries with no model call, caps output
at 5 insights, and drops any insight whose evidence is not literally in the
supplied summaries.

**A11** is pure arithmetic, imports no LLM at all, suppresses every statistic
below n=5, excludes non-finite deltas, and its output type has no field capable
of carrying a recommendation or a client identifier.

**A12** renders text only from a template library it owns. No model call at all
in `compile` mode. It refuses at S4, refuses an unsourced helpline number in a
call-to-action, caps questions at 2, truncates to a 700-character budget at a
sentence boundary, and drops any payload whose render trips the forbidden-content
lint. `assemble` mode keeps A2's prose and appends at most one specialist block,
and it strips a leaked machine-signal block from A2's output.

**A13** types provenance as the literal `'A12'`, so speaking text A12 did not
write is a compile error. With no provider it returns `unavailable` and null
audio; a provider that throws, or returns an empty buffer, is `unavailable` too.
It refuses text over 1200 characters rather than speaking an abridged version.

**A14** scores a 9-item, 0–3 instrument to 0–27 with band thresholds tested at
their boundaries; it returns `ok:false` listing *every* validation error and
never partially scores. `bandIsDiagnostic` and `interpretedAsDiagnosis` are typed
as the literal `false`.

**A15** dedupes on normalised text, tracks mentions and recency, enforces
per-kind caps with a deterministic eviction order, and **drops any addition
containing crisis content** — a crisis narrative must not become a permanent
memory item retrieved months later.

## What this does not mean

1. **The live turn path is unchanged.** `pipeline/v2/turn.ts` is inert unless
   `OKUVU_AGENT_PIPELINE_V2=true`. The existing 4-agent orchestrator still
   serves traffic. Switching is a separate, reviewable change; the v2 module has
   its own conformance suite precisely so that switch is not a leap of faith.
2. **A2 still writes prose in the legacy path.** By the roster A2 is a process
   specialist that should emit a payload. In practice it is the conversational
   voice. In v2, A12 owns the final string (A2's draft plus at most one compiled
   block), which is the closest A12-as-sole-writer gets without rewriting A2's
   351 lines. This is a deviation, recorded here rather than smoothed over.
3. **A13 has no voice provider.** No TTS vendor is configured, so the voice path
   returns `unavailable` in production today. The interface and its failure
   modes are real; the audio is not.
4. **A15 does not persist.** `applyMemoryUpdate` is pure and in-memory. Wiring it
   to the existing Memory table is a migration + adapter, not done here.
5. **A10 and A11 have no caller.** They are implemented and tested but no worker
   or route invokes them yet — same status as a library, not a feature.
6. **A14's instrument is unsigned.** "okuvu-wellbeing-9" is a 9-item Likert
   instrument of our own, not PHQ-9 or GAD-7, and its wording has not been
   clinically reviewed. It must not be labelled or scored as a diagnostic tool.
7. **A12's copy library is unsigned.** Every template in `a12/prompts.ts` is
   clinical copy. It needs Dr Goswami's sign-off before real clients see it —
   the same gate as the crisis copy.
8. **Classifier recall is still unmeasured.** Nothing here changes that A1's
   accuracy has no number attached to it. Adding 11 agents does not make the
   pipeline safer; only measurement does.

## The roster, over HTTP

`GET /agents/roster` (`apps/api/src/routes/agents.ts`) serves `roster.ts` as JSON: one entry per
roster member with its stable identifier (`A1`…`A15`), name, group, purpose, `writes`,
`inTurnLoop`, `clientFacing`, `canVeto`, `canSelect`, `maySignalSeverity`.

It is a **view of `roster.ts`, not a second registry** — the same reason `validateRoster()` exists.
Adding an agent to `ROSTER` is the only edit needed for it to appear; there is no list here to fall
out of step. A9-post and J2 are absent by construction: they have no `ROSTER` entry, and
`validateRoster()` reports any id outside `ROSTER_IDS` as `roster_incomplete` (`unexpected: [...]`),
so adding one is a failing test rather than a silent widening of the roster.

The route is behind `verifyCognitoJWT` like every non-health route. If the roster breaks one of its
own rules the endpoint answers **503 `ROSTER_INVALID`** with the violated rule codes instead of
serving an authority model it cannot honour.

Tests: `apps/api/src/__tests__/roster-endpoint.test.ts` (real `buildApp()` + `app.inject()`, plus a
filesystem check that every listed id has code and a test file with at least one test).

## Reproducing the evidence

```bash
cd apps/api
npx vitest run            # 54 files, 999 tests, 0 failures
npx tsc -p tsconfig.json --noEmit   # clean
```
