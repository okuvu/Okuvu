# E17-S14 — A2 prompt v2.4 → v2.5 (values to a trailing appendix; no rule moved)

**Branch:** `feat/bedrock-prompt-caching` (worktree `/opt/data/okuvu/ts`, off
`feat/chat-quality-testing-page` at `6e480b2`)
**Scope:** the prompt registry plus one documentation rule —
`apps/api/src/prompts/a2-okuvu-v2.5.txt` (new), `apps/api/src/prompts/index.ts` (version
bump + rationale), `docs/AGENT-CODE-STANDARD.md` §5a (the layout rule this change is the
first application of). `apps/api/src/agents/a2/prompts.ts` is **unchanged**: the same ten
`${snake_case}` tokens are substituted, they simply moved.
**Status:** layout change complete and verified locally. No rule, threshold, example,
banned phrase or clinical sentence moved, so no clinical re-review is implied by this
change — see "What this does not claim" below.

## Why a prompt edit, when the last revision was about model behaviour

Every turn-path call re-sends its instruction block in full: A1 2,853, A9-pre 2,804,
A9-post 2,374, A2 12,661 tokens — 20,692 fixed tokens per turn, and input is ~99% of the
tokens billed (`evidence/E17-S6.md` §5a).

A2 was the only one of the four whose body was not byte-stable. Ten values were
interpolated inline, the first at 6% depth:

| placeholder | line in v2.4 | section |
|---|---|---|
| `${therapist_name}` | 44 | §1 identity |
| `${language_mode}` | 54 | §2 language mode |
| `${homework}` | 179 | §7 homework |
| `${toolkit}` | 296 | §7.5 toolkit |
| `${care_plan_focus}` | 449 | §7 pacing tail |
| the other five | 469–478 | §9 context list (value beside its description) |

Because the first value sat at byte 3,093, every turn produced a different prompt from
that point on, and a prefix cache — which matches from byte zero — could reuse 848 of
A2's 12,634 instruction tokens. That is 6.7% of the largest prompt in the turn.

## The change

- §12 — **RUNTIME VALUES — THIS TURN ONLY (data, not instruction)** — is new, appended
  after the FINAL REMINDER and before `END OF PROMPT`. It carries the ten fields, one
  `- name: ${token}` per line, and says in its own words that it is data, that everything
  above it is the instruction, and that the reply shape is still §11's (Block 1 then the
  S-07 JSON block).
- §9 keeps every field *description* and loses every field *value*. It now says:
  "What each field means is above; the value filled in for this turn is in §12, at the end
  of this prompt, after everything that does not change."
- §1, §2, §7, §7.5 name the field and point at §12 ("name in §12", "language_mode (§12)",
  "homework (§12)", "toolkit (§12)", "see §12").
- The header gains a v2.5 paragraph that says in one place that no rule moved and why the
  layout did.

Nothing else in the 49,495-character file was touched: §3, §3.1, §3.1.1, §3.1.2, §4, §5,
§5.1, §5.1.1, §6, §7.1, §7.2, §8, §10 and §11 are byte-identical.

## Prompt file hashes

| file | sha256 | bytes | lines |
|---|---|---|---|
| `a2-okuvu-v2.4.txt` (kept on disk, no longer served) | `3cca1200462772afd22f883f10a378d5bf259e9fe4971b9bec21d36e87c6b87d` | 54025 | 615 |
| `a2-okuvu-v2.5.txt` (new, served) | `dc92f3cc9ab87fc3cc828bd0a1d46652059ef24a779b7ea207c7a30ba0be6a3c` | 55713 | 642 |

`A2_PROMPT_VERSION` is `'v2.5'` and `A2_PROMPT` reads `a2-okuvu-v2.5.txt`.

## Verification — rendered, not grepped

Rendered through the real builder (`buildConversationalPrompt`), two calls with
deliberately different values (different therapist, intensity 3 vs 7, a 96-character
history summary, a memory string, `mirror` vs `english`):

```
A  chars 50,799   unresolved ${…}  0
B  chars 50,914   unresolved ${…}  0
common prefix 50,368 chars of 50,799 = 99.15%
```

The first `${` in the file sits at char 50,367 — 98.96% depth, against 6% under v2.4.
Estimated cacheable prefix 13,367 of 13,482 tokens (chars/token 3.768, the calibration
already recorded in `apps/api/measure-prompt-tokens.ts`).

`pnpm --filter @okuvu/api exec tsx measure-prompt-tokens.ts` reports the served prompt as
`a2 50810 chars 13485 tok` — 349 tokens larger than v2.4, which is the §12 header, the
ten field labels and the §9 pointer sentence. That is the price of the layout: +2.6% on
A2's instruction, in exchange for ~92% more of it being reusable.

## What the cash is, measured rather than assumed

`evidence/E17-S6.md` §5d carries the arms. Short version: with ~99% of the prompt
byte-identical, the Chat Completions surface reports ~12.9k of ~13.0k input tokens served
from cache on about 1 call in 3, and that rate is identical when the explicit cache
controls are removed and when the values are moved out of the system message entirely —
so the reuse is implicit and best-effort, and the explicit fields are inert for this
model. AWS's Qwen3-32B model card lists no prompt caching at all.

Applying that rate to the 975-turn harness run: **$4.50 → ≈$3.15**. Not the ~$1.60 the
hand-off before this work suggested, and the correction is recorded in §5d rather than
quietly dropped. The rest of the bill is the prompt's size, which no cache setting moves.

## Tests

- `apps/api/src/__tests__/a2.test.ts` pins the substitutions by their rendered form
  (`therapist_name: null`, `language_mode: english`, …). §12 renders those exact strings,
  so the assertions hold without edits — checked, not assumed.
- Full api suite and the approved-copy gate were run on this branch; counts in the commit
  message.
- `apps/api/src/__tests__/prompt-model-header.test.ts` (untracked on this branch, from
  other work) asserts the served header names the model of record and contains no
  `llama`. v2.5's header does.

## What this does not claim

- **No clinical re-review is implied, and none is recorded.** No clinical sentence, card,
  crisis phrase, banned phrase, threshold or example changed. §1/§2/§7's sentences around
  the removed values were left verbatim apart from the value itself; the only new prose is
  the §12 header, which tells the model that §12 is data. `docs/CLINICAL-DECISION-RECORD.md`
  is unchanged and CD-1…CD-8 stay open.
- **Not an eval result.** No gold-set run, no judge, no scenario scored. Whether moving
  the values to the end changes reply quality is a question for the harness, and the
  honest position is that it is unmeasured until someone runs it. The direction of risk is
  that recency favours §12's *values*, which is what the section wants.
- **Not a version bump for behaviour.** If the harness later shows a behaviour difference,
  the version string will not explain it; this file will.
