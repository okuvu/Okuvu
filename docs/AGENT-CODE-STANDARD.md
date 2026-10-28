# Agent code standard — normative

Every agent added or changed in `apps/api/src/agents/` follows this. It is
derived from the code that already exists (A1–A15, A9-post), not invented. If a
new agent needs to deviate, the deviation goes in this file first, with the
reason — not into the agent.

This standard exists because the alternative was tried and measured: a
standalone Python safety core (`reference/python-core/`, 169 tests) was written
outside these patterns and lost to the in-repo TypeScript agents (1,065 tests)
on structure, data layer and provider handling. Do not build a second agent
framework next to this one. Port good ideas *into* this shape.

## 1. Layout

```
apps/api/src/agents/<id>/agent.ts     entry point, exports one verb function
apps/api/src/agents/<id>/types.ts     input/output interfaces, literal unions
apps/api/src/agents/<id>/prompts.ts   prompt builders (when the agent has a prompt)
```

- Deterministic logic that is not a model call lives in a sibling file, not in
  `agent.ts`: `a14/scoring.ts`, `a15/memory.ts`, `a8-router.ts`, `a8-selection.ts`.
  Anything that can be pure and testable without a model must be.
- Every agent is re-exported from `agents/index.ts`.
- Every agent is registered in `agents/roster.ts`. An agent absent from the
  roster has no write authority and must not exist.

## 2. Model calls

- All calls go through `src/lib/generate-content.ts`. No agent imports a
  provider SDK directly.
- New agents call the model via `agents/shared/json-call.ts`. Do not hand-roll
  `JSON.parse` + enum validation. A1, A2 and A9 still have hand-rolled copies
  that have already drifted from each other; they are legacy to back-port onto
  `json-call.ts`, not templates to copy.
- Structured output is always: `responseMimeType: 'application/json'`,
  `responseSchema`, and the `required` field list. Every field is then
  re-validated in TypeScript, because the Bedrock backend honours the schema but
  OpenRouter only gets `response_format: json_object` and may return any JSON.
- `temperature: 0.0` is explicit on every classification/governance call. Never
  inherit a provider default.
- Set `maxOutputTokens` generously for classification calls and disable
  thinking: `thinkingConfig: { thinkingBudget: 0 }`. Gemini 2.5 "thinking"
  tokens consume the visible budget and produce `finishReason: MAX_TOKENS` with
  empty or truncated output — this was the real cause of A9-post's
  empty-response failures, not temperature.
- Sandbox/canned mode must return a **schema-shaped** `cannedResponse` so the
  real parser runs. Generic fallback prose that cannot parse is a bug: it makes
  the test harness exercise the failure path instead of the agent.

## 3. Types

- Input and output interfaces are declared in `types.ts` and exported.
- Enumerated values are string-literal unions plus a `ReadonlySet` guard and a
  `function isValidX(value: unknown): value is X` predicate. Validating with
  bare string comparisons is not enough.
- Every output carries `fallbackUsed: boolean` and a `failureReason`/`notes`
  field describing why it fell back. A caller must be able to tell a real model
  result from a substituted one without reading logs.

## 4. Fail closed

- Any technical failure (timeout, provider error, unparseable JSON, schema
  violation) returns the **most conservative** value for that field, or a null
  payload — never a plausible default. An absent intervention is recoverable; an
  invented one is not.
- Safety classification never falls back to the benign state. A1 fails to `S2`,
  never `S0`, and its v2.0 fields fail to `basis: 'ambiguous'`,
  `signal_strength: 'low'`.
- Process specialists refuse to run at S3/S4 (`isSafetyBlocked`) even though A8
  already excludes them. Defence in depth is deliberate.
- Severity is written by A9 alone. Other agents may *signal* it
  (`maySignalSeverity`), never commit it.
- Client-facing text is written by A12 alone; audio by A13. A specialist that
  emits prose has broken the architecture at the payload level.

## 5. Payload limits

`shared/specialist.ts` defines `MAX_PAYLOAD_ITEMS` (3),
`MAX_PAYLOAD_ITEM_CHARS` (240), `MAX_PAYLOAD_FIELD_CHARS` (400), and the
`FORBIDDEN_ADVICE` patterns (direct advice, reframe, diagnosis, outcome promise,
"you always/never"). Enforce them on the payload *before* text generation, not
by inspecting prose after. New payload-producing agents must run the same
checks rather than writing local ones.

## 6. Authority

`roster.ts` is the single source of truth: `writes` (anything absent is
forbidden), `inTurnLoop`, `clientFacing`, `canVeto`, `canSelect`,
`maySignalSeverity`, `MAX_SPECIALISTS_PER_TURN`. `validateRoster()` enforces the
locked rules mechanically and `src/__tests__/roster.test.ts` pins it. A change
to an agent's authority is a change to the roster plus its test — never a
comment.

## 7. Logging

`console.error({ reason, ...context }, '<agent> <what> failed')` — structured
object first, human sentence second, agent id in the text. Log reasons and
field-level facts. Do not log message text, client identifiers or model output
in full.

## 8. Comments

Comments explain *why*: the observed failure that forced the line, the rule
being defended, the drift already suffered. The existing comments name live
symptoms (`finishReason: MAX_TOKENS`, "inheriting the provider default of 0.7",
"already drifted"). Match that. Comments that restate the code are noise.

## 9. Tests

- Vitest. Tests live in `apps/api/src/__tests__/*.test.ts`.
- Every agent gets a happy-path case, a failure-path case (asserting the
  conservative fallback, not just "did not throw"), and a schema-violation case.
- `roster.test.ts` must pass on any roster change.
- Run from `apps/api`: `pnpm test`, plus `pnpm typecheck` before claiming a
  change is done. Never report agent work as complete on the strength of a unit
  test alone — exercise the real path once.

## 10. Ports from `reference/python-core/` (~15 dev-days, not yet done)

Good ideas from the demoted Python core, to land **inside** this shape rather
than as a parallel one:

1. Hash-chained audit log (tamper-evident turn history).
2. Output lint on generated text before it reaches a client.
3. Erasure receipts for DPDP deletion requests.
4. Cadence caps on proactive messages.
5. Severity floor that cannot be lowered by a later agent in the same turn.
6. A single typed agent contract shared by all agents.
7. Source-pinned helpline data (no model-authored numbers).
8. A conformance suite run against the whole roster.

## 11. Anti-patterns (each one has already cost time)

1. A parallel framework or a second registry next to `roster.ts`.
2. A new per-agent validation/parse helper instead of `shared/json-call.ts`.
3. A fallback that reads as a confident clinical judgement.
4. Two writers of severity, or a specialist writing client-facing text.
5. Implicit sampling settings, or a token budget sized for "short test strings".
6. Sandbox canned responses that the real parser cannot parse.
7. Marking an agent done because it compiles.
