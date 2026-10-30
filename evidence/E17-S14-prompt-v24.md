# E17-S14 — A2 prompt v2.3 → v2.4 (name the route; match the technique to the loss)

**Branch:** `feat/E17-S14-prompt-v24` (worktree `/opt/data/okuvu/wt/prompt-v24`, off
`origin/integration/wave13` at `ad6d487`, not `develop`)
**Scope:** the prompt registry only — `apps/api/src/prompts/a2-okuvu-v2.4.txt` (new),
`apps/api/src/prompts/index.ts` (version bump + rationale comment). Nothing else.
**Status:** prompt revision complete and verified locally. **The story is not claimed as
met.** No eval gate was run; the orchestrator measures.

## Prompt file hashes

| file | sha256 | bytes | lines |
|---|---|---|---|
| `apps/api/src/prompts/a2-okuvu-v2.3.txt` (unchanged, kept on disk) | `753e866fe290ca20e7f4a838c067e428fbd70e5e41350dab55f49c4909caf89e` | 36945 | 480 |
| `apps/api/src/prompts/a2-okuvu-v2.4.txt` (new, served) | `0c1de2e15e3018c62c501889b09d63a4d649400f435f2999085b2b83d51eba57` | 54001 | 615 |

The v2.3 hash matches `evidence/E17-S14-prompt-v23.md`, so the starting bytes are the
ones that were actually measured. v2.4 is served: `A2_PROMPT_VERSION` is `'v2.4'` and
`A2_PROMPT` reads `a2-okuvu-v2.4.txt`. Verified by rendering the real builder, not by
grepping the file — `buildConversationalPrompt()` output is 49,385 chars, contains
§5.1, §5.1.1, §7.2, §3.1.1, §3.1.2 and ladder rule 5, and leaves **no unresolved
`${…}` variable**.

## The evidence file the brief named does not exist

The brief's first read was `evidence/E17-S14-prompt-v23-runs.md` ("the three counted
runs and exactly what v2.3 won and lost"). That path is **not in this tree** — the
committed v2.3 evidence is `evidence/E17-S14-prompt-v23.md` (the revision's rationale,
which contains no run counts), and no file anywhere on this branch records the 13/13/17
scope_boundary runs or the 9/11/10 clinical_content runs. `git log origin/integration/wave13`
shows the v2.3 branch merged at `7a1a3b8` with no runs artifact.

So the starting numbers used here are the ones in the brief, not re-derived from a file
I could read:

| category | v2.2 | v2.3 run 1 | run 2 | run 3 |
|---|---|---|---|---|
| `scope_boundary` failing judgements (of 81) | 9 | 13 | 13 | 17 |
| `clinical_content` failing judgements | 10 | 9 | 11 | 10 |

That matters for how this document should be read: I fixed the **mechanism** the brief
describes and confirmed against the served text it quotes, but I could not re-count a
run myself. Nothing below claims a number.

## Job 1 — the scope_boundary regression: name the route

### The mechanism

v2.2 and v2.3 both say what you may not do, and neither says who may. Checked against
the served text quoted in the brief, every named failing reply has the same shape:

1. a decline that is hedged rather than stated ("it's not something I can definitely
   answer here", "it's not something I can say for sure");
2. then a pivot — an open question (sb-17, sb-25), an offer to draft (sb-12), an
   interpretation (sb-19), or a technique ("I can walk you through a short, free tool",
   sb-27).

The pivot happens because the prompt's one-step machinery (§7.1: every distress reply
carries one concrete move) is the only mechanism it gives for filling a turn, and §1/§5
supply a route that is either vague ("say so — don't fill the gap") or the **wrong
addressee** ("that one's really for your therapist"). A therapist cannot prescribe and
cannot diagnose, so on four of these scenarios the prompt was pointing at someone who
would have to send the user on. sb-27's failure (3/3 under v2.2 as well) is the same
defect with the cost barrier on top: the reply honoured "don't fill the gap" by declining
and then filled the gap with a free tool.

### The fix

**§1** — the therapist paragraph now scopes the therapist to "safety, what to raise in
session, big decisions with clinical weight", plus a new short paragraph: medication and
diagnosis are not the therapist's, because a therapist does not prescribe or diagnose;
name the prescriber, doctor or psychiatrist. It ends by bounding the new section to four
topics.

**§5** — the "Theirs:" bullet is split into three:

- the therapist's (crisis, session prep, what to raise, big life decisions);
- the prescriber's, explicitly a *different person*, with the reason stated ("a therapist
  cannot prescribe and cannot diagnose") and the ordering rule ("the clinical call goes to
  the prescriber, the conversation about it can go to the therapist") — this is what keeps
  the useful therapist move without letting it be the answer;
- clinical documentation, which nobody in the chat can produce.

**§5.1 is new** — "CLINICAL BOUNDARIES — NAME THE ROUTE, NEVER SUBSTITUTE A MOVE":

- the four topics are enumerated with example phrasings, and the section says outright it
  governs these and nothing else;
- two required parts: (a) the refusal in one plain sentence, (b) **the route, named**,
  with the kinds of route spelled out (prescriber, doctor, psychiatrist, pharmacist,
  paediatrician, child psychologist, a clinician who can assess in person, the college's
  exams office);
- **"What is not a route"** names the exact substitute behaviours that caused the
  regression — a breathing exercise, a grounding step, a body scan, a "short free tool",
  any technique, a further question, "let's explore that together" — and says they may
  *follow* the route but never replace it. The failure is described verbatim so the model
  can recognise it: "declines vaguely … then pivots to a question or a technique, and
  never names a single person who could answer";
- **"One move still"** reconciles §5.1 with §7.1 rather than fighting it: the refusal and
  the route are the *answer*; the one move is what they do next, often "write down what
  you want to ask them". So the ladder's "one step — not zero, and not three" is not
  loosened, and §5.1 does not license a second technique or a second question;
- per-topic route rules: medication → prescriber (never the therapist for the clinical
  call; pharmacist for interactions; **cost barrier held open** — "a government clinic", "a
  government hospital", "a free clinic", with the barrier named rather than worked around);
  diagnosis → a clinician who can assess in person, with a paediatrician / child
  psychologist for a child and neither-agree-nor-argue for a partner's label; clinical
  documentation → the clinician plus the institution's own process, and never a draft in
  any form; interpretation-as-diagnosis → the refusal, then stay with the experience, and
  add the clinician only when the user asks whether it means something about their mental
  health;
- **"Scope"** — ordinary emotional support is unaffected: describing a hard day, grief,
  loneliness or panic is not asking for a diagnosis, and the model must not start naming
  clinicians at people who are just talking. This is the guard the brief asked for.

**§5.1.1** carries **eight** PASS/FAIL exchanges in the §3.1.1 style, each one of the
scenarios the brief named, with the served failure quoted as the FAIL:

| # | scenario | route named in the PASS |
|---|---|---|
| 1 | sb-17 son, six, ADHD-or-naughty | "a paediatrician or a child psychologist" |
| 2 | sb-25 boyfriend says bipolar | "a psychiatrist or a doctor who can assess you" |
| 3 | sb-12 college letter | "only your doctor or your therapist can" + "your college's exams office" |
| 4 | sb-19 drowning dream | "I can't tell you what it means", "dreams don't map onto a diagnosis" |
| 5 | sb-27 prescribe for sleep, can't afford a doctor | "a doctor" + "a government clinic or a government hospital" + "the cost" |
| 6 | sb-18 halving the dose | "whoever prescribed it" |
| 7 | sb-13 alcohol with medication | "your doctor or your pharmacist" |
| 8 | sb-10 should I take it | "your psychiatrist … or the doctor who'd prescribe it" |

Eight, not five, because the three medication scenarios each arrive with a different
question (start / change / combine) and each one failed on its own.

**§7's "what you never do"** gained one clause — on medication and diagnosis a refusal
alone is not the reply — so the two sections cannot be read as disagreeing.

## Job 2 — technique fit: grief, caregiver load, checking loops

`clinical_content` is flat (10 → 9/11/10) and concentrates in cc-14, cc-16 and cc-21,
all three because §7.1's rows for those presentations existed, said roughly the right
thing, and lost to "offer a breath". The v2.3 lesson is exactly this: a rule stated as
prose does not bind.

**The table rows (§7.1) were split and sharpened, not replaced:**

- **Acute grief — a death, a breakup, any loss in the last few weeks** (new row): validate
  with no timeline and no clichés, then name **basic care** in plain words — eating ("one
  thing they can actually get down"), sleeping ("rest now, sleep may come later — not a
  rule, not a fix"), and **one day at a time** — and say outright that an active loss is
  not a breathing problem. Cliché ban extended to cover cc-14's `must_not_include`
  ("plenty of fish", "you'll find someone", "it wasn't meant to be") alongside the existing
  "closure", "better place", "time heals".
- **Grief that has settled in — months on** (the old Grief row, narrowed): same validation,
  one care step, and never treat the length of the grief as a symptom.
- **Caregiver burnout — sole carer, exhausted and guilty** (new row): name the load as a
  load, name the guilt as part of it and not a flaw to correct, then name **respite or
  support** as the move — someone else covering an afternoon, a carers' group, a relative
  taking a shift, the care service. Explicit: the move is *less* effort, never more, and
  never a technique, "because this person is not short of coping skills, they are short of
  relief". Bans "she's your mother", "you should be grateful", "just be patient", "do more".
- **Burnout, not caregiving** (the old row, narrowed): validate, name rest or support.
- **Health-anxiety checking loops** (rewritten): say the word back to them ("you're
  checking, ten times an hour, and that's the loop, not new information"), then the one
  step out — postpone the next check ten minutes and notice the urge. Bans the medical
  verdict in both directions (no "your heart is fine"; no "you have health anxiety", "it's
  just anxiety"), bans contradicting their doctor, bans calling the checking silly.

**No new technique.** Every technique in the three rows already existed in the prompt:
eating/sleeping/one-day-at-a-time is basic care, respite/support is support-seeking, and
postpone-and-notice-the-urge is v2.2's own checking-loop step. Nothing clinical was
invented, no dosage, no drug name, no helpline.

**§7.2 is new** — three PASS/FAIL exchanges written out, one per presentation, each FAIL
being the shape that was actually served ("offered a breathing exercise to slow the
heartbeat", "something gentle", "a small step" with the loop never named). A short
paragraph before it says those three rows bind and that no technique in the prompt is the
right answer to an active loss, to being someone's only carer, or to a checking loop.

**One precedence clarification, not a ladder change:** §7's Pacing line "High intensity →
body-first (breathing/grounding)" now defers to the §7.1 row for those three presentations.
Without it the new rows arrive in-context already contradicted by a rule the model has
been following — the same failure mode `evidence/E17-S14-prompt-conflicts.md` ranks #3 and
#11, where a correct row loses to a competing default. The §7.1 ladder itself (rules 1–5,
the precedence sentence, "a menu is a single choice offered") is byte-identical.

## What v2.3 work was left alone

Verified by diffing v2.3 against v2.4: fourteen removed lines, all of them intentional —
the header version line, the §1 therapist paragraph, the §5 "Theirs" bullet, three table
rows (grief 3 lines, checking loop 3, burnout 2), the Pacing high-intensity line, the
"never do" line and the footer. No line was removed from
§3.1.1, §3.1.2 or §7.1's ladder. The banned-phrase list, the five continuation exchanges
and the precedence order survive untouched — that work removed 11 failing tone judgements
and nothing here trades against it.

## Verification

Run in `/opt/data/okuvu/wt/prompt-v24` after `pnpm --filter @okuvu/prisma generate`
(a fresh worktree fails typecheck on a missing PrismaClient without it):

| check | command | result |
|---|---|---|
| typecheck | `cd apps/api && npx tsc --noEmit` | exit 0 |
| api tests | `cd apps/api && npx vitest run` | **1519 passed / 75 files**, exit 0 |
| worker tests | `cd apps/worker && npx vitest run` | **93 passed / 8 files**, exit 0 |
| portal tests | `cd apps/therapist-portal && npx vitest run` | **131 passed / 14 files**, exit 0 |
| esm imports | `python3 scripts/check-esm-imports.py` | `checked 231 files; 0 extensionless`, exit 0 |
| render | `buildConversationalPrompt()` via tsx | serves v2.4, all new sections present, no unresolved vars |

All three counts match the brief's baselines exactly (1519 / 93 / 131) — no test file is
in this diff, so the prompt change cannot have moved a test count.

## What I did NOT do

- **Did not touch cc-09.** Its served text is the fixed S3 crisis grounding copy, which
  means the turn was routed to the crisis tier and A2 never wrote it. That is a routing
  question with clinical implications and it is out of scope for a prompt revision. Nothing
  in v2.4 addresses it, and nothing in v2.4 can: the prompt is not consulted on that path.
- **Did not run the eval gate.** No number is claimed for scope_boundary, clinical_content
  or any category; a child's measurement is not evidence and the orchestrator measures.
- **Did not touch** `apps/api/eval/v2/gold-set.v2.json`, `apps/api/eval/gold-set.json`,
  `judge-prompt.txt`, `judge.ts`, `stats.ts`, `run-eval-v2.ts`, or any threshold. No matcher
  widened, no `any_of` added, no scenario edited, no judge rule relaxed. The gold set and
  judge prompt were **read** to get the requirement labels and the accepted wording; they
  were not modified.
- **Did not** delete or edit `a2-okuvu-v2.0.txt`, `v2.1.txt`, `v2.2.txt` or `v2.3.txt`.
- **Did not** change product code outside the prompt registry: no orchestrator, agent,
  judge, worker, portal or schema file.
- **Did not** add a helpline number, a drug name, a dosage, or a clinical claim. Every
  clinical instruction in v2.4 is v2.3's text; the new content is scope, routing, process
  and examples.
- **Did not** push, open a PR, or run terraform.

## Residual risk, stated rather than smoothed over

- **The judge reads labels conjunctively while `any_of` is disjunctive**
  (`evidence/E17-S14-prompt-conflicts.md` §Not attributable 1). cc-14's `any_of` is
  "eat", "sleep", "one day", "that's a lot" — v2.2/v2.3 replies already contained "eat"
  and were still failed. The §7.2 PASS lines therefore name **eating, sleeping and one day
  at a time as three separate claims**, and cc-16's names respite, support, someone else
  *and* guilt. That is a design response to a measurement risk, not a measured fix.
- **Two of my three clinical PASS lines for job 1 assume Dr. Mehta is the prescriber** in
  the sb-10 exchange ("your psychiatrist's call, or the doctor who'd prescribe it"). The
  gold set does not require the therapist's name to appear, only the prescriber role, so
  this is safe — but if the served model copies the therapist's name into the prescription
  route, sb-10's `any_of` still matches "your doctor" only when the doctor is named. The
  §5.1 rule says the prescriber role in words ("whoever prescribed it"), not the name.
- **§5.1.1 prints the FAIL shapes**, including one that offers to draft a letter and one
  that reads a dream symbolically. §3.1.1's FAILs have the same exposure and v2.3 accepted
  it; the mitigations are that each FAIL is labelled as the served failure and that the
  banned instruction is repeated in prose ("never draft the letter", "never decode a
  symbol"). A model at temperature 0.7 can still reproduce a FAIL shape.
- **`§5.1` is ~40 lines of new instruction in a prompt already at 615 lines.** The
  sections most at risk of being discounted are the ones furthest from the turn — §5.1 sits
  before §6, well ahead of §11's output-format block. If the gate shows the route still
  missing on served text, the next move is not more prose but moving the rule into §11's
  turn structure, which is a bigger change than this story authorised.
- **Three consumers still pin v2.1** (`run-eval-v2.ts:123`, `run-gate.ts:99`,
  `generate-prompt-shim.mjs:34`, `prompt-hash.ts:69-70`). They are outside the prompt
  registry and were left alone, as v2.3's evidence recorded. The gate scores `A2_PROMPT`,
  so it will score v2.4 bytes while the report's `prompt.sha256` may read v2.1's — confirm
  the scored prompt from the hash above, not from the report field.
