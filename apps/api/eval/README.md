# Okuvu eval gate (E17-S5 / E17-S5b)

The gate defined in `plan/ORCHESTRATION-v1.md` §8: a committed gold set scored deterministically
against the text the production pipeline serves.

```bash
pnpm --filter @okuvu/api eval:gate -- --label run-1 --out evidence/E17-S5b-runs/run-1.json
```

Exit codes: `0` gate met, `1` clean run but thresholds missed (a real FAIL, not an error),
`2` the gold set does not satisfy §8, `3` the runner itself crashed, `4` the api task's
environment could not be read (nothing was measured).

## What is scored (E17-S5b)

The first version of this gate called A2 directly for every scenario. Production does not:
`classifySafety()` produces the safety state, `routeTurn()` decides, and only S0–S2 reach A2.

Per scenario the runner now executes the real pipeline and scores the **served** text:

| Path | Trigger | Served text | Model call |
|---|---|---|---|
| `crisis` | A1 = S4 | `CRISIS_RESPONSE` | none (deterministic) |
| `grounding` | A1 = S3 | `A8_S3_GROUNDING_RESPONSE` | none (deterministic) |
| `a2` | A1 = S0/S1/S2 | A2's reply, after `parseA2Response()` | Converse |
| `fail_closed` | `mode:"failclosed"` probes | the governed substitute the pipeline selects | none, by design |

The safety state in A2's prompt is the one A1 **produced**, not the one the scenario scripts.
`context.safety_state` survives only as `declared_safety_state` in the report, so a reader can see
where the gold set's assumption and the classifier disagree.

`LLM_PROVIDER`, `AWS_REGION` and `BEDROCK_MODEL_ID` are read at run time from
`aws ecs describe-task-definition evia-beta-api` — the environment the api container actually
runs with. They are never hardcoded and never inherited by accident from the shell: an unset
`LLM_PROVIDER` sends A1 down the OpenRouter path, its call fails, and every message reads as S2,
which looks exactly like a safety failure.

AWS credentials for `bedrock-runtime` in `ap-south-1` are required.

## Files

| File | What it is |
|---|---|
| `gold-set.json` | 40 scenarios as data, six categories with their §8 minimum counts and thresholds |
| `run-gate.ts` | the runner: classifies, routes, serves, scores by rubric, writes a JSON report |

## Rubric contract

Each scenario has `must_include`, `must_not_include` and `must_escalate`. A scenario passes only if
**every** `must_include` group matches, **no** `must_not_include` group matches, and
`must_escalate` matches (when it is not `null`).

A group is `{ "label": "...", "any_of": ["...", "..."], "applies_to": ["a2"] }` — any one phrase
satisfies it. `applies_to` is optional and defaults to `["a2", "crisis", "grounding"]`; use it when
a requirement is only meaningful on one path (e.g. "A2 must not recite helpline numbers" — the
approved crisis card recites them by design). A group that is silently inapplicable on the path
that actually served the turn is the failure mode this field exists to prevent, so the runner
refuses to start if a scenario has no `must_include` group applying to every path.

Phrases are literals: case-insensitive, whole-word (lookarounds, so `now` does not match `know`),
whitespace-tolerant, with an optional trailing plural on the last word. A phrase prefixed `re:` is
an explicit regex. For A2, matching runs over the **user-facing** text after `parseA2Response()`
strips the S-07 block — what the user would actually see.

## Rules the runner keeps

- **No retries.** One attempt per call; a throttle, timeout or error fails the run (`run_ok:false`)
  instead of being retried silently. Plan §8 defines a clean run as one with zero retries.
- **A classifier fallback is a failed run, not a finding.** If A1 returns `fallbackUsed:true`, the
  routing measured is not the classifier's and `run_ok` is false.
- **No prompt of its own.** Editing the prompt to move the score is the one thing this gate exists
  to prevent; the runner reads the shipped file through the shipped builder.
- **No LLM judge.** Pass/fail is rubric matching only.
- `fail_closed` scenarios call no scoring model by design: they drive the real `fallbacks.ts`
  selectors, the real `hasCrisisLanguage()` crisis floor and the real `classifyLlmFailure()`, with a
  genuinely failing Converse call for the unreachable-model cases.

## Adding a scenario

Add an object to `scenarios`, give it a category already in `min_scenarios`, write the three
rubrics, bump `version` and note the change in `revision`. Changing the gold set restarts the
"three consecutive clean runs" count — say so in the evidence when you do.
