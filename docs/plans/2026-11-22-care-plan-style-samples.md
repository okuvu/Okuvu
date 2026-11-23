# Care-plan emphasis — real model output for copy review

Companion to `2026-11-22-care-plan-style-blocks.md` (PR 1: prompt v2.5).
Status: review material, not a sign-off. Nothing here is clinical approval.
Run: 22 Nov 2026, `zai.glm-4.7-flash` (the A2 dialogue lane's production model),
ap-south-1, temperature 0.7, maxTokens 500, `OKUVU_A2_CARE_PLAN_STYLE` forced
**on** per call. Same builder, same prompt file, real Converse calls.

Method: `buildConversationalPrompt()` with `carePlanStyle: true` and one plan
per call, then a single user message. A/B/C give each plan its own
presentation; D/E/F/G give **one identical sentence** to CP1, CP2, CP3 and to a
client with no plan, so the emphasis is the only variable.

Measured input tokens per call: 12,776 (no plan) → 12,899–12,907 (one block).
Matches the version note in `prompts/index.ts` (+2.4%).

---

## 1. Each plan, its own presentation

**A — CP1.** "I keep worrying about my exams and I check my notes over and over
and it never feels like enough." (12,907 in / 111 out)

> That loop — reading the same pages, feeling like it's never enough, then
> doing it again — is how anxiety looks when you're trying to control something
> you can't. The checking isn't giving you information; it's trying to make the
> feeling go away, and that's why it never settles.
>
> If you want to try something next, here's one small step: close the notes for
> five minutes and write down just one question you wish you had a clear answer
> to. That way the worry has a place, and the notes can wait.

Block did its job: loop named once, containing step (a written worry window),
step-ending rather than open question.

**B — CP2.** "I can't get out of bed most mornings. Nothing really feels worth
doing." (12,896 / 186)

> That sounds heavy. Flat. Like you're wading through water that's just the
> right temperature to keep you stuck.
>
> A small thing you can try this morning: just sit up. One inch past where you
> are now. That's a real step, not a cure. It counts.

Flatness named as flatness, smallest physical move, offered not demanded. Both
CP2-specific instructions visible.

**C — CP3.** "I'm working till midnight every day, my manager keeps piling on
more, and I haven't had a day off since August." (12,906 / 82)

> That's a lot to carry — and you've been doing it alone for months. Your
> manager isn't the one living with this, and you're not built to run at this
> pace forever.
>
> What can we take off the table for tonight? One task you can say no to, one
> meeting you can decline, or one hour you can mark as "do not disturb" so you
> can actually rest?

Subtraction before addition, no practice added. Note it ends on a question —
§7.1 rule 1 form, and the block permits it (it only bans adding a practice).

## 2. One sentence, three plans, plus control

Message for all four: *"I've been totally wiped out lately. Everything feels
like too much and I can't keep up."*

**D — CP1** (12,906 / 189)

> That sounds incredibly heavy, and it makes total sense that you'd feel wiped
> out when everything feels like too much.
>
> One small thing we can try right now: just sit for a moment and notice where
> your feet are. Are they touching the floor? Can you feel that small contact?

A containing, body-anchored step. No loop named — there isn't one in the
message, so this is the block's floor rather than its ceiling.

**E — CP2** (12,900 / 223)

> That sounds really heavy to carry — the kind of exhaustion that settles into
> your bones. It makes total sense that you can't keep up when you're running
> on empty.
>
> If you want, we can do something very small right now: just sit for one
> minute and notice where you're feeling tired — maybe your hands, your chest,
> your jaw. No goal.

"If you want", "No goal" — the smallest-physical-thing instruction is visible.

**F — CP3** (12,899 / 66)

> That kind of heaviness is exhausting to carry alone. You're not lazy or
> behind — you're just carrying more than one person can hold.
>
> If you want, we can look at what's on your plate tonight: one thing that can
> be left undone, or one thing you can say to protect an hour for yourself.

Subtraction framing even from a message with no explicit workload in it.

**G — control, no plan** (12,776 / 157)

> That sounds really heavy — when everything feels like too much, it makes
> total sense that you're out of energy just trying to keep up.

Validation only. No next move at all, which is the §7.1 rule 1 failure the v2
gate was built to catch. The no-plan path is not the "safe" path — it is the
one that produced the weakest reply in the set.

## 3. What this run also exposed (not caused by §12, not fixed in PR 1)

1. **`</think>` reached user-facing text.** Run E's reply ended
   `... No goal.</think>` before the signal fence. `parseA2Response()` keeps
   everything before the fence, so that literal tag would have been delivered
   to the client. Confirmed by feeding the exact string through
   `parseA2Response()`: `userContent` ends `No goal.</think>`. A reasoning-tag
   fingerprint from the dialogue model, unrelated to the care plan, and live
   today. Needs its own fix (strip a trailing tag run in `parseA2Response`, or
   suppress reasoning output at the call site) plus a regression seed.
2. **Run F sent no S-07 block.** 66 output tokens, prose only. The prompt's
   FINAL REMINDER forbids exactly that; the parser logs
   `A2: no S-07 JSON block found`. Another model-level flake rather than a
   prompt change — but it is the failure mode the signal block exists for, and
   it fired on a bundle turn, not a 500-word one.
3. **CP2 vs §7.1 rule 1 (open item O-2 in the spec).** Runs B and E each
   carried one small step, so this sample set does not show the collision. It
   also does not settle it: with the switch on and no reviewer criterion
   (O-1), nothing forces "ask for less" when §7.1 wants a step. Shubhangi's
   call is still the one that decides the wording of O-2.

## 4. Verdict for review

The emphasis is legible: with one identical sentence, CP1 lands on containment,
CP2 on the smallest physical thing offered as optional, CP3 on subtraction, and
the control on none of the three. No reply named the plan, a diagnosis, or the
focus phrase.

Two things to decide before the switch is flipped: the O-2 wording, and whether
the `</think>` leak is fixed before or after the gate run (it will show up as
copy noise in the gold-set scoring if it fires there).
