# A2 prompt v2.5 → v2.6 — §7.1 rule 1 asks whether to talk or to do

**Branch:** `feat/care-plan-style-blocks` (off `cfe4a7b`, the §12 care-plan-emphasis commit)
**Scope:** `apps/api/src/prompts/a2-okuvu-v2.6.txt` (new), `prompts/index.ts` (version bump +
rationale) and the four files that have to move with it: `agents/a2/prompts.ts` (the arm
builder + switch), `agents/a2/types.ts` (`talkOrDo` override), `agents/a2/agent.ts` (passes it
through), `apps/test-harness/src/lib/prompt-hash.ts` (version fallback).
**Status:** built and verified locally. **No eval gate has been run on this arm.** The switch
is off, so nothing a client reads has changed.

## Why

Direction from the clinical authority, in writing, 23 Nov 2026:

> my judgement - 1st - the change the general rule. the general rule should be to ask whether
> the client wants to talk or do something.

That reverses §7.1 rule 1, which since v2.2 has been "exactly one concrete, do-able step" for an
engaged user. The step is still offered — but only after the client has chosen it. Talking is a
move in its own right and carries no technique.

§7.1 exists because the v2 gate measured the largest content failure as replies that validated
well and then offered nothing. That failure is unchanged here: in the choice arm the question
**is** the move, and the arm says so in those words ("it counts as the move — it is not a
preamble to a step").

## Prompt file hashes

| file | sha256 | bytes | lines |
|---|---|---|---|
| `apps/api/src/prompts/a2-okuvu-v2.5.txt` (unchanged, frozen) | `c69df06a067283e0bc09ae09b004fbf723aab592a231ede7614874b981b6eb7a` | 56363 | 656 |
| `apps/api/src/prompts/a2-okuvu-v2.6.txt` (new, served) | `52a74cfe933cc831a90049672c3410e42e879db39bff814f807b1b7c4fe4b4c7` | 58340 | 686 |

Served: `A2_PROMPT_VERSION` is `'v2.6'` and `A2_PROMPT` reads `a2-okuvu-v2.6.txt`.

## What changed in §7.1

Rule 1 now exists as two marker-delimited arms in one file, the same device §12 uses:

```
[[RULE1_STEP]]
1. **The user is engaged and the presentation is clear** → exactly one concrete,
   do-able step, named in plain words, small enough to do in the next two
   minutes, chosen from the table below. One step — not zero, and not three.
[[/RULE1_STEP]]
[[RULE1_CHOICE]]
1. **The user is engaged and the presentation is clear** → ask one short question
   before offering anything: would they rather **talk it through**, or **try
   something** that might help. …
[[/RULE1_CHOICE]]
```

`buildConversationalPrompt()` keeps exactly one. Everything else in §7.1 — rules 2–5, the
presentation table, §7.2's three written-out exchanges, the pacing list — is untouched.

Six carve-outs are inside the choice arm, because a preference question dropped in the wrong
place is worse than no question:

1. High intensity and acute panic stay body-first; no preference question mid-panic.
2. Acute grief, caregiver burnout, the checking loop, self-criticism and "is this normal or
   something more serious" still supply their own move, with no choice put in front of them.
   These are the rows v2.4 sharpened after the gate measured a breath being offered to a person
   who needed food, respite or a route.
3. §5.1 keeps its four topics: the refusal and the named route are the reply, and a talk-or-do
   question is not a route.
4. A "neither" answer goes to the menu in rule 2 and the question is not put twice.

## Two other edits in the same file

- **The §7.1 summary is now arm-neutral**: "one **move** while the user is engaged" (was "one
  step"), and "a direct request for quiet beats **anything you would offer**" (was "beats any
  step"). Both arms read correctly against one sentence.
- **"If they have told you, offer the step"** became **"go to rule 1"**, which is the only
  wording that is true in both arms.
- **Header correction.** v2.5's header read `Version: v2.4 | Model: Llama-3.1-8B-Instruct
  (OpenRouter)` — a copy-forward from the version written before the Bedrock cutover. v2.6
  reads `Version: v2.6 | Model: qwen.qwen3-32b-v1:0`, which is `DEFAULT_BEDROCK_MODEL_ID`.
  v2.5's header stays wrong: superseded files are frozen because their sha256 appears in
  evidence records. A guard test now fails if the header and `A2_PROMPT_VERSION` disagree or
  name any vendor but Bedrock, so this cannot be copied forward again.

## The switch

`OKUVU_A2_TALK_OR_DO` — only the literal string `on` enables the choice arm (`true`, `1`, `ON`,
`yes`, ` '' ` and `'On '` all leave it off). Default off, per the standing rule that new
clinical prompt text lands with its code and its switch, never its default.

Drift behaviour is the opposite direction from §12's: a malformed arm structure falls back to
the **step** arm — the one in production — rather than to the unreviewed one. `applyCarePlanEmphasis`
can drop §12 and stay coherent; rules 2–5 assume rule 1 decided something, so there is no
"send nothing" to fall back to.

Per-turn log line (extended, still no client identifier and no message text):

```
{ carePlanStyle, carePlan, blocksKept, blocksStripped, outcome, rule1, rule1Outcome }
```

## Measured cost (cl100k_base over the built prompt, not the file)

| config | v2.5 (step) | v2.6 step | v2.6 choice |
|---|---|---|---|
| no plan | 12,776 | 12,837 | 13,215 |
| CP1 | 12,912 | 12,963 | 13,341 |
| CP2 | 12,904 | 12,955 | 13,333 |
| CP3 | 12,903 | 12,954 | 13,332 |

The step arm grows 51–61 tokens for no behaviour change: the header correction, the two-line
version note, and the arm-neutral summary sentence. The choice arm costs a further 378 tokens
(+2.9%) once switched on. The file holds both arms and 1,977 bytes more than v2.5; only one arm
is ever billed.

## Verification

- `pnpm test` from `apps/api`: **112 files, 2014 tests, all passing** (a2.test.ts is 95, 15 of
  them new in this change).
- `pnpm test` from `apps/test-harness` after `node scripts/generate-prompt-shim.mjs`: **302
  passing, 3 skipped**. The shim now reports `v2.6` and inlines v2.6's bytes.
- `pnpm tsc --noEmit` from `apps/api`: one error, `src/__tests__/mood-checkin.test.ts(41,58)`,
  missing six schema fields. Pre-existing and not from this change: the file is absent from
  `git status` and present on `origin/develop` at `3b80b59`.
- Real builder render (8 configs: both arms × no plan/CP1/CP2/CP3): **0 unresolved `${…}`**,
  **no `[[` markers in any output**, and each output carries exactly the probe for its arm.
  `stepProbe:true, choiceProbe:false` in both of the step arm's configs and the reverse in both
  of the choice arm's.
- Harness wiring: `next.config.ts` aliases `apps/api/src/prompts/index.ts` to the generated
  shim, so the harness runs the real builder and strips the arms itself. Both arms are
  selectable there with `OKUVU_A2_TALK_OR_DO=on` — which is what makes the beta A/B possible
  without a redeploy of copy.

## Open

1. **The gold-set score.** Not run. Required before the switch defaults on.
2. **A signed form.** Her direction is in writing and dated but not signed; the record in
   `okuvu/repo/docs/CLINICAL-DECISION-RECORD.md` says so plainly rather than implying more.
3. **What beta decides.** She wants the output checked in beta before anything goes further:
   "let us keep it this way as of now and will check the output in beta testing" — that was her
   answer to the A9-post plan-fit question, and it applies to this arm too.
4. **The CP2 interaction is now live in the copy.** §12's CP2 block says "more space, less ask";
   the choice arm asks. The block loses to §7.1 on conflict, so CP2 becomes "one short choice,
   then no pressure" rather than "no ask at all". That is consistent with her direction, but it
   is a visible change in CP2 turns and belongs in the beta read.
5. **Two live defects from the v2.5 sample set are still unfixed** and could mask copy quality
   in that read: a reasoning-tag run reaching user-facing text (`</think>` before the signal
   fence), and one turn that emitted prose with no S-07 block.

---

## GO-LIVE — 23 Nov 2026, on her instruction

Clinical direction, Shubhangi Goswami, in this session: "push the changes and make it live."
That is direction given in writing, not a signed form, and the gold-set score in Open/1 is still
not run. The record says both plainly rather than describing this as a gated release.

**What is live.** `origin/develop` = `6c11078` (= production's `/health` commit). Two code commits
plus one infra commit, carried onto the live sha `e388100` by cherry-pick — clean, no conflicts,
no migrations in the diff (`No pending migrations to apply` in the build).

| surface | revision | image |
|---|---|---|
| api | `evia-beta-api:96` | `6c1107840f3e` |
| worker | `evia-beta-worker:90` | `6c1107840f3e` |
| portal | `evia-beta-portal:93` | `6c1107840f3e` |

**Both switches are `on`** (`evia-beta-api:96`, `OKUVU_A2_CARE_PLAN_STYLE` + `OKUVU_A2_TALK_OR_DO`),
so the deployed image builds the v2.6 copy with one §12 block and the choice arm of §7.1 rule 1.
The build's own revision (`:95`) inherited rev 94's environment, which carried neither flag —
the code was live for ~3 minutes with the switches off before `:96` was registered and rolled. Two
restarts of api, one deliberate: it separates "did the code roll" from "did the behaviour change".

**Rollback** — no build needed, about a minute, and it is the operator's lever:
set either flag to `off` on the task definition and force a new deployment. Per-flag, so the two
changes come out independently. Prompt text itself rolls back only by image (rev `:94` / `e388100`).

**Verified**
- build `8f602368` `SUCCEEDED`; 6/6 release gates recorded; `OK api:95 / worker:90 / portal:93`;
  `DEPLOY_DECISION=deploy` (12 files outside the skip list).
- `:95` + `:96` both `COMPLETED`, api running 1/1; boot log clean (`Starting server`,
  `Server listening`, no crash-loop), served traffic is `/health` only.
- task 6874d59d → td `:96` → image digest `e53f11f8…` → `/health` reports `6c1107840f3e`.

**Not verified — say so in the beta read**
1. **No chat turn has run through `:96`.** The mechanism is live and unexercised; the per-turn
   `carePlanStyle/carePlan/blocksKept` log line will be the first real evidence, and it needs one
   message from the app. A green rollout proves the image, not the lane.
2. **The gold-set score is still not run**, so nothing has measured this copy against the
   instrument. Beta output is the first read, per her instruction.
3. **`evia-beta-harness` is still on image `4ab7071e804f`** (an older commit). Copy reviewed on
   testing.okuvu.in is not the live copy until that service is rebuilt; the live copy is what the
   app talks to.
4. Open/5 — the reasoning-tag leak and the missing-S-07 turn — are still unfixed and will show up
   in a beta read as copy noise. They predate this change and are not caused by it.
