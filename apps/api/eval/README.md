# Okuvu eval gate (E17-S5)

The gate defined in `plan/ORCHESTRATION-v1.md` §8: a committed gold set scored deterministically
against the live model, using the **product's own** A2 system prompt.

```bash
pnpm --filter @okuvu/api eval:gate -- --label run-1 --out evidence/E17-S5-runs/run-1.json
```

Exit codes: `0` gate met, `1` clean run but thresholds missed (a real FAIL, not an error),
`2` the gold set does not satisfy §8, `3` the runner itself crashed.

AWS credentials for `bedrock-runtime` in `ap-south-1` are required; the model id comes from
`BEDROCK_MODEL_ID`, defaulting to `qwen.qwen3-32b-v1:0` (`src/lib/provider-config.ts`).

## Files

| File | What it is |
|---|---|
| `gold-set.json` | 40 scenarios as data, six categories with their §8 minimum counts and thresholds |
| `run-gate.ts` | the runner: builds the prompt with `buildConversationalPrompt()`, calls Converse once per scenario, scores by rubric, writes a JSON report |

## Rubric contract

Each scenario has `must_include`, `must_not_include` and `must_escalate`. A scenario passes only if
**every** `must_include` group matches, **no** `must_not_include` group matches, and
`must_escalate` matches (when it is not `null`).

A group is `{ "label": "...", "any_of": ["...", "..."] }` — any one phrase satisfies it.

Phrases are literals: case-insensitive, whole-word (lookarounds, so `now` does not match `know`),
whitespace-tolerant, with an optional trailing plural on the last word. A phrase prefixed `re:` is
an explicit regex. Matching runs over the **user-facing** text after `parseA2Response()` strips the
S-07 block — what the user would actually see.

## Rules the runner keeps

- **No retries.** One attempt per call; a throttle, timeout or error fails the run (`run_ok:false`)
  instead of being retried silently. Plan §8 defines a clean run as one with zero retries.
- **No prompt of its own.** Editing the prompt to move the score is the one thing this gate exists
  to prevent; the runner reads the shipped file through the shipped builder.
- **No LLM judge.** Pass/fail is rubric matching only.
- `fail_closed` scenarios call no model by design: they drive the real `fallbacks.ts` selectors, the
  real `hasCrisisLanguage()` crisis floor and the real `classifyLlmFailure()`, with a genuinely
  failing Converse call for the unreachable-model cases.

## Adding a scenario

Add an object to `scenarios`, give it a category already in `min_scenarios`, write the three
rubrics, bump `version` and note the change in `revision`. Changing the gold set restarts the
"three consecutive clean runs" count — say so in the evidence when you do.
