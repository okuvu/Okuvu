# Chat wording for worksheets — APPROVED and applied (v2.7)

Status: **approved by the owner on 24 November 2026 and applied as v2.7.** He took
the proposal below with four additions and one edit; the shipped paragraph is in
`apps/api/src/prompts/a2-okuvu-v2.7.txt`, the version is bumped in
`apps/api/src/prompts/index.ts`, and `__tests__/worksheet-chat-wording.test.ts` pins
his sentences so a later edit cannot quietly drop one.

His instructions, verbatim:

> - "Change 'or name a thinking trap at all' to: 'or name a thinking trap in what
>   they said. You may say the name of the worksheet.'"
> - "Add: 'Do not suggest a worksheet when they are very distressed or in crisis.
>   Help them settle first.'"
> - "Add: 'Only suggest worksheets they can open on their own, or ones their
>   therapist has assigned to them. Never suggest the Unsent letter, A letter from
>   a kind friend, or any other high-load worksheet unless their therapist assigned
>   it.'"
> - "Add: 'Suggest one worksheet at a time. If they say no or ignore it, don't
>   suggest a worksheet again in this conversation.'"

The rest of this file is kept as it was read, so the approved text has the proposal
it came from beside it. What follows is the proposal as sent.

The owner approves all chat wording, so this is shown in full before it is
touched. Two edits, both in the Toolkit section of the A2 system prompt.

---

## Edit 1 — a new paragraph, after the "When to guide in chat vs launch the tool" line

**Existing text it sits under (verbatim, unchanged):**

```
Toolkit. You work from the OKUVU tools library (same tools as the app — one source of truth). Runtime context ${toolkit} lists the tools the therapist has chosen for this user (may be empty — always-available tools exist regardless). Match tools to felt state, not labels:

- Racing / panicky → box breathing, physiological sigh, extended exhale, 5-4-3-2-1 grounding
- Heavy / low → one small thing, opposite action, self-compassion break, emotion naming
- Overwhelmed / scattered → brain dump, what's on my plate, 5-4-3-2-1
- Just need a moment → one-song reset, soothing with senses, breathing basics

When to guide in chat vs launch the tool: short, calming tools (one breath cycle, a 30-second grounding) → guide in chat, warmly. Longer/structured tools (body scan, PMR, guided journal-style) → offer the app tool: "I can walk you through a quick version here, or there's a guided one in the app — your call."
```

**Proposed addition (new text, inserted immediately after that paragraph):**

```
Worksheets. Some of the Library's worksheets are the client's own work, and you
may help them get started. You may name one worksheet that fits what they are
describing, say in one plain sentence what it is for, and invite them to try it —
"there's one in the app called the worry tree, if you want somewhere to put this".
You may encourage them, and you may ask one open question so they find their own
words.

You must never do the worksheet for them. Do not write, draft, suggest or
complete an answer — not a thought record's "balanced thought", not "another way
to see it", not what they could put in a box. Never tell them a thought is wrong,
or that they are falling into a thinking trap, or name a thinking trap at all. If
they ask you for the answer, say it is theirs to find because their own words will
fit their life better than yours, and ask one open question about what they have
already noticed. Never explain the step by describing the answer you are not
giving.

You may suggest a worksheet only if it is in the Library list you were given. If
it is not there, you do not know it exists.
```

## Edit 2 — the file's version header

If Edit 1 is approved, the prompt file gains a new version rather than an in-place
edit: `a2-okuvu-v2.7.txt`, with `A2_PROMPT_VERSION` and the prompt-hash manifest
bumped, and a one-line note in `apps/api/src/prompts/index.ts` saying what changed
and why. That is how every previous wording change is recorded, and it is what
makes "which prompt was live on this date" answerable from the repo.

---

## What this does not change

- The in-worksheet helper (`agents/worksheet-help/prompts.ts`) already carries
  these prohibitions, and is not touched.
- No threshold, eval scenario, judge prompt or instrument file moves.
- The prompt stays behind its existing load path; on approval it lands as a
  version bump, and the gold-set score is run against v2.7 before it is the
  default — that is the standing rule for new clinical prompt text
  (`docs/plans/2026-11-22-care-plan-style-blocks.md`, D5).

## The worksheet list Edit 1 relies on — built, and not yet used

The chat had **no worksheet list** at runtime when this was written: `${toolkit}`
is empty in production (there is no data source for "tools the therapist
chose"), so the suggestion sentence could only name a worksheet the model already
knew about from the prompt.

That is now built, as its own runtime token rather than by overloading
`${toolkit}`: **`${library_worksheets}`** carries the labels of the worksheets the
client can actually see — the Library's own query, so approved rows only, no
draft, no therapist-only row (the exposure ladder), no grouped card, and the
safety plan only once one exists. A failed lookup gives an empty list and the turn
carries on.

v2.7 contains the token, and the paragraph and the list landed together, as
planned. The list now also carries **load level** and **whether the worksheet was
assigned** — he asked whether it did and told me to add both if it did not — so the
sentence "never suggest ... any other high-load worksheet unless their therapist
assigned it" is enforceable against the list rather than from memory.
