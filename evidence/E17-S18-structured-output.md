# E17-S18 — A2's envelope is now a schema, not a request in prose

**Status:** shipped to the testing harness (`testing.okuvu.in`). Not on `develop`; the product does not have it.
**Branch:** `feat/a2-structured-signal` (cut from the deployed harness commit `c7bf715`).
**Spend:** one verification call (~$0.004). No campaign, no probe run.

## What was wrong

A2 is the only agent on the turn path whose structured output was *asked for in
prose*. §10 and §11 of the conversational sheet specify the two-block format,
§11 says "every turn must produce exactly two blocks", and the FINAL REMINDER
repeats it as the last line of a 49,495-character sheet — and the block still
failed to appear on a large minority of turns.

The consequences were not cosmetic. `technique_used`, `tool_launched`,
`intensity`, `taper_state` and `closure_offered` all live in that block. When it
is missing the turn is invisible: no technique attribution, no taper state, and
— the part that blocked the care-plan work — no way to check whether the
prescribed exercise was used or a contraindicated one was launched.

## What the probe measured

`evidence/E17-S18-emission-4arm.md` — 21 scenarios × 3 reps, one model
(`qwen.qwen3-32b-v1:0`), one judge, 252 A2 calls, ~85 cents.

| arm | sheet chars | signal present | judge satisfied |
|---|---|---|---|
| base v2.4 | 49,495 | 34/63 = 54% | 60/63 = 95.2% |
| v2.1 sheet | 22,276 | 50/63 = 79% | 49/63 = 77.8% |
| reorder (§10/§11 to the front) | 49,495 | 36/63 = 57% | 59/63 = 93.7% |
| **schema (forced tool)** | 49,495 | **63/63 = 100%** | 56/63 = 88.9% |

Three readings, in order of how much they change the plan:

1. **Position is not the mechanism.** Reordering the format block to the front
   of the sheet moved emission 54% → 57% (12 scenarios improved, 14 worse,
   p=0.85). The cheap fix I favoured does not exist.
2. **Length cannot be cut to buy emission.** The older, 27,000-character-shorter
   sheet emitted far more (p=0.009) but its conversations were markedly worse
   (p=0.003): twelve judgements lost, one gained. The extra length is doing
   clinical work.
3. **Constraining the answer removes the failure.** 63/63, every scenario on
   every attempt, 29 turns gained and none lost (p≈3.7e-9).

## What ships

- `apps/api/src/agents/a2/structured-schema.ts` — the tool schema, the
  envelope parser, and the kill switch.
- `apps/api/src/agents/a2/agent.ts` — passes `generationConfig.responseSchema`
  on the first attempt *and* on the empty-reply repair, and `parseA2Response`
  reads the envelope first, falling through to the untouched prose path.
- The sheet is **unchanged**. Not one clinical word moves, in either direction.

`A2_STRUCTURED_OUTPUT=off` restores the prose contract exactly. That is a
deliberate choice, not indecision: the probe did not settle whether structured
replies are less warm, and a kill switch turns a possible regression into one
env change instead of a revert.

### Field shape

The wire schema is **flat** (`primary_emotion` / `mood_confidence` at the top
level), matching the probe arm that measured 100%, and the parser reassembles
the nested `mood_inference` the `S07Signal` type expects. Changing the tool's
field layout to match the sheet's prose example would have been an unmeasured
change dressed up as a refactor.

`null` is not used on the wire: Bedrock's strict tool use rejects nullable
sentinels on some models. Empty string and intensity `0` mean "no value" and
translate back to `null`.

## Verification

- `tsc --noEmit` clean; **1720 api tests pass**, 86 files.
- Nine new tests in `a2.test.ts`: the schema is handed to the provider,
  `reply` and `technique_used` are required, the envelope is read back into
  `userContent` + `S07Signal`, the sentinels map to `null`, a prose answer still
  parses, the kill switch removes the schema, the repair keeps the schema, and
  two blank attempts still fail closed.
- **One real call**, `qwen.qwen3-32b-v1:0` via Bedrock, care plan focus and
  toolkit supplied: 251-character reply, `fallbackUsed: false`, signal present
  with `technique_used: grounding_5431`, `tool_launched: grounding_5431`,
  `intensity: 6`, `mood_inference.primary_emotion: fatigue`,
  `journal_prompt_suggested` set. Bedrock accepted `strict: true` with a forced
  `toolChoice` for this model.

## A test-fidelity defect found on the way

Three safety suites (`medical-emergency`, `crisis-routing`,
`safety-fail-closed`) identified "calls that reach the reply model" as *calls
with no generation config* — true only because A2 was the one agent not passing
one. Giving A2 a schema made that proxy count zero, which would have let every
"the reply model was never asked" assertion pass **even if A2 had been asked**.
`medical-emergency` failed loudly and caught it; the other two would have gone
quiet. All three now match the A2 sheet header instead of the call shape.

## What this does not settle

- **Warmth.** Structured replies came back 19% shorter (255 vs 314 chars) and
  four judge verdicts were lost against none gained — consistent in direction,
  p=0.125. A suspicion, not a finding. The per-turn judge work will answer it on
  real transcripts.
- **Near-crisis turns.** Every scenario in the probe is calm-category. All 211
  recorded A2 turns in the corpus are S0; one is S1, none S2/S3. Nothing here
  says anything about the safety-adjacent turns where technique attribution
  matters most.
- **One model, three attempts each.** No second model, no rep-heavy arm.
- **The product.** This is on the harness branch only. Porting it to `develop`
  should wait for the gate and for Shubhangi's read of real transcripts, since
  it changes the client-facing reply path.
