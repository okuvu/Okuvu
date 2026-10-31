# Okuvu — landing page copy deck

Reading order. Every string has an ID for `apps/therapist-portal/src/lib/marketing/copy.ts`.
`SHIP` = safe to publish today. `[BLOCKED: Bn]` = placeholder in place, see
`landing-page-spec.md` §6.

Voice: warm, validating before suggesting, no exclamation marks, no hype, contractions fine,
lowercase brand name in prose ("okuvu"), sentence case for headings. The brand kit's 3 a.m. test
applies to every line: if it would sound wrong said gently at 3 a.m., cut it.

No line in this deck contains a clinical adjective, a second-person presence claim, a price, or a
download prompt. That is not an accident of drafting; it is the constraint.

---

## 0. Page metadata

| ID | Field | Copy | State |
| --- | --- | --- | --- |
| `meta.title` | `<title>` | `Okuvu — the days between sessions` | SHIP |
| `meta.description` | meta description | `Okuvu is something to talk to between therapy appointments. The therapist who took you on can read how the week went. Invite-only while in beta. For adults 18 and over in India.` | SHIP |
| `meta.ogTitle` | OG title | `Therapy is one hour a week. This is for the other 167.` | SHIP |
| `meta.ogDescription` | OG description | `A place to talk between sessions, with the therapist who took you on at the other end.` | SHIP |
| `meta.ogImage` | OG image | Spiral mark on royal night, honey tip dot, wordmark bottom-left, 1200×630 | SHIP |
| `meta.robots` | robots | `index, follow` at `/` — do **not** optimise for treatment keywords (spec §9.4) | SHIP |

---

## 1. Nav

| ID | Element | Copy | State |
| --- | --- | --- | --- |
| `nav.howItWorks` | link | `How it works` | SHIP |
| `nav.whoSeesWhat` | link | `Who sees what` | SHIP |
| `nav.forTherapists` | link | `For therapists` | SHIP |
| `nav.signIn` | link → `/dashboard` | `Sign in` | SHIP |
| `nav.cta` | button → `#waitlist` (mobile only; desktop uses the hero CTA) | `Join the waitlist` | SHIP |

Nav order, left to right: wordmark · How it works · Who sees what · For therapists · **Sign in** ·
Join the waitlist.

---

## 2. Hero

Eyebrow, then headline, then subhead, then the gate line, then two CTAs.

| ID | Element | Copy | State |
| --- | --- | --- | --- |
| `hero.eyebrow` | chip above H1 | `In beta · places open by therapist invitation` | SHIP `[BLOCKED: B9 for the word "supervised"]` |
| `hero.h1` | H1 | `Therapy is one hour a week. This is for the other 167.` | SHIP |
| `hero.sub` | subhead | `Okuvu is something to talk to between sessions, and the therapist who took you on can read how the week went — so the next appointment starts where the last one ended.` | SHIP |
| `hero.gate` | line directly under the CTAs, 13px, `slate` | `You can't sign up on your own. A therapist adds you first. That's the point.` | SHIP |
| `hero.ctaPrimary` | button → `#waitlist` | `Join the waitlist` | SHIP |
| `hero.ctaSecondary` | text link → `#who-sees-what` | `See who sees what` | SHIP |
| `hero.imageAlt` | alt text | `The Okuvu mark: an open spiral in violet, with a small honey-coloured dot at its tip.` | SHIP |

**Alternates held for A/B (spec §7 M6). Do not ship alongside the primary.**

| ID | Copy | Note |
| --- | --- | --- |
| `hero.h1.altA` | `The six days between sessions are the hard part.` | Tests H1: names the gap instead of doing arithmetic. Slightly softer, less memorable |
| `hero.h1.altB` | `You don't have to hold the week together on your own.` | **BLOCKED: companion-implying.** "On your own" is close enough to a presence claim to fail the 30 Oct test. Do not use without clinical sign-off |
| `hero.h1.altC` | `Session ke baad ke din bhi count hote hain.` | Hinglish. **BLOCKED: B10** — needs native review and must not imply a Hindi UI |

---

## 3. How it works

| ID | Element | Copy | State |
| --- | --- | --- | --- |
| `how.h2` | section heading | `Three steps, and the first one isn't yours.` | SHIP |
| `how.sub` | optional subhead (desktop only) | `Okuvu works the way care already works: someone qualified takes you on, and then you do the week.` | SHIP |
| `how.step1.title` | step 1 | `A therapist adds you` | SHIP |
| `how.step1.body` | step 1 | `Okuvu isn't a download-and-go app. A licensed therapist takes you onto their caseload and sends you an invite code. No code, no account.` | SHIP |
| `how.step2.title` | step 2 | `You talk, most days` | SHIP |
| `how.step2.body` | step 2 | `Type what the day was actually like — the argument, the flat afternoon, the thing you didn't say in the session. Okuvu carries context forward, so you're not re-explaining yourself every time.` | SHIP |
| `how.step3.title` | step 3 | `Your therapist reads the week before you meet` | SHIP |
| `how.step3.body` | step 3 | `Summaries of your conversations reach their portal, alongside your mood check-ins. They see a pattern, not a transcript.` | SHIP |

Designer note: the three step numbers sit in `honey ink`, the connecting rule in the brand thread
gradient. Vertical stack on mobile with the thread running down the left edge.

---

## 4. What you actually get

| ID | Element | Copy | State |
| --- | --- | --- | --- |
| `get.h2` | section heading | `What's actually in it.` | SHIP |
| `get.sub` | subhead | `Five things, all of them working today. Nothing on this page is on a roadmap.` | SHIP |
| `get.card1.title` | card 1 | `Talk when there's no appointment` | SHIP |
| `get.card1.body` | card 1 | `2am, a train, the ten minutes after a bad call. Type it instead of holding it until Thursday.` | SHIP |
| `get.card2.title` | card 2 | `A mood check-in that builds a line` | SHIP |
| `get.card2.body` | card 2 | `One tap a day. After a few weeks you can see the shape of the month instead of guessing at it.` | SHIP |
| `get.card3.title` | card 3 | `A journal nobody else reads` | SHIP |
| `get.card3.body` | card 3 | `Journal entries are yours. They are not shown to your therapist, and they are not part of the summary.` | SHIP |
| `get.card4.title` | card 4 | `Five two-minute exercises` | SHIP |
| `get.card4.body` | card 4 | `Breathing and grounding you can open on your own, or that your therapist can set for the week with a reminder attached.` | SHIP |
| `get.card5.title` | card 5 | `The admin of care, in one place` | SHIP |
| `get.card5.body` | card 5 | `Appointments, homework and reminders, so nothing depends on you remembering it at the right moment.` | SHIP |

Designer note: card 3 sits on `sage tint` — the only green surface on the page — because its value
is that it is *not* shared. Five cards, in this order; do not add a sixth.

---

## 5. Who sees what

| ID | Element | Copy | State |
| --- | --- | --- | --- |
| `who.h2` | section heading | `Who sees what.` | SHIP |
| `who.sub` | subhead | `Not a summary of our privacy policy. The actual switches, as they exist in the app.` | SHIP |
| `who.left.title` | column heading | `Your therapist sees` | SHIP |
| `who.left.1` | list item | `Summaries of your conversations` | SHIP |
| `who.left.2` | list item | `Your mood check-ins, if you've agreed to share them` | SHIP |
| `who.left.3` | list item | `The homework and reminders they set for you` | SHIP |
| `who.left.4` | list item | `The notes they write about you` | SHIP |
| `who.right.title` | column heading | `Your therapist doesn't see` | SHIP |
| `who.right.1` | list item | `Your journal, ever` | SHIP |
| `who.right.2` | list item | `Your raw messages, unless you switch chat access on` | SHIP |
| `who.right.3` | list item | `Anything you write after you switch it off` | SHIP |
| `who.note` | one line under both columns, full width | `Every time a therapist opens your record, it's written into an access log.` | SHIP |
| `who.link` | inline link → `/privacy#who-sees` | `The full detail is in the privacy policy.` | SHIP |

Designer note: left column light (`paper`, sage-deep check glyphs), right column dark
(`royal night`, `lavender tint`, lock glyphs). The dark column is the one the reader remembers.

---

## 6. What this isn't

Four items. Item 2's sentence is the only bold `honey ink` line on the page.

| ID | Element | Copy | State |
| --- | --- | --- | --- |
| `not.h2` | section heading | `What this isn't.` | SHIP |
| `not.1.title` | item 1 | `Not a replacement for your therapist` | SHIP |
| `not.1.body` | item 1 | `Okuvu doesn't diagnose, prescribe or treat anything. It's the space between appointments, not the appointment.` | SHIP |
| `not.2.title` | item 2 | `Not an emergency service` | SHIP |
| `not.2.body` | item 2 | `If someone is in danger right now, Okuvu cannot send help. Call 112.` | SHIP |
| `not.3.title` | item 3 | `Not for under-18s` | SHIP |
| `not.3.body` | item 3 | `Okuvu is for adults, 18 and over. We don't take accounts for children, and there is no parent or guardian sign-up.` | SHIP |
| `not.4.title` | item 4 | `Not finished` | SHIP |
| `not.4.body` | item 4 | `This is a beta with a small number of therapists. Things break. We'd rather say so here than after you've trusted us with something.` | SHIP `[BLOCKED: B9 if "supervised beta" is restored]` |

---

## 7. Crisis block

Rendered by one component reading `CrisisResource`. Appears twice: here, directly under `not.2`,
and compactly in the footer.

**What ships today:**

| ID | Element | Copy | State |
| --- | --- | --- | --- |
| `crisis.line` | the only line | `If someone is in danger right now, call 112.` | SHIP |
| `crisis.note` | small print under it | `These numbers are published by the services themselves.` | SHIP |

**What is blocked — supplied by the clinical authority, not authored here.** Do not write these
lines. Do not paraphrase them. Do not add a connective word, a heading, a warm opener or a sign-off.

| ID | Element | Copy | State |
| --- | --- | --- | --- |
| `crisis.block.heading` | optional heading, if she supplies one | — (to be supplied) | **BLOCKED: B2** |
| `crisis.block.entries` | the list | — (to be supplied: 14416, iCall 9152987821, Vandrevala 1860-2662-345, any others she signs) | **BLOCKED: B2** |
| `crisis.block.hours` | hours, if she supplies them | — never state hours that are not signed | **BLOCKED: B2** |
| `crisis.block.closing` | any "we can stay with you" style line | — forbidden. She rejected exactly this register on 30 Oct | **BLOCKED: B2, permanently** |

Implementation note: the component renders `crisis.block.*` only when `CrisisResource` holds more
than the `112` row. Empty table → the block renders `crisis.line` and nothing else. There is no
fallback copy, because a fallback means someone wrote crisis text in a hurry.

---

## 8. Where your data lives

| ID | Element | Copy | State |
| --- | --- | --- | --- |
| `data.h2` | section heading | `Your data, in four lines.` | SHIP |
| `data.1` | item 01 | `Stored in AWS Mumbai, in India.` | SHIP |
| `data.2` | item 02 | `No third-party analytics or crash-reporting SDK in the app.` | SHIP |
| `data.3` | item 03 | `Your voice stays on your phone — dictation uses your phone's own recogniser, and no audio is sent to us.` | SHIP |
| `data.4` | item 04 | `You can delete your account from inside the app, under Settings → Privacy & Data.` | SHIP |
| `data.link` | link → `/privacy` | `Read the full privacy policy` | SHIP |
| `data.linkNote` | line under the link | `It lists what we don't claim, too. There's a section for that.` | SHIP |

---

## 9. Waitlist

| ID | Element | Copy | State |
| --- | --- | --- | --- |
| `wait.h2` | section heading | `If you want a place, leave an email.` | SHIP |
| `wait.sub` | subhead | `We're not selling anything on this page yet. Places open when a therapist has room on their caseload, and we'd rather say that than take a payment we can't service.` | SHIP |
| `wait.body` | body, above the form | `Leave an email and we'll write to you once, when a therapist has a place. If you already have a therapist who might use Okuvu, say so in the form — that's the fastest route in.` | SHIP |

**Form**

| ID | Element | Copy | State |
| --- | --- | --- | --- |
| `form.email.label` | label | `Email` | SHIP |
| `form.email.placeholder` | placeholder (never the only label) | `you@example.com` | SHIP |
| `form.phone.label` | label | `Phone (optional)` | SHIP |
| `form.phone.help` | help text | `Only if you'd rather we text than email. Include the country code.` | SHIP |
| `form.phone.placeholder` | placeholder | `+91` | SHIP |
| `form.role.label` | label | `Which of these is you?` | SHIP |
| `form.role.1` | radio | `I'm looking for support myself` | SHIP |
| `form.role.2` | radio | `I'm a therapist` | SHIP |
| `form.role.3` | radio | `I'm asking for someone else` | SHIP `[BLOCKED: B7 — the option may stay, the promise it implies may not]` |
| `form.note.label` | label | `What would you want to know before trying this? (optional)` | SHIP |
| `form.note.help` | help text, must be visible, not tooltip-only | `Please don't include anything about your health here — this box isn't a private message to a clinician.` | SHIP |
| `form.consent` | checkbox label | `I agree that Okuvu may email me once when a place opens, and not for anything else. I can ask for my details to be deleted at any time by writing to admin@okuvu.in.` | **LEGAL-REVIEW-REQUIRED: B3** |
| `form.consent.link` | inline link in the consent label | `Privacy policy` | SHIP |
| `form.submit` | button | `Join the waitlist` | SHIP |
| `form.micro` | line under the button | `One email when a place opens. Not a newsletter.` | SHIP |

**States**

| ID | Element | Copy | State |
| --- | --- | --- | --- |
| `form.error.email` | validation | `That email doesn't look complete.` | SHIP |
| `form.error.phone` | validation | `Include the country code, like +919876543210.` | SHIP |
| `form.error.role` | validation | `Pick one — it changes who we pass this to.` | SHIP |
| `form.error.consent` | validation | `We need this box ticked before we can keep your email.` | SHIP |
| `form.error.network` | submit failure | `That didn't go through. Try again, or write to admin@okuvu.in.` | SHIP |
| `form.success.title` | after submit, replaces the form inline | `You're on the list.` | SHIP |
| `form.success.body` | after submit | `We'll email you when a therapist has room. If you'd rather not wait, write to admin@okuvu.in.` | SHIP |
| `form.success.behalf` | after submit, role = `on_behalf` | `Okuvu is for adults 18 and over, so we can only open an account for the person themselves. If they'd like a place, the form works for them too.` | SHIP `[BLOCKED: B7 review]` |

**Confirmation email — B5, needs review before the form goes public**

| ID | Field | Copy | State |
| --- | --- | --- | --- |
| `email.subject` | subject | `Your Okuvu waitlist request` | **BLOCKED: B5** |
| `email.body` | body | `We've got your email. We'll write to you once, when a therapist has a place on their caseload. Nothing else will be sent to this address. If you'd like it removed, reply to this email or write to admin@okuvu.in.` | **BLOCKED: B5** |

Two rules on this email, no exceptions: the subject must not contain mental, therapy, wellbeing,
anxiety or depression; the body must not repeat anything the person typed into the optional field.

---

## 10. For therapists

| ID | Element | Copy | State |
| --- | --- | --- | --- |
| `ther.h2` | section heading | `If you're a therapist, this is the part that matters.` | SHIP |
| `ther.body1` | paragraph 1 | `Your caseload in one place: who's active, what they did between sessions, what you set for them. Summaries are waiting before the appointment rather than reconstructed after it.` | SHIP |
| `ther.body2` | paragraph 2 | `You decide whether you see raw messages — that switch is the client's, and it starts off.` | SHIP |
| `ther.cta` | mailto button → `admin@okuvu.in?subject=Okuvu%20for%20my%20practice` | `Write to admin@okuvu.in` | SHIP |
| `ther.micro` | line under the CTA | `Onboarding is a 45-minute walkthrough with a person, not a signup form.` | SHIP |
| `ther.imageAlt` | alt text for the caseload screenshot | `The Okuvu therapist portal: a caseload list showing client names, status and last activity.` | SHIP `[BLOCKED: B8 until a real screenshot with demo data exists]` |

---

## 11. Footer

| ID | Element | Copy | State |
| --- | --- | --- | --- |
| `footer.line` | one-line description | `Okuvu is a wellbeing app for adults in India, 18+. It is not therapy and it is not an emergency service.` | SHIP |
| `footer.crisis` | compact crisis line | `If someone is in danger right now, call 112.` | SHIP `[BLOCKED: B2 for the full list]` |
| `footer.link.privacy` | link | `Privacy policy` | SHIP |
| `footer.link.therapists` | link | `For therapists` | SHIP |
| `footer.link.contact` | mailto | `admin@okuvu.in` | SHIP |
| `footer.disclaimer` | small print | `We hold no clinical certification, audit attestation or compliance badge, and this page claims none.` | SHIP |
| `footer.copyright` | small print | `© 2026 Okuvu` | SHIP |

No social icons. No badges. No "Made in India" flag row — the AWS Mumbai line does that work with
a fact instead of a gesture.

---

## 12. Words this page does not use

Kept here so a future editor has the list in front of them, and mirrored in
`scripts/check-banned-claims.mjs` so CI enforces it.

**Banned by clinical decision (30 Oct 2026):** `take a breath with me`, `I'm here with you`, and
any variant that puts the product in the room with the reader — `we're here for you`, `here for
you`, `someone's always there`, `never alone`, `I'm not going anywhere`, `stay with me`.

**Banned as clinical claims (unsigned claims matrix D-G):** `clinically reviewed`, `clinically
validated`, `evidence-based`, `approved by therapists`, `therapist-approved`, `RCI`, `medical
device`, `treatment`, `therapy` used as a description of Okuvu itself, `diagnose`, `cure`,
`trauma-informed`, `CBT`, `DBT`.

**Banned as untrue:** `24/7`, `always available`, `real-time`, `encrypted end-to-end`, `100%
secure`, `we can't see your data`, `HIPAA`, `ISO 27001`, `DPDP compliant`, `GDPR ready`, `free
trial`, `cancel anytime`, any `₹` figure, `download on Google Play`, `available in Hindi`,
`thousands of users`, `trusted by`, any testimonial.

**Banned as tone:** `journey` (as in "your mental health journey"), `safe space`, `vibrant`,
`seamless`, `empower`, `unlock`, `revolutionise`, `game-changing`, `holistic`, exclamation marks.

---

## 13. Paste-ready module shape

```ts
// apps/therapist-portal/src/lib/marketing/copy.ts
// Every user-visible string on the landing page lives here. No string literals in JSX.
// scripts/check-banned-claims.mjs scans this file and fails CI on a banned claim.

export const meta = {
  title: 'Okuvu — the days between sessions',
  description:
    'Okuvu is something to talk to between therapy appointments. The therapist who took you on can read how the week went. Invite-only while in beta. For adults 18 and over in India.',
} as const;

export const hero = {
  eyebrow: 'In beta · places open by therapist invitation',
  h1: 'Therapy is one hour a week. This is for the other 167.',
  sub: 'Okuvu is something to talk to between sessions, and the therapist who took you on can read how the week went — so the next appointment starts where the last one ended.',
  gate: "You can't sign up on your own. A therapist adds you first. That's the point.",
  ctaPrimary: 'Join the waitlist',
  ctaSecondary: 'See who sees what',
} as const;

export const crisis = {
  // The only crisis copy we are allowed to write. Everything else is supplied by the
  // clinical authority and rendered from CrisisResource — see spec §6 B2.
  line: 'If someone is in danger right now, call 112.',
  note: 'These numbers are published by the services themselves.',
} as const;
```

`hero.gate` is not decorative. It is the first of the three objection answers (spec §1.3) and the
only sentence in the hero that a competitor could not copy without changing their product.
