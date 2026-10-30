# E17-S14 — A2 prompt v2.2 → v2.3 (continuation, not restart)

**Branch:** `feat/E17-S14-prompt-v23` (worktree `/opt/data/okuvu/wt/prompt-v23`, off
`origin/develop` at `c1c2693`)
**Scope:** the prompt registry only — `apps/api/src/prompts/a2-okuvu-v2.3.txt` (new),
`apps/api/src/prompts/index.ts` (version bump + rationale comment). Nothing else.
**Status:** prompt revision complete and verified locally. Whether the tone_alliance
gap closes is **not** claimed here — only the orchestrator's gate decides that.

## Prompt file hashes

| file | sha256 | bytes |
|---|---|---|
| `apps/api/src/prompts/a2-okuvu-v2.2.txt` (unchanged, kept on disk) | `ab808a7020971f67fa97da382259677d0b26a0bbe785681cda2fe71d6c10074d` | 30089 |
| `apps/api/src/prompts/a2-okuvu-v2.3.txt` (new, served) | `753e866fe290ca20e7f4a838c067e428fbd70e5e41350dab55f49c4909caf89e` | 36945 |

`A2_PROMPT_VERSION` is now `'v2.3'` and `A2_PROMPT` reads `a2-okuvu-v2.3.txt`.
`apps/api/src/__tests__/a2.test.ts` asserts against the constant, not a literal, so it
follows the bump without an edit (verified by the run below).

## Diff rationale, section by section

The measured starting point is `evidence/E17-S14-tone-gap.md`: 39/54 (72.2%) against a
Wilson lower bound that at n=54 demands 52/54 — 15 failing judgements, at most 2
allowed. Nine of the fifteen are terse-affirmation / continuity turns. Three defects,
all structural, all inside the prompt.

### 1. §7.1 no longer contradicts the product's own requirements

v2.2 said every distress reply must contain "exactly one concrete, do-able step …
one step — not zero, and not three". That single sentence forces a step into three
turns where the gold set forbids one:

- ta-06 (`"I don't know"`) needs two or three concrete options;
- ta-15 (`"can we just sit quietly for a minute"`) needs no technique at all;
- ta-12 (`"thank you, I feel a bit better"`) is a closing turn that must open no new
  question and load no new work.

v2.3 replaces the single demand with an explicit precedence ladder, in words, in the
prompt: (1) engaged → exactly one concrete step from the presentation table, unchanged;
(2) ambiguous or resistant → a small menu of two or three clearly different options
plus the freedom to pick none, "a menu is a single choice offered, not three steps
stacked"; (3) asked for quiet → no step, no technique, no question, silence is the
correct reply; (4) a closing turn → land and close, no new step, no "one more thing";
(5) then wait. It states the precedence outright — a direct request for quiet beats any
step, a closing signal beats the menu — so no two rules can be read as disagreeing.

The section heading changed from "One concrete step, chosen by presentation" to "One
next move, chosen by where the user is — a step, a menu, or silence" so the title stops
contradicting its own body. The presentation table itself, its clinical wording, and
every technique in it are **unchanged**.

Follow-on reconciliations, same defect:

- The old "if the presentation is unclear, ask one short question" tail now says: ask
  one short question only if they have not already told you; if they have just said
  they don't know, do not re-ask — go to the menu.
- §7 Pacing gains "a held silence and a warm goodbye are complete turns", so
  "one thing per turn" cannot be read as "every turn owes a task".
- §7's "never do extended comfort without any structure" now notes that a quiet minute
  the user asked for **is** structure — otherwise the dependency rule would forbid the
  behaviour ta-15 requires.
- §8's "usually end with one genuine open question" gains the same exceptions it was
  missing: question-fatigue (§4), a request for quiet, and a closing turn → no question.

### 2. §3.1 stops being inert — the exchanges are written out

§3.1 already said a short affirmation is consent to continue and that onboarding
language is reserved for an empty context. The model restarted anyway on "okay", "k",
"yeah", because a rule stated as prose does not bind. v2.3 adds §3.1.1 with **five
exchanges written out in full**, each as a PASS and a FAIL:

1. `"okay"` stepping into the body scan already offered;
2. `"k"` continuing the 5-4-3-2-1 that was just offered;
3. `"yeah"` starting the manager-conversation offer already on the table;
4. `"I don't know"` offering a small menu;
5. `"same thing as last week, nothing has changed"` acknowledging the repetition
   instead of restarting intake.

Five passes, five fails — at least as many FAIL shapes as PASS, stated in the text
("Five passes, five fails"). The fifth pair is not in the three named defects but is
the other deterministic failure (ta-14, 2/3): not acknowledging that the user has said
this before **is** an intake restart, which is the story's subject.

A related collision is fixed in §3: natural-end #3 said "answers are monosyllabic →
going nowhere → don't drag it out", which licensed closing (or, as served, restarting)
on "okay". v2.3 adds a paragraph: monosyllables straight after an offer are consent to
continue, and "going nowhere" means short answers with no offer on the table and no
movement across several turns.

### 3. §3.1.2 — banned restart openers

Banned outright whenever any history exists, because each appeared verbatim on a
continuation turn in a failing reply: "what's on your mind", "how are you holding up
today", "how are you actually feeling right now", any greeting/welcome, any
self-introduction, any "what brings you here" opener, and any variant of "it looks like
you're ready to start a new conversation". The list says **why** they are banned (they
replace the thing the user just agreed to) and what to write instead (the first concrete
piece of the offer already on the table), so it is not a phrase-avoidance exercise.

### Version bookkeeping

Header (v2.3 line + change note), footer (`OKUVU · A2 Support Companion · v2.3`), and
a rationale comment above `A2_PROMPT_VERSION` in `index.ts`. v2.2 remains on disk,
byte-identical, hash recorded above.

No new technique, no new helpline, no new clinical claim: every clinical instruction in
v2.3 is v2.2's text, unchanged. The only new content is process, tone and examples.

## Verification

Run in `/opt/data/okuvu/wt/prompt-v23` after
`pnpm --filter @okuvu/prisma generate` (which a fresh worktree needs first):

| check | command | result |
|---|---|---|
| typecheck | `cd apps/api && npx tsc --noEmit` | exit 0 |
| api tests | `cd apps/api && npx vitest run` | **1519 passed / 75 files**, exit 0 |
| worker tests | `cd apps/worker && npx vitest run` | **93 passed / 8 files**, exit 0 |
| portal tests | `cd apps/therapist-portal && npx vitest run` | **131 passed / 14 files**, exit 0 |
| esm imports | `python3 scripts/check-esm-imports.py` | `checked 231 files; 0 extensionless`, exit 0 |

**Test-count discrepancy, stated rather than smoothed over.** The brief gives an api
baseline of 1374; the tree at `c1c2693` reports 1519 (and `evidence/E17-S14.md` records
1515 for an earlier run). No test file is in this diff — `git diff --name-only` against
`origin/develop` is `apps/api/src/prompts/index.ts` plus the new `.txt` — so 1519 is
develop's own count on this commit, not a count my change produced or reduced. Worker
(93) and portal (131) match their stated baselines exactly.

## What I did NOT do

- Did **not** touch `apps/api/eval/v2/gold-set.v2.json`, `apps/api/eval/gold-set.json`,
  `judge-prompt.txt`, `judge.ts`, `stats.ts`, `run-eval-v2.ts`, or any threshold. No
  matcher widened, no accepted phrasing added, no scenario edited.
- Did **not** run the eval gate. No gate number is claimed, and none of this is
  evidence that tone_alliance clears 85%.
- Did **not** change product code outside the prompt registry: no orchestrator, agent,
  judge, worker, portal or schema file.
- Did **not** delete or edit `a2-okuvu-v2.0.txt`, `v2.1.txt` or `v2.2.txt`.
- Did **not** push, open a PR, or run terraform.
- Did **not** add a helpline number, a clinical claim, or a technique.

## Findings for the orchestrator (read-only, deliberately not fixed here)

Three consumers still pin the **v2.1** filename. I left all three alone because they
are outside the prompt registry and this branch is a prompt revision:

1. `apps/api/eval/v2/run-eval-v2.ts:123` — `PROMPT_FILE` is
   `a2-okuvu-v2.1.txt`, used only for the report's `prompt.file` / `prompt.sha256`.
   The **served** prompt comes from `buildConversationalPrompt()` → `A2_PROMPT`, so the
   gate will score v2.3 bytes while the report's `prompt.sha256` reads v2.1's
   `24d1d58f…`. Confirm the scored prompt from `A2_PROMPT_VERSION` / the file hash
   recorded above, not from that field. `apps/api/eval/run-gate.ts:99` has the same
   stale constant.
2. `apps/test-harness/scripts/generate-prompt-shim.mjs:34` — reads
   `a2-okuvu-v2.1.txt` and hardcodes `promptVersion = 'v2.1'`, so the test-harness
   web build would serve **v2.1 content** and label it v2.1. Any evaluation driven
   through the harness UI measures v2.1, not this revision.
3. `apps/test-harness/src/lib/prompt-hash.ts:69-70` — the manifest pins A2 to
   `a2-okuvu-v2.1.txt` / `'v2.1'`, so the frozen-triple prompt hash identifies v2.1
   bytes.

Also worth knowing: `evidence/E17-S14-instrument-runs/instr-1.json` records
`prompt.file: a2-okuvu-v2.1.txt` and `prompt.sha256: 24d1d58f…` (v2.1's hash) alongside
`version: "v2.2"`. The bytes actually served were v2.2 (via `A2_PROMPT`), which is why
`E17-S14-tone-gap.md` quotes `ab808a70…` — the correct hash of the v2.2 file. The run
report's own hash field is the stale one.

## Residual risk of this revision

- §3.1.1 prints ten concrete reply lines the model could copy (five PASS, five FAIL).
  The PASS lines are meant to be copied; the FAIL lines are labelled "read once …
  never write its shape", but a 32B model at temperature 0.7 can still reproduce a
  FAIL-shaped opener verbatim. The instruction to include at least as many FAILs as
  PASSes is the reason they are there.
- Nothing here moves the six 1-of-3 failures (ta-07, ta-09, ta-02, ta-17, ta-12,
  ta-15) beyond giving each a rule it previously contradicted: ta-09 via the
  resistant→menu rule, ta-17 via "no re-probe" in §8/§3.1.2, ta-12 and ta-15 via
  §7.1 rules 3-4. Those are targeted but unmeasured, by design.
