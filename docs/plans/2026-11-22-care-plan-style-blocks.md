# Care-plan style blocks for A2 + a real `care_plan_focus` write path

Status: draft for clinical review (Shubhangi Goswami) and engineering
Date: 22 Nov 2026
Owner: Rajwant
Touches: `apps/api/src/agents/a2/`, `apps/api/src/prompts/`, `apps/api/src/routes/users.ts`,
`apps/therapist-portal/src/server/routers/clients.ts`, `apps/therapist-portal/src/app/clients/[id]/program/`,
`packages/prisma` (no migration — column exists), `apps/api/eval/`, `apps/test-harness/`

---

## 1. What exists today (evidence)

| Fact | Where |
|---|---|
| Care plan is a label plus one focus phrase | `packages/prisma/schema.prisma:158-184` (`ClinicalConfig`) |
| A2 is driven by `carePlanFocus`, plan id "vestigial … carried for tracing only" | `apps/api/src/agents/a2/types.ts:11-18` |
| Focus phrase falls back to `DEFAULT_CARE_PLAN_FOCUS` ("anxiety and worry" / "depression and low mood" / "stress and burnout") | `apps/api/src/lib/agent-context.ts:161-163`, `packages/shared-types/index.ts:490-494` |
| Interpolated twice in the active prompt, both "never recite or label" | `apps/api/src/prompts/a2-okuvu-v2.4.txt:449`, `:471` |
| No branch on CP1/CP2/CP3 anywhere the model reads | grep of `a2-okuvu-v2.4.txt` |
| **No write path** for `care_plan_focus` — the column is never set | no route, no portal field, no seed |
| Portal can only change the plan id | `clients.setCarePlan`, `program/page.tsx` |
| A9-post receives the plan id and focus phrase but has **no plan-fit criterion** | `apps/api/src/agents/a9-post/prompts.ts:31-33` |
| `care_plan_focus` is currently served to the client's phone | `GET /users/me/context` → `reply.send(bundle)`, `apps/api/src/routes/users.ts:126-140` |

Two pacing lines in §7.1 are plan-flavoured already ("Depression-flatness is not
disengagement", "Anxiety = more space", `a2-okuvu-v2.4.txt:445-446`) but they are
keyed to presentation, not to the plan, so they fire for every client.

Measured size of the active prompt: **12,606 tokens** (v2.4, cl100k_base, file bytes).

## 2. Decisions

- **D1 — Three blocks, one reaches the model.** All three live in the prompt file
  (so the hash and the clinical review cover them, and a reviewer reads one file);
  `buildConversationalPrompt` strips the two that do not match the client's plan.
  Sending all three and asking the model to choose is rejected: it costs ~3× and
  invites a reply written for the wrong plan.
- **D2 — The blocks change emphasis, not capability.** No new technique, no new
  copy rule, no threshold. They may not contradict §6, §7.1 or §5.1; where the
  block and a §7.1 presentation row disagree, the row wins.
- **D3 — Unassigned clients get nothing.** `carePlan: null` (self-serve signup,
  `agent-context.ts` bundles no `ClinicalConfig`) → no block, §7.1 alone.
  Never default to CP1.
- **D4 — The write path is the portal, not the app.** Therapist-authored free
  text, capped, overwritten in place, never editable by the client, never
  rendered to the client.
- **D5 — Ship compiled, default off.** `OKUVU_A2_CARE_PLAN_STYLE` (default
  `off`) per `AGENT-CODE-STANDARD` §7: new clinical prompt text lands behind its
  switch with a gold-set score and clinical sign-off, not before.
- **D6 — The reviewer is not extended in this change.** Adding a "plan-emphasis
  fit" criterion to A9-post is a clinical decision with its own gate; it is
  listed as open item O-1 rather than smuggled in.

## 3. Part A — the prompt (v2.5)

### 3.1 New section, appended before §FINAL REMINDER

Placement is deliberate: after §11 so the stripped region sits at ~93% depth and
the shared prefix (safety, tone, §7.1) still caches as one block across plans.
Blocks are delimited so stripping is unambiguous and testable.

```
═══════════════════════════════════════════════════════════════════
# 12. CARE-PLAN EMPHASIS (delivery only)

One block below reaches you, chosen by the client's assigned plan. It changes
emphasis only — which move you reach for and how much space you leave. It never
overrides §6, §7.1 or §5.1; if the user's presentation disagrees with it, the
presentation wins. Never name the plan or a diagnosis to the user.

[[CP1]]
**CP1 — anxiety and worry.** Containment before exploration. Name the worry loop
once, in their own words, and say plainly that it does not have to be solved
tonight. Prefer one containing step — a written worry window, a postponement, a
grounding pass — over open-ended reflection, and do not treat each new worry as
a new topic. When they ask for certainty you cannot give, say you cannot give
it; do not answer the question as though it were factual. End on a step more
often than on an open question, because anxiety grows in open space.
[[/CP1]]

[[CP2]]
**CP2 — depression and low mood.** More space, less ask. Short replies are the
condition, not a signal to close, restart or escalate. Do not reach for cheer,
gratitude or "what do you enjoy" — those demand energy they do not have. Name
flatness as flatness and leave it named; do not correct it. If you offer a move,
make it the smallest physical thing available, mark it optional, and do not
check back on it in the same turn. Stay longer in validation than you would on
any other plan.
[[/CP2]]

[[CP3]]
**CP3 — stress and burnout.** Subtraction before addition. Before any technique,
name what is carrying the load — the hours, the people, the unbroken stretch —
and treat relief as the move: what can be dropped, deferred, handed over, or
left undone tonight. Never add a practice to a plate that is already full, and
never frame rest as something earned. If nothing can be removed yet, offer one
sentence they could say to protect an hour. Do not moralise about their capacity
or turn the turn into time management.
[[/CP3]]

If no block is present, no plan is assigned: use §7.1 alone.
═══════════════════════════════════════════════════════════════════
```

### 3.2 One cross-reference in §7 Pacing (so the block is not a dead appendix)

```
- Care-plan emphasis (§12) shapes which move you reach for and how much space
  you leave; it never overrides §6, §7.1 or §5.1.
```

### 3.3 Token delta (measured, not estimated)

Corrected 22 Nov 2026 against the built v2.5 prompt and real Converse calls —
the first draft of this table (254–260/turn) undercounted the §12 header, the
fallback sentence, the markers and the §7 cross-reference.

| Item | tokens |
|---|---|
| v2.4 prompt (billed today) | 12,606 |
| §7 cross-reference | 39 |
| §12 header + fallback sentence + markers | 140 |
| CP1 block / CP2 / CP3 | 127 / 119 / 118 |
| **Per-turn addition when on** | **297–306 (+2.4%)** |
| Prompt file growth (all three blocks, not all billed) | 568 |
| Observed input tokens, one live call per plan | 12,903 / 12,904 / 12,912 |

Include this table in the `prompts/index.ts` version note, as the standard
requires. Recoverable elsewhere in the same release if the owner wants the
number flat: the two plan-flavoured pacing lines (§7.1, ~14 tokens) become
redundant once every plan has a block.

### 3.4 Builder change (`agents/a2/prompts.ts`)

```ts
export function buildConversationalPrompt(params: {
  // …existing…
  carePlan?: 'CP1' | 'CP2' | 'CP3' | null;
  carePlanStyle?: boolean;   // from OKUVU_A2_CARE_PLAN_STYLE
}): string
```

Resolution order: `carePlanStyle === false` → strip all three marker blocks.
Otherwise keep the block matching `carePlan`, strip the rest, and strip the
markers themselves. `carePlan` null → strip all three. Unknown/undefined plan id
→ strip all three (fail safe: no emphasis rather than the wrong emphasis).

No `.replaceAll` for the block — it is a structural strip, so a block containing
a `${...}` in future cannot be silently interpolated.

Per-turn log (required by the load-switch rule): one `console.info` line with
`carePlanStyle`, `carePlan`, and the stripped-block count, so a production log
answers "which emphasis did this turn carry".

### 3.5 Version and hash discipline

- New file `a2-okuvu-v2.5.txt`; v2.4 stays frozen (its sha256 is in evidence).
- `A2_PROMPT_VERSION = 'v2.5'` + version note with the §3.3 delta.
- `agents/a2/types.ts`: `carePlan` comment updated — no longer vestigial; it now
  selects the emphasis block. Keep the "do NOT default to CP1" rule.
- Fix two live drift defects in the same commit, because the version bump walks
  past both:
  - `apps/api/eval/run-gate.ts:106` and `:707` hardcode `a2-okuvu-v2.1.txt`
    (the gate scores live bytes while recording another version's filename).
  - `apps/test-harness/src/lib/prompt-hash.ts:70` registers v2.1 in the
    FrozenTriple manifest.
  Derive both from `A2_PROMPT_VERSION`; `eval/v2/run-eval-v2.ts:136` already does.

## 4. Part B — the `care_plan_focus` write path

### 4.1 Schema

None. `ClinicalConfig.care_plan_focus String?` already exists
(`schema.prisma:173`) and is already read by `agent-context.ts`. No migration,
no backfill.

Semantics, unchanged from today's read path:

- `null` → `DEFAULT_CARE_PLAN_FOCUS[care_plan_id]` is used.
- non-null → used verbatim (trimmed).
- whitespace-only → treated as `null` (add `.trim() || null` in
  `agent-context.ts`; today a string of spaces would reach the prompt as a
  visible empty phrase).

### 4.2 Portal tRPC (`apps/therapist-portal/src/server/routers/clients.ts`)

`getCarePlan` — add `care_plan_focus` to the `select` and return
`{ care_plan_focus, effective_focus }` where `effective_focus` is the fallback
the engine would actually use (mirror of `DEFAULT_CARE_PLAN_FOCUS`), so the
portal can say "currently using the default for this plan".

New mutation:

```ts
setCarePlanFocus: therapistMutation
  .input(z.object({
    clientId: z.string().min(1),
    focus: z.string().trim().max(300).nullable(),   // '' and null both mean "clear"
  }))
```

- `await assertClientAssigned(db, therapistId, input.clientId)` first — same
  gate as `setCarePlan`, and the query cannot be used to write another
  therapist's client.
- Newlines and control characters collapsed to single spaces before the write;
  the value is interpolated into a one-line prompt sentence.
- `upsert` on `user_id` like `setCarePlan`; create path needs a plan id, so
  require an existing `ClinicalConfig` and answer `PRECONDITION_FAILED` ("assign
  a care plan first") when there is none — never invent CP1 to make the write
  fit.
- Return the stored value so the UI does not have to assume success.
- No confirmation dialog (this is not a track change); autosave on blur is fine,
  but the button copy must not say "The AI will follow this" — it is guidance,
  not a mode.

### 4.3 Portal UI (`clients/[id]/program/page.tsx`)

New card below "Change care plan":

- Label: **What the companion focuses on**
- Help text: *"A short phrase or two the companion keeps in mind. It shapes emphasis,
  never what it is allowed to say. Never shown to the client."*
- Textarea, 300-char counter, placeholder that is plan-appropriate
  (CP1: "worry loops before exams; checking the door at night";
  CP2: "flatness in the mornings; getting out of bed";
  CP3: "workload from the new manager; no days off since August").
- Below it, the effective value: *"Currently: "anxiety and worry" (default for
  this plan)"* — so a therapist can see what is live without a note field.
- The existing notice box ("Therapist notes you write in Session Notes are not
  used by OKUVU…") stays and gains one line pointing at this field.

What the field is **not**: a session note, a diagnosis, or a place for risk
information. Risk lives in Safety and the therapist's own notes. Say that in the
help text — a therapist who types "self-harm last month" into an AI prompt field
is writing clinical risk into a string that the model can quote.

### 4.4 API read path

`apps/api/src/lib/agent-context.ts` only: trim/empty handling (§4.1). No change
to `pipeline/orchestrator.ts` — it already passes
`contextBundle.care_plan_focus` (line 739) and the plan id (line 790).

## 5. Part C — close the leak before opening the tap

`GET /users/me/context` returns the whole `AgentContextBundle`, which includes
`care_plan_focus` (`shared-types/index.ts:574-578`). Today that is a generic
three-word phrase, harmless. After §4 it is **therapist-authored clinical text
delivered to the client's device**.

- Destructure and omit `care_plan_focus` in `routes/users.ts` before `reply.send`.
  The turn path calls `getAgentContextBundle` in-process
  (`orchestrator.ts:7`), so the prompt keeps it with no other change.
- No Flutter code reads the field (grep of `apps/mobile`), so nothing on the
  client breaks.
- Test: `GET /users/me/context` body does not contain the stored focus string;
  the in-process bundle does. Extend `agent-context-privacy.test.ts` — it already
  asserts which clinical fields never leave, and this is the same class of leak.

This is a one-screen fix and must be in the same PR as the write path, not after.

## 6. Part D — tests

`apps/api/src/__tests__/a2.test.ts`
1. CP1 client → prompt contains the CP1 block's first sentence; contains neither
   CP2's nor CP3's; contains no `[[CP1]]` marker.
2. Same for CP2 and CP3.
3. `carePlan: null` → none of the three, and the fallback line is present.
4. `OKUVU_A2_CARE_PLAN_STYLE=off` → none of the three for a CP1 client (proves
   the kill switch, not just the flag-parsing).
5. Existing assertion at `a2.test.ts:122` (`${care_plan_focus}` still
   interpolated) stays green — the phrase and the block coexist.

`apps/api/src/__tests__/agent-context.test.ts` — whitespace-only focus →
fallback phrase, not `""`.

`apps/therapist-portal/src/server/__tests__/clients-*.test.ts`
6. `setCarePlanFocus` refuses an unassigned client (assert the update was never
   called, not just the error code).
7. 301 chars → rejected; `''` → stored `null`; newlines collapsed.
8. `getCarePlan` returns both `care_plan_focus: null` and
   `effective_focus: 'anxiety and worry'` for a CP1 client with nothing authored.

`apps/api/src/__tests__/agent-context-privacy.test.ts`
9. Wire bundle carries no focus text; in-process bundle does.

Run `pnpm test` and `pnpm typecheck` from `apps/api`, plus the portal's own suite;
a green suite is not the proof — the check is the deployed log line from §3.4
naming the plan and block count for a real turn.

## 7. Part E — eval and sign-off

1. Gold-set/gate run with `OKUVU_A2_CARE_PLAN_STYLE=on` **and** off, per plan,
   reported separately. The existing gate scenarios are plan-agnostic, so a
   regression here is expected to be small; the number that matters is
   `tone_alliance` and `validation_only` / `no_next_step` by plan, because
   CP2's "more space, less ask" deliberately moves in the opposite direction
   from the "always offer one step" failure the gate was built to catch. If the
   gate punishes CP2 for the behaviour this spec asks for, that is a gate
   question for clinical, not a reason to weaken the block.
2. Clinical sign-off under `docs/00a-clinical-authority.md` for: the three block
   texts, the §12 precedence sentence, the portal help text in §4.3, and the
   statement that the field must never carry risk information. New CD entry —
   the register is at rev 6 with twelve items closed; this is a thirteen.
3. Default flip (`OKUVU_A2_CARE_PLAN_STYLE` unset → on) only after both 1 and 2,
   with the ECS task-definition var change recorded in the evidence note.

## 8. Out of scope

- Per-plan technique tables (the technique vocabulary in §7.1 is the clinical
  baseline; the blocks choose emphasis from it, they do not add to it).
- Plan-aware A9-post review (O-1).
- Worker 05 `care_plan_fit` (session summaries) — different agent, different spec.
- Client-visible plan naming — the app still never receives `care_plan_id`.
- Focus-text history/versioning — the field overwrites in place.

## 9. Open items for the clinical authority

- **O-1 — Reviewer coverage.** With this change the plan's emphasis is unenforced
  by A9-post: a CP2 reply that pushes a task instead of leaving space is not
  blocked by anything. Options: (a) accept, emphasis is advisory; (b) add one
  A9-post criterion, medium confidence, BLOCK only when the reply contradicts the
  block in a way a therapist would immediately flag. (b) needs its own
  sign-off and its own gate run — recommend deciding after the first eval pass.
- **O-2 — CP2 vs the "always a step" rule.** Confirm the CP2 block's licence to
  ask for less outranks §7.1 rule 1 for low-mood presentations. As written, §7.1
  wins on disagreement; if that is not what she wants clinically, the block must
  say "for this plan, rule 1 does not apply at low intensity".
- **O-3 — Audit of therapist-authored clinical text.** The portal has no audit
  trail; `AuditEvent` lives in the api and is hash-chained. Writing free text
  that reaches a client-facing model with no record of who wrote it is a DPDP
  question, not a UX one. Options: route the write through an api endpoint that
  records an `AuditEvent` (no text in the row), or accept for beta and note it.
- **O-4 — Length and shape.** 300 characters proposed. If therapists want to
  paste a paragraph, the right answer is a structured focus list, not a longer
  string; flag before the UI ships.

## 10. Sequence

1. Prompt v2.5 + builder + switch + tests (D5: default off). → PR 1
2. Privacy fix in `routes/users.ts` + privacy test. → same PR as 3, or PR 2
3. Portal write path (`getCarePlan`, `setCarePlanFocus`, program card) + tests.
4. Gate run on/off, per plan; clinical sign-off; CD thirteen.
5. Flip the switch, record the task-definition change and the deployed sha.
