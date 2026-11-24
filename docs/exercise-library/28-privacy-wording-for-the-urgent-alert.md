# Privacy wording — the urgent harm-to-someone alert

**Status: proposed. NOT applied.** The owner approves all client-facing wording, so
this is the exact text to change, in front of him, before the branch that shows the
client's words in the portal is deployed.

## Why

On 24 November 2026 the owner asked for the urgent harm-to-someone alert in the
portal to show the client's own words, "so I can judge it myself". The portal now
does that: the flag stores no text, but the Safety card resolves the flag's pointer
and shows the answer verbatim for that one flag.

That is a real widening of what a therapist can read, and two live sentences say the
opposite. Until they change, the product would promise privacy it no longer keeps.

## What is live today, and what it claims

### 1. The privacy page (`apps/therapist-portal/src/app/privacy/page.tsx`, ~line 233)

Current text, verbatim:

> "The journal feature itself. Your therapist can't read this unless you choose to
> share it. If OKUVU's safety system notices you may be in danger, it will show you
> help straight away and let your therapist know you may need support, **without
> sharing what you wrote**. This applies to journal entries, worksheet answers and
> Treasure Box notes alike."

The bold clause is the one that becomes false for this one screen.

**Proposed replacement for that sentence:**

> "If OKUVU's safety system notices you may be in danger, it will show you help
> straight away and let your therapist know you may need support. It does not share
> what you wrote, with one exception: if you write that you want to hurt someone
> else, your therapist is told it is urgent and can read that answer, so they can
> judge how serious it is. This applies to journal entries, worksheet answers and
> Treasure Box notes alike."

### 2. The Unsent letter's own helper (approved 24 November 2026, unchanged by this)

Current text, verbatim:

> "Nobody reads this unless you choose to share it. If something you write sounds
> like you might not be safe, OKUVU will check in with you and may let your
> therapist know."

This one is **already compatible**: "let your therapist know" does not promise that
only the fact of a check-in travels. No change proposed. Worth noting because it is
the one worksheet where the disclosure is most likely, and it was written with this
possibility in mind.

### 3. The Unsent letter's "Delete it" helper (approved 24 November 2026)

> "This deletes the letter. If OKUVU already checked in about something you wrote,
> your therapist may still know that a check-in happened."

Also compatible: it says a check-in may be known. It does not say the words are
gone from the therapist's view. **But it is worth knowing** that deleting the letter
removes the answer row, so the portal can no longer resolve the words — the flag
stays, the words go. That is the behaviour this sentence describes, and it is
correct as written.

## The decision this needs

1. **Approve the new privacy-page sentence** (above), or
2. **Narrow the feature**: show the words only when the client has shared that
   entry, and show nothing when they have not — which makes the urgent alert say
   less than he asked for.

He asked for (1) by implication when he asked for the words. It is listed as a
decision rather than applied because the privacy page is client-facing copy and he
approves all of it.

## One more consequence, for completeness

The portal's Safety card is reachable from the client's tab strip and from the alert
email's link. It shows urgent flags to any therapist assigned to that client — not
only to the one who receives the email. That is the same rule as every other safety
flag today (the Safety card is a clinical record, and assignment is the gate), so it
is not a new widening, but it does mean "your therapist was told" is accurate for the
whole care team rather than one person.
