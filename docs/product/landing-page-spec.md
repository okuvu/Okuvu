# Okuvu — public landing page: product specification

| Field | Value |
| --- | --- |
| Owner | Product (PM) |
| Status | DRAFT v1.0 — decisions taken, copy gated on clinical and legal sign-off |
| Written | 31 October 2026 |
| Code this describes | `okuvu/ts`, branch `develop`, HEAD `c3caa7a` (read from the tree, not from a plan document) |
| Companion file | `docs/product/landing-page-copy.md` — the copy deck in reading order |
| Related | `docs/CLINICAL-REVIEW-S3-CRISIS-COPY.md`, `docs/CLINICAL-DECISION-RECORD.md` (D-G), `plan/launch-backlog.psv` E20-S3, `docs/store/listing-copy.md`, `docs/SECURITY-DPDP-CHECKLIST.md` |

This spec replaces nothing. `/privacy` stays exactly as it is and the landing page links to it,
because it is already the public document Google Play and a DPDP notice both depend on.

---

## 0. Decisions taken

Every line below is a decision, not an option. The reasoning is in the section named.

| # | Decision | Section |
| --- | --- | --- |
| D1 | The page's single promise is continuity of care, not AI capability. No sentence on the page describes what the AI is; every sentence describes what the person gets between appointments. | §1 |
| D2 | The page's trust device is the invite gate: **you cannot create an account on Okuvu yourself; a therapist adds you.** This is also literally how the product works (`InviteToken` → `POST /invites/redeem`). | §1.3, §2.2 |
| D3 | There is **no download button** and no App Store / Play badge anywhere on the page. The app is not publicly installable (E19-S1 not started, E19-S6 not started). The only conversion is the waitlist. | §5 |
| D4 | There is **no price, no plan, no trial** on the page. There is no billing code in the repository at all. Price-sensitive visitors are answered with status honesty, not a number. | §1.4, §5 |
| D5 | The page lives at `/` in `apps/therapist-portal`, under a `(marketing)` route group with its own layout, and `/` is added to `PUBLIC_PATHS` in `proxy.ts`. No new app, no new infra: `okuvu.in`, `www.okuvu.in` and `portal.okuvu.in` already resolve to this one deployment. | §3 |
| D6 | `portal.okuvu.in` keeps redirecting `/` → `/dashboard` via a host check in `proxy.ts`. The apex and `www` get the landing page. Existing therapist muscle memory is preserved without a second deployment. | §3 |
| D7 | The crisis block is one component rendered from `CrisisResource`, placed directly under the "What Okuvu is not" list, and repeated compactly in the footer. Until the block is signed, it renders one line only: `112`. | §2.6, §6 |
| D8 | Marketing consent is captured on `WaitlistEntry`, not `BetaConsent`. `BetaConsent` is a test-harness corpus consent behind a `protectedProcedure` and cannot serve an anonymous visitor; it is reused only at the moment a waitlisted person is admitted to the supervised beta. | §4 |
| D9 | The waitlist needs a **new public endpoint** (`POST /public/waitlist`). The existing `POST /waitlist` is gated behind `verifyCognitoJWT` and must stay that way. | §4 |
| D10 | A CI guard (`scripts/check-banned-claims.mjs`) fails the build if a banned claim or banned phrase appears in the marketing copy module. The prohibition becomes executable rather than a note in a document. | §8 |

---

## 1. Positioning

### 1.1 The sentence

> **Okuvu is a between-sessions companion for adults in India who are working with a therapist:
> it keeps what you say across the week in one place, and the therapist who took you on can read
> how the week actually went before you next meet.**

Three things are deliberately absent from that sentence, and each absence is a decision:

- **No clinical adjective.** Not "safe", not "evidence-based", not "clinically reviewed". D-G in
  `CLINICAL-DECISION-RECORD.md` is the unsigned claims matrix; until it is signed, the page has no
  permission to use any of those words, and the live privacy policy already states in §16 that no
  certification is held.
- **No description of the AI.** The moment the page explains the model, it is selling technology
  in a market where the buyer's problem is trust. The AI is the mechanism; the therapist is the
  reason to believe.
- **No outcome promise.** Nothing about feeling better, reducing symptoms, or "managing anxiety".
  The promise is structural and verifiable from the schema: continuity.

**The single promise:** *the week doesn't disappear between appointments.* Everything on the page
is an argument for that one sentence.

### 1.2 Who it is for

| | Who | Why the page is written for them |
| --- | --- | --- |
| Primary | Adults 18+ in India, metro and tier-2, already in therapy or actively trying to start, smartphone-first, reading English or Hinglish | They are the only people who can hold an Okuvu account at all: the product is 18+, therapist-invited, and self-serve signup does not exist (`features/onboarding_welcome/age_blocked_screen.dart`, `InviteToken`) |
| Secondary (supply) | Practising therapists and small practices, 1–40 clients | They are the actual constraint. Every client needs a therapist on the other end, and therapist onboarding is a manual 45–60 minute walkthrough (`docs/therapist-onboarding/`), so this audience is a slow, high-intent channel and deserves a real section |
| Hypothesis, unproven | A family member researching on someone else's behalf — parent, spouse, sibling | India's care decisions are frequently family-mediated, and this is the most likely place a "buyer" differs from the "user". It is **not** a supported journey: no guardian flow exists, the product is 18+, and there is no field on `User` for a payer. The page must capture the intent without promising to serve it. Test in §7 M2 before building anything for it |

Not the audience: people in acute crisis (the page must route them out, not in), people under 18,
people looking for a diagnosis, people who want to replace their therapist.

### 1.3 The three objections

A skeptical Indian therapy-seeker arrives with three objections, in this order. The page answers
each one without a clinical claim, and each answer is grounded in something the repository
actually does.

**Objection 1 — "This is a chatbot pretending to be a therapist."**

- What is actually feared: being fobbed off. Being handed an app instead of care by someone who
  didn't want to pay for a real one, and then being told the app is enough.
- The answer, in the product's own architecture: **you cannot sign up.** A therapist adds you to
  their caseload and sends an invite code; without that code there is no account
  (`InviteToken`, `POST /invites/redeem`, the "enter invite code" screen in the mobile app). The
  page states this in the hero, in the first step of "how it works", and in the waitlist.
- The words used: *"You can't sign up on your own. A therapist adds you first — that's the point."*
- What the page never says: "AI therapy", "therapy from AI", "treatment", "diagnose", "your
  therapist in your pocket".

**Objection 2 — "If I write this down, someone will find out."**

- What is actually feared: a family member, an employer, a future in-law. In this market the
  privacy question is not a compliance question, it is a stigma question, and it is asked about
  people the user knows, not about servers.
- The answer: a concrete "who sees what" matrix rather than policy prose — the therapist sees
  summaries, not the journal; raw messages only if the user switches it on, and it can be switched
  off again (`TherapistClient.chat_access_granted`, default `false`); every therapist read is
  written to `ClinicalAccessLog`; data is stored in AWS Mumbai; and the account can be deleted
  from inside the app (`docs/privacy` §10).
- The words used: *"Summaries, yes. Your journal, no. Your raw messages, only if you switch that
  on — and you can switch it off again."*
- What the page never says: "100% secure", "end-to-end encrypted" (it is not), "we can never see
  your data" (staff with database access exist).

**Objection 3 — "What does this cost me, and why would I believe any of this?"**

- What is actually feared: another subscription in a country where a therapy session is already a
  significant monthly expense, sold by a company that will vanish or start charging.
- The answer is status honesty, and it is unusually strong because the product genuinely has no
  billing: **the page says what stage this is at and that it is not selling anything yet.** Beta,
  invite-only, places open slowly because each one needs a therapist on the other end. The page
  also admits what it is not (§2.5), which is the only credibility device available to a product
  with no users, no testimonials and no certifications.
- The words used: *"We're not selling anything on this page yet. Places open when a therapist has
  room, and we'd rather say that than take a payment we can't service."*
- What the page never says: a price, "free forever", "cancel anytime", a discount, a countdown.

### 1.4 Market reality — what is fact and what is a hypothesis

**Facts (read from the repository or the plan):**

- No billing code exists anywhere in `apps/` or `packages/` — no Stripe, no Razorpay, no
  subscription model. A price cannot be shown because nothing can be bought.
- The app is not publicly installable: E19-S1 (Play Console account), E19-S4 (declarations),
  E19-S5 (closed test), E19-S6 (submission) and E19-S7 (rollout) are all `not_started` in
  `plan/run-ledger.psv`.
- The product is 18+ only, stated in the privacy policy §13 and enforced at
  `features/onboarding_welcome/age_blocked_screen.dart`.
- The product is English-first with an adaptive Hinglish mode: `LanguageMode` is
  `english | mirror`, not a Hindi localisation. The page may say Okuvu can mirror Hinglish back;
  it may not say the app is available in Hindi.
- Therapist supply is manual: seeded by script, onboarded by walkthrough
  (`docs/therapist-onboarding/therapist-seed-guide.md`).

**Hypotheses to test — label them as hypotheses, never as facts, in any internal deck:**

| # | Hypothesis | How the page tests it |
| --- | --- | --- |
| H1 | The "between sessions" frame converts better than a "mental health" frame, because it describes a logistical gap rather than an identity | A/B the hero H1 against a "mental health support" control; measure waitlist conversion (§7 M1) |
| H2 | Privacy, not efficacy, is the primary objection | Measure scroll depth to §2.4 "Who sees what" (§7 M3). If under 25% reach it, H2 is wrong and the page should lead with the therapist gate instead |
| H3 | A family member is a meaningful share of visitors | The role dropdown on the waitlist (§4). If family intent exceeds 15% of submissions, the 18+ wall becomes a product question, not a copy question |
| H4 | Therapists find the page through their own networks, not search | Attribution on the therapist `mailto` (§7 M4) |
| H5 | Price is a conversion blocker *before* price is even shown | The optional "what would you want to know before trying this?" free-text field (§4), coded into buckets |

If H1 and H2 both fail, the page's whole structure is wrong and it should be rebuilt around the
therapist gate alone. That is a legitimate outcome; the metrics in §7 are designed to make it
visible in two weeks rather than two quarters.

---

## 2. Page IA, in order

Nine sections plus nav and footer. Every section below states its job, the copy, the visual, and
the repo feature it is allowed to reference. Full strings, including alternates, are in
`landing-page-copy.md`; this section is the reasoning.

Reading order is deliberate: legitimacy → mechanism → what you get → who sees what → what it is
not → data → action. The privacy block sits **before** the waitlist, because objection 2 is
answered before the user is asked for an email address, not after.

### 2.1 Hero

- **Job:** in one screen, say what this is, who it is for, and remove the "chatbot pretending to
  be a therapist" fear. The hero's real work is the invite-gate line, not the headline.
- **Eyebrow:** `Supervised beta · places open by therapist invitation`
- **H1:** `Therapy is one hour a week. This is for the other 167.`
- **Sub:** `Okuvu is something to talk to between sessions, and the therapist who took you on can
  read how the week actually went — so the next appointment starts where the last one ended.`
- **Micro-line under the CTA (this is the trust device, do not let a designer delete it):**
  `You can't sign up on your own. A therapist adds you first. That's the point.`
- **CTAs:** primary `Join the waitlist` → `#waitlist`; secondary text link `See who sees what` →
  `#who-sees-what`.
- **Visual:** the brand spiral mark at large scale on `royal night`, thread partially drawn, honey
  tip dot as the only warm accent. No photography in the hero — a stock photo of a smiling person
  would read as an advertisement for happiness, which is the exact register this product must
  avoid. Copy sits left, mark sits right on desktop; mark above copy, 96px, on mobile.
- **Repo truth it may reference:** nothing directly. The hero makes no feature claim; it makes a
  structural one.
- **Must not say:** any clinical adjective; any second-person presence ("we're here for you",
  "someone who's always there", "never alone"); any download prompt.

### 2.2 How it works — three steps

- **Job:** convert the invite gate from a limitation into the mechanism. This is the section that
  makes the product legible to someone who has never heard of it.
- **H2:** `Three steps, and the first one isn't yours.`
- **Step 1 — `A therapist adds you.`**
  `Okuvu isn't a download-and-go app. A licensed therapist takes you onto their caseload and sends
  you an invite code. No code, no account.`
- **Step 2 — `You talk, most days.`**
  `Type what the day was actually like — the argument, the flat afternoon, the thing you didn't say
  in the session. Okuvu carries context forward, so you're not re-explaining yourself every time.`
- **Step 3 — `Your therapist reads the week before you meet.`**
  `Summaries of your conversations reach their portal, alongside your mood check-ins. They see a
  pattern, not a transcript.`
- **Visual:** three columns on `paper`, each with a 2px-stroke rounded icon in `royal purple`, step
  numbers in `honey ink`. A thin brand-thread rule connects the three on desktop, which is the
  visual argument that these are one continuous loop, not three features. Mobile: vertical, thread
  running down the left edge.
- **Repo truth:** `InviteToken` + `POST /invites/redeem` + the invite-code screen
  (`apps/mobile/lib/src/features/auth/`); `SessionSummary` (`SummaryStatus`: PENDING / COMPLETED /
  FAILED / SKIPPED_TRIVIAL); `MoodLog` (`mood_value`, `date_ist`); the portal's Report Card and
  Session Prep views (`apps/therapist-portal/src/app/clients/[id]/report/`).
- **Must not say:** "your therapist is alerted", "real-time", "monitored 24/7". Summaries are
  written and read when they are read; there is no alerting path (see §5).
- Note for the copywriter: "licensed therapist" is a statement about the person, not about the
  product, and does not require clinical sign-off. Do not upgrade it to "qualified professional
  team" or "clinical team" — there is no team.

### 2.3 What you actually get

- **Job:** answer "what does it do", for a reader who has decided the model is legitimate and now
  wants the feature list. Five cards, no more; a sixth card means the page is selling, not
  explaining.
- **H2:** `What's actually in it.`
- **Sub:** `Five things, all of them working today. Nothing on this page is on a roadmap.`
- **Cards:**
  1. **`Talk when there's no appointment`** — "2am, a train, the ten minutes after a bad call. Type
     it instead of holding it until Thursday."
  2. **`A mood check-in that builds a line`** — "One tap a day. After a few weeks you can see the
     shape of the month instead of guessing at it."
  3. **`A journal nobody else reads`** — "Journal entries are yours. They are not shown to your
     therapist, and they are not part of the summary."
  4. **`Five two-minute exercises`** — "Breathing and grounding you can open on your own, or that
     your therapist can set for the week with a reminder attached."
  5. **`The admin of care, in one place`** — "Appointments, homework and reminders, so nothing
     depends on you remembering it at the right moment."
- **Visual:** 5 cards on `orchid wash`, `r-md` radius, hairline borders, icons 2px stroke. Card 3
  (journal) gets a `sage tint` surface instead of purple — the only green on the page — because it
  is the one feature whose value is that it is *not* shared. Card count on mobile: single column,
  in order, journal third.
- **Repo truth:** `features/chat/` + `SessionSummary`; `features/home/widgets/mood_check_in.dart` +
  `features/progress/progress_screen.dart`; `JournalEntry` and privacy policy §6; the five seeded
  exercises in `ToolRegistryEntry` (`grounding_5431` 5-4-3-2-1 Grounding, `guided_breathing`,
  `box_breathing`, `physiological_sigh`, `extended_exhale`); `Appointment`, `Homework`,
  `Reminder`, and the Today card (`features/home/widgets/today_card.dart`).
- **Must not say:** "clinically proven exercises", "evidence-based techniques", "CBT", "DBT". The
  five exercises are the clinically-approved set *internally* (decisions round 15 Sep 2026 §3),
  and that approval is not a marketing licence — see §6 B1.
- **Must not say:** "voice journaling". Dictation exists (`core/speech_service.dart`) but audio
  never leaves the phone; "voice" reads as a feature the product does not have.

### 2.4 Who sees what

- **Job:** answer objection 2 with a matrix instead of a paragraph. This is the most important
  section on the page for this market, and it is the only section where the product's real
  consent model is a selling point rather than a compliance chore.
- **H2:** `Who sees what.`
- **Sub:** `Not a summary of our privacy policy. The actual switches, as they exist in the app.`
- **Two columns:**
  - **`Your therapist sees`** — summaries of your conversations; your mood check-ins, if you've
    agreed to share them; the homework and reminders they set; the notes they write about you.
  - **`Your therapist doesn't see`** — your journal, ever; your raw messages, unless you switch
    chat access on, and you can switch it off again the same way; anything you write after you
    turn it off.
- **One line under the columns, and it must be true (it is):**
  `Every time a therapist opens your record, it's written into an access log.`
- **Visual:** the two columns are the only place on the page with a hard visual divider. Left
  column on `paper` with `sage deep` check glyphs; right column on `royal night` with `lavender
  tint` text and lock glyphs. The dark surface is doing work: "the things they can't see" is the
  part a reader remembers, so it is the part that looks like a vault.
- **Repo truth:** `TherapistClient.chat_access_granted` (default `false`), `chat_access_requested_at`,
  `PATCH /users/me/chat-access`, the pending-access banner
  (`features/home/widgets/pending_chat_access_banner.dart`), `ClinicalAccessLog` (every therapist
  read of safety state, reasoning note, session summary or notes), privacy §6.
- **Must not say:** "encrypted end-to-end" (the therapist's own portal view is server-side
  plaintext by design); "we cannot see your data"; "your therapist needs your permission to see
  anything" — they see summaries by default, and that must be stated plainly, not softened. This
  section's credibility depends on the left column being uncomfortable to read.

### 2.5 What Okuvu is not

- **Job:** pre-empt the four questions that stop a purchase, in the order they arrive. State the
  limits before the user asks, because a product with no track record has no other way to be
  believed.
- **H2:** `What this isn't.`
- **Four items, each a bold line and one sentence:**
  1. **`Not a replacement for your therapist.`** "Okuvu doesn't diagnose, prescribe or treat
     anything. It's the space between appointments, not the appointment."
  2. **`Not an emergency service.`** "If someone is in danger right now, Okuvu cannot send help.
     Call 112." → see §2.6, the crisis block sits directly beneath this item, not in the footer.
  3. **`Not for under-18s.`** "Okuvu is for adults, 18 and over. We don't take accounts for
     children, and there is no parent or guardian sign-up."
  4. **`Not finished.`** "This is a supervised beta with a small number of therapists. Things
     break. We'd rather say so here than after you've trusted us with something."
- **Visual:** plain list on `cream`, no icons, `charcoal ink` at body size, generous leading. This
  section is deliberately the least designed block on the page — it should read like a note, not a
  feature. Item 2's line is the only text on the page set in `honey ink` bold.
- **Repo truth:** 18+ gate (`age_blocked_screen.dart`, privacy §13); no diagnosis or treatment
  capability anywhere in the pipeline; beta status (E20-S1 pilot not started).
- **Must not say:** "we'll keep you safe"; "if you're struggling we're here"; anything that
  implies a human is watching.

### 2.6 Crisis block (gated)

- **Job:** give a person in danger a route out of the page. It is not a marketing element and must
  never be styled as one — no card, no icon, no brand colour beyond `charcoal ink`.
- **Placement decision:** directly beneath "Not an emergency service", because that is the sentence
  that creates the obligation to answer. Repeated compactly in the footer so it is reachable from
  every scroll position. Both instances render from **one component** reading `CrisisResource`, so
  there is exactly one source of truth and one thing to change when the list is signed.
- **Today's state:** the block's text is not signed. Until it is, the component renders exactly
  one line: `If someone is in danger right now, call 112.` — India's national emergency number,
  already in the product's approved set, making no mental-health claim. Everything else (14416,
  iCall, Vandrevala, hours, "we can stay with you while you call") is **BLOCKED** and supplied by
  the clinical authority, not written by us. See §6 B2.
- **Visual:** `paper` background, `charcoal ink`, body size, a single hairline rule above. Under it,
  small print: `These numbers are published by the services themselves.`
- **Repo truth:** `CrisisResource` model (5 seeded numbers), `CRISIS_RESPONSE` in
  `apps/api/src/pipeline/fallbacks.ts`, `features/crisis/crisis_overlay.dart`.
- **Must not say:** anything. This block has no authored copy until it is signed. Not one
  connective word.

### 2.7 Where your data lives

- **Job:** the four facts a DPDP-conscious reader actually wants, in four lines, each traceable to
  the policy. This is the section that makes `/privacy` feel like a destination rather than a
  legal obligation.
- **H2:** `Your data, in four lines.`
- **Lines:**
  1. `Stored in AWS Mumbai, in India.`
  2. `No third-party analytics or crash-reporting SDK in the app.`
  3. `Your voice stays on your phone — dictation uses your phone's own recogniser, and no audio is
     sent to us.`
  4. `You can delete your account from inside the app, under Settings → Privacy & Data.`
- **Link:** `Read the full policy →` to `/privacy`, plus a plain note:
  `It lists what we do not claim, too. There's a section for that.`
- **Visual:** two-by-two grid on `paper`, numbered 01–04 in `honey ink`, `charcoal ink` body. No
  shield icons, no padlocks, no badge row. A badge row is the single fastest way to look like a
  company claiming a certification it does not hold.
- **Repo truth:** privacy §8 (AWS `ap-south-1`), §5 (no third-party analytics/crash SDK),
  §3 (`core/speech_service.dart`, no audio leaves the device), §10 (in-app deletion), §16
  (what is not claimed).
- **Must not say:** "DPDP compliant", "HIPAA", "ISO 27001", "bank-grade encryption", "GDPR ready".
  None of these are held; the policy says so in writing.

### 2.8 Beta status and the waitlist

- **Job:** the conversion. Also the price answer, without a price.
- **H2:** `If you want a place, leave an email.`
- **Sub:** `We're not selling anything on this page yet. Places open when a therapist has room on
  their caseload, and we'd rather say that than take a payment we can't service.`
- **Body:** `Leave an email and we'll write to you once, when a therapist has a place. If you
  already have a therapist who might use Okuvu, say so in the form — that's the fastest route in.`
- **Form:** email (required), phone (optional, E.164, "only if you'd rather we text"), role
  (three options, see §4), consent checkbox (gated, §6 B3), submit `Join the waitlist`.
- **Visual:** a single centred column, max 560px, on `royal night` with `lavender tint` text and an
  `electric violet` submit. The dark surface marks this as the end of the page and the one place
  something is asked of the reader. Inputs are `paper` on night, 48px tall, 16px text (16px
  prevents iOS zoom-on-focus).
- **Repo truth:** `WaitlistEntry`, `sendWaitlistConfirmationEmail` (Brevo, fail-open), the existing
  waitlist screen in the app (`features/auth/waitlist_screen.dart`) — the web form is a second
  front door to the same table, not a new concept.
- **Must not say:** a price, a date, "we'll be in touch within 48 hours", "limited spots", a
  countdown, "join 5,000 others".

### 2.9 For therapists (secondary)

- **Job:** open the supply side. One section, low on the page, high in intent.
- **H2:** `If you're a therapist, this is the part that matters.`
- **Body:** `Your caseload in one place: who's active, what they did between sessions, what you set
  for them. Summaries are waiting before the appointment rather than reconstructed after it. You
  decide whether you see raw messages — that switch is the client's, and it starts off.`
- **CTA:** `Write to admin@okuvu.in` (mailto, subject pre-filled `Okuvu for my practice`).
- **Micro:** `Onboarding is a 45-minute walkthrough with a person, not a signup form.`
- **Visual:** two columns — copy left, a single static screenshot of the caseload table right, on
  `orchid wash`. Screenshot must be of the real portal with seeded demo data, never a mockup
  (a fake screenshot is the one lie that gets caught immediately by the audience it targets).
- **Repo truth:** `clients.list`, caseload table
  (`apps/therapist-portal/src/app/dashboard/_components/ClientTable.tsx`), client detail sub-pages
  (conversation, notes, homework, reminders, program, report, tools), `TherapistNote`,
  `docs/therapist-onboarding/`.
- **Must not say:** "join our network of 200 therapists"; "earn from home"; "refer clients and
  earn". There is no referral programme, no payments, and no therapist self-signup.

### 2.10 Nav and footer

- **Nav (sticky, 64px, `paper` at 92% opacity, hairline bottom):** wordmark left; `How it works`,
  `Who sees what`, `For therapists` centre (desktop only); `Sign in` right, always visible. On
  mobile: wordmark + `Sign in` + the primary CTA, no hamburger — three items do not need a drawer.
- **`Sign in` points to `/dashboard`, not `/auth`.** A signed-out visitor is bounced to `/auth` by
  the proxy; a signed-in therapist lands on their caseload. One link serves both states, which is
  what keeps the landing page a static route with no session read (see §3).
- **Footer:** logo, the one-line description `Okuvu is a wellbeing app for adults in India, 18+. It
  is not therapy and it is not an emergency service.`, the compact crisis block, links to
  `/privacy`, `admin@okuvu.in`, and the line
  `We hold no clinical certification, audit attestation or compliance badge, and this page claims
  none.`
- **No social icons.** There are no Okuvu social accounts; linking dead icons is the cheapest way
  to look abandoned.

---

## 3. The therapist login entry, and the `/` redirect

### 3.1 What exists today

- `apps/therapist-portal/src/app/page.tsx` is four lines: `redirect('/dashboard')`.
- `apps/therapist-portal/src/proxy.ts` sends every unauthenticated request to `/auth` unless the
  path is in `PUBLIC_ROUTES` (`/auth`), `PUBLIC_PATHS` (`/privacy`), or matches `/_next`, `/brand/`,
  `/favicon.ico`, `/icon.svg`.
- `okuvu.in`, `www.okuvu.in` and `portal.okuvu.in` all point at the same ALB/Next deployment
  (`infrastructure/aws/evia-beta/variables.tf` `portal_alias_hostnames`).
- Signed-in users hitting `/auth` are redirected to `/` — which today means `/dashboard`.

### 3.2 Recommendation

1. **Move the landing page to `apps/therapist-portal/src/app/(marketing)/page.tsx`** with its own
   layout (no `AuthenticatedShell`, no tRPC provider, no session). Delete the redirecting
   `app/page.tsx`. `(marketing)` is a route group, so the URL is `/` exactly as now.
2. **Add `'/'` to `PUBLIC_PATHS`** — the exact string, not a prefix, matching the existing comment's
   instruction not to widen `/privacy` into a prefix match.
3. **Add a host check at the top of `proxy.ts`, before the session lookup:**
   ```
   const host = request.headers.get('host') ?? '';
   if (host.startsWith('portal.') && pathname === '/') → redirect('/dashboard')
   ```
   so `portal.okuvu.in` behaves exactly as it does today.
4. **Keep `/auth` in `PUBLIC_ROUTES` and leave the signed-in bounce to `/` alone.** A signed-in
   therapist who visits `/auth` lands on `/`, sees the landing page with a working `Sign in`, and
   one click returns them. Not ideal, mildly odd, and cheaper than making `/` session-dependent.

### 3.3 Why this and not the alternatives

| Alternative | Why not |
| --- | --- |
| New `apps/marketing` app | New build, new ECS service or a new static host, new TLS/alias wiring, new deploy pipeline, for one page. The domain already resolves here; the marginal infra cost buys nothing |
| Landing page at `/welcome`, keep `/` → `/dashboard` | The bare domain must be the front door. `okuvu.in` pointing at a login screen is why the current site cannot be sent to anyone |
| Host the page in `apps/mobile`'s web build | There is no web build of the Flutter app; adding one is a larger project than the page |
| Make `/` session-aware (show "Open portal" when signed in) | Turns a cacheable static page into a dynamic one that depends on auth infrastructure — the exact failure mode `/privacy`'s comment was written to avoid. The `Sign in` → `/dashboard` link solves it for free |

### 3.4 The consequence for existing users, stated plainly

- **Therapists with `okuvu.in` bookmarked** will now see a marketing page. Mitigations: the
  `Sign in` link goes straight to `/dashboard`; `portal.okuvu.in` is unchanged; and the therapist
  walkthrough script should be updated to say "go to portal.okuvu.in" rather than "go to okuvu.in"
  (`docs/therapist-onboarding/reference-card.md` — one line to edit, in the same PR).
- **Clients are unaffected.** Invite redemption happens inside the mobile app — the invite email
  contains a code and instructions to open the app, not a link to the site
  (`apps/api/src/lib/email.ts`: "There's no web landing page for the invite — redemption happens
  inside the mobile app itself"). This is the reason the routing change is low-risk: the primary
  user journey never touched the web root.
- **Google Play's data-safety reviewer** reaches `/privacy` directly; that path is unchanged and
  unaffected by the `/` change.

---

## 4. Waitlist flow, mapped onto `WaitlistEntry` and `BetaConsent`

### 4.1 What the models actually are

| Model | Fields today | What it is for | Can it carry marketing consent? |
| --- | --- | --- | --- |
| `WaitlistEntry` | `id`, `email`, `phone_number?`, `created_at` | S6: a phone number that hit `/auth/verify-otp` with no matching account. Follow-up is a **manual** ops action | It is the right table, but it has no consent fields and no status — both needed |
| `BetaConsent` | `id`, `corpus_case_id?`, `user_ref`, `scope`, `consent_granted_at`, `expires_at?` | Test-harness consent for the evaluation corpus, captured by `apps/test-harness/src/server/routers/consent.ts` behind a **`protectedProcedure`** | **No.** It requires an authenticated session, and semantically it is a corpus/beta consent. Using it for an anonymous marketing capture would corrupt the meaning of every row in that table |

**Decision (D8):** extend `WaitlistEntry`, do not touch `BetaConsent` for this. `BetaConsent` is
used later in the funnel, correctly: when ops admits a person to the supervised beta, it writes
`BetaConsent { user_ref: <userId>, scope: 'supervised_beta', expires_at: <two weeks after intake> }`
— the shape the model was designed for, tied to a real user, with a real expiry.

### 4.2 Schema change

One migration, additive, no backfill needed except the unique-index dedupe:

```prisma
model WaitlistEntry {
  id              String   @id @default(uuid())
  email           String
  phone_number    String?
  /// 'client' | 'therapist' | 'on_behalf' — landing-page role.
  /// Null for the S6 phone-OTP rows that predate it.
  role            String?
  /// DPDP: which notice the person consented to, and when.
  /// Copy of the notice is versioned in /privacy; this is the pointer, not the text.
  consent_version String?
  consent_at      DateTime?
  /// 'landing_hero' | 'landing_footer' | 'app_otp' — where the capture happened.
  source          String?
  /// Set by ops when the person is admitted to the supervised beta.
  admitted_at     DateTime?
  created_at      DateTime @default(now())

  @@unique([email])
  @@index([created_at(sort: Desc)])
}
```

Two notes for the implementer:

- The `@@unique([email])` requires a dedupe of existing rows first (keep the earliest, log the
  rest to a text column or a scratch table). The table has had no uniqueness constraint, so
  duplicates from retried OTP flows almost certainly exist.
- Do **not** add an IP-address column on the page's initiative. Whether proof-of-consent requires
  the source IP is a legal question (§6 B3), and IP is additional personal data in a health
  context. If legal says yes, it is added once, deliberately, with a retention period.

### 4.3 The endpoint

**New:** `POST /public/waitlist` in `apps/api`, no auth, rate-limited (5 per IP per hour), same
validation as the existing route (`EMAIL_RE`, E.164 `PHONE_REGEX`), `upsert` on email so a double
submit is idempotent and returns `{ success: true }` either way — never "this email is already
registered", which leaks membership of a mental-health waitlist to anyone who guesses an address.

**Do not** loosen `preHandler: [verifyCognitoJWT]` on the existing `POST /waitlist`. That gate is
what keeps the OTP-path endpoint from being an open write. The two endpoints share the table, the
validation and the email function, not the auth posture.

### 4.4 Fields on the form, and why each one is there

| Field | Required | Why | DPDP note |
| --- | --- | --- | --- |
| Email | Yes | The only contact channel the product actually has (`sendWaitlistConfirmationEmail`, Brevo) | Personal data; purpose-limited to one notification |
| Phone | No, E.164 | Some people would rather be texted than emailed, and the ops follow-up today is manual by phone/WhatsApp | Optional means optional — the form must submit without it |
| Role | Yes, 3 options | Separates the two marketplace sides and tests H3 | Not sensitive; no health information |
| Consent checkbox | Yes, unticked | Lawful basis, purpose statement, withdrawal route | **Legal review required — §6 B3** |
| "What would you want to know before trying this?" | No, free text, 140 chars | The research instrument for H5. Deliberately about *the product*, not about the person | Must be labelled `Please don't include anything about your health here` — this field is one careless prompt away from collecting special-category data |

The role options: `I'm looking for support myself` / `I'm a therapist` / `I'm asking for someone else`.
The third option exists to test H3 and is answered honestly, not served: the confirmation for that
role says `Okuvu is for adults 18 and over, so we can only open an account for the person
themselves. If they'd like a place, the form works for them too.`

### 4.5 What happens after submit

1. Row written (or upserted) with `role`, `consent_version`, `consent_at = now()`, `source`.
2. Confirmation email sent through the existing `sendWaitlistConfirmationEmail` — **fail-open**, as
   it is today: the row is already saved, so a Brevo failure never loses the capture.
3. Inline confirmation replaces the form (no redirect, no new page, no `?submitted=1`):
   `You're on the list. We'll email you when a therapist has room. If you'd rather not wait, write
   to admin@okuvu.in.`
4. The row enters the ops queue (`status` is derived: `admitted_at IS NULL` = outstanding). There is
   no automated admission and there should not be — admission means a therapist takes a real person
   onto a real caseload.
5. On admission, ops writes `BetaConsent` (scope `supervised_beta`) and sets `admitted_at`.

**Two copy rules for the confirmation email, both for stigma reasons, both non-negotiable:**

- The subject line must not contain the words mental, therapy, wellbeing, anxiety or depression. Use
  `Your Okuvu waitlist request`. Many people in this market share a phone or an inbox with family.
- The body must not restate what the person wrote in the free-text field, and must not contain a
  crisis number unsolicited (an unrequested helpline in an inbox is itself a disclosure).

**Withdrawal:** the consent line must tell the person they can withdraw by writing to
`admin@okuvu.in`. A one-click unsubscribe link needs a token that does not exist in
`WaitlistEntry` — that is a build item (§6 B4), not a copy decision. The deletion path already
works: `apps/api/src/lib/account.ts` deletes `waitlistEntry` rows by email/phone on an erasure
request, which is what makes the manual route honest rather than a promise.

---

## 5. What must not be on the page, and why

| Not on the page | Why | What happens if it slips through |
| --- | --- | --- |
| "Clinically reviewed", "clinically validated", "evidence-based", "safe", "approved by therapists", "RCI", "medical device" | D-G (launch claims matrix) is unsigned; E20-S3 `not_started`; `docs/CLINICAL-REVIEW-S3-CRISIS-COPY.md` §7.3 item 4 explicitly excludes marketing surfaces; the live privacy policy §16 states no certification is held | The product would claim an endorsement from a named clinical psychologist who has not given it. This is the one error that is not recoverable in this market |
| "I'm here with you", "take a breath with me" | Rejected by the clinical authority on 30 Oct 2026 as companion-implying: an unmonitored tool must not sound like a person who is present | Direct contradiction of a signed clinical decision, on a public page |
| "Someone's always there", "never alone", "we're here for you", "24/7 support", "a therapist in your pocket" | Same reason, by extension. These imply presence and availability the product does not have | If someone reads "24/7" and waits until 3am for a reply that is a fixed string, the page caused harm |
| "Your therapist is alerted if…" | No alerting exists. `Safety Reviews` in the portal sidebar is a **disabled** nav item; the escalation route (D-F) is unsigned and the runbook section ships under an unapproved banner | Creates a duty of care the system cannot meet |
| "Download on Google Play", any store badge | No Play Console account (E19-S1), no production submission (E19-S6) | Every click is a dead end, and a broken download is the fastest trust loss available |
| Any price, plan, trial, "cancel anytime", discount, countdown | Zero billing code in the repository | A price implies a purchasable thing. There is nothing to purchase |
| "AI therapy", "therapy from AI", "treatment", "diagnosis", "cure", "managing your anxiety" | The product does not do any of these; the pipeline's own vocabulary is support, grounding and routing, not treatment | Regulatory exposure as a medical device claim, plus a straight lie |
| "Available in Hindi" | `LanguageMode` is `english | mirror`. Mirror is adaptive Hinglish, not a Hindi UI | An English-only interface advertised in Hindi is a broken promise on the very axis (language) the page is leaning on |
| "Encrypted end-to-end", "we can't see your data", "100% secure" | Not true. Server-side plaintext for therapists' summaries; staff and database access exist | One determined reader, one lie |
| "DPDP compliant", "HIPAA", "ISO 27001", "GDPR ready" | Nothing is held or audited; privacy §16 says so in writing | Contradicts the policy linked two inches below it |
| Testimonials, user counts, "trusted by N people", logos | No consented testimonials, no users to count. Publishing a health testimonial also needs specific written consent | Fabricated social proof is the single most common landing-page lie and the easiest to disprove |
| "Your data is never used to train models" — **unless quoted from /privacy** | Privacy §4 states no own-model training but relies on provider terms | If reworded on the page it can drift beyond what counsel has seen. Link the policy, don't paraphrase it |
| Exercises framed as therapy techniques ("CBT", "DBT", "trauma-informed") | The five exercises are breathing and grounding. Naming a modality claims a treatment model | Implies clinical intervention design the product does not have |

---

## 6. BLOCKED — clinical sign-off and legal review

Each row is blocked, has an owner, and has a **shipping placeholder** so the page can go live
without the sign-off and be improved when it arrives. Nothing here ships as drafted.

| # | Element | Blocked on | Owner | Safe placeholder that ships today | Unblocks when |
| --- | --- | --- | --- | --- | --- |
| B1 | Any clinical descriptor anywhere (hero, exercises card, footer) | D-G claims matrix, unsigned; E20-S3 `not_started` | Shubhangi Goswami → written approval; Rajwant to schedule | No clinical adjective at all. The page ships with **zero** such claims, which is a complete, shippable state | She initials D-G with the exact strings, pinned to a commit |
| B2 | Crisis block full text: 14416, iCall 9152987821, Vandrevala 1860-2662-345, hours, any "stay with you while you call" line | Helpline block must be signed and dated; her 30 Oct answer requires Tele-MANAS 14416 to be **added**, and 14416 is not yet in `CrisisResource` or `fallbacks.ts` | Clinical authority supplies the text; engineering implements | One line: `If someone is in danger right now, call 112.` Rendered from `CrisisResource`; component renders nothing extra when the table holds only 112 | Signed helpline block + 14416 added to the canonical list in the same PR |
| B3 | Consent checkbox wording, purpose statement, withdrawal route, whether IP is retained as proof | DPDP: consent must be free, specific, informed, unconditional, with notice. Wording is a legal question, not a copy question | Counsel (via Rajwant); nothing in `docs/SECURITY-DPDP-CHECKLIST.md` settles it | Draft string in the copy deck, marked `LEGAL-REVIEW-REQUIRED`, rendered as-is but with the page **not** publicly launched until counsel signs (waitlist can be enabled behind a flag) | Counsel returns the sentence; `consent_version` bumps |
| B4 | One-click unsubscribe / consent withdrawal link in the confirmation email | No token field on `WaitlistEntry`; withdrawal today is a manual `admin@okuvu.in` request | Engineering + legal (whether email withdrawal is sufficient) | Consent line says withdrawal is by writing to `admin@okuvu.in`, which `account.ts` can actually action | Token field + `/unsubscribe` route built and legally accepted |
| B5 | Waitlist confirmation email copy (subject and body) | Health-adjacent communication; also the stigma rules in §4.5 | Legal review, plus ops for tone | Subject `Your Okuvu waitlist request`, body confirming receipt only, no health words, no helpline | Reviewed before the form is enabled publicly |
| B6 | Any sentence implying a therapist is alerted, monitoring, or on call (including the "For therapists" section) | No alerting exists; `Safety Reviews` is a disabled nav item; escalation route D-F unsigned | Clinical authority (D-F) + engineering | Say only what the portal does: summaries available before the appointment, access logged | D-F signed **and** alerting verifiably reaches a named human |
| B7 | Anything addressed to a parent or guardian, or "for your family member" | Product is 18+ with no guardian flow; privacy §13 | Product decision, not legal | The `on_behalf` role option, answered honestly in the confirmation email, promising nothing | A guardian flow exists, or the option is removed |
| B8 | The therapist screenshot in §2.9 | Must show real portal UI with seeded demo data, not a client's real record | Ops (seed a demo caseload); no clinical input needed | Placeholder: the section renders without a screenshot until a clean demo capture exists — never a mockup | Demo data seeded and captured |
| B9 | "Supervised beta" framing itself | Whether "supervised" is a claim she will stand behind, given D-F is unsigned | Clinical authority | `In beta · places open by therapist invitation` (drop "supervised" until confirmed) | Her answer on D-F |
| B10 | Hinglish/Hindi resonance in the hero (H1 alternate in Hinglish) | Not a sign-off blocker, but a claim blocker: the app is English-first with `mirror` | Product/copy, with native-speaker review | Ship the English hero; hold the Hinglish alternate for the A/B in §7 M6 only after a native review | Native review complete, and the alternate does not promise a Hindi UI |

**Rule for the implementer:** if a string in `landing-page-copy.md` carries a `[BLOCKED: Bn]`
marker, it must not be merged enabled. Render the placeholder, keep the blocked string in the copy
deck with its marker, and let the CI guard (§8) catch anyone who removes the marker without
clearing the gate.

---

## 7. Measurement — what this page must prove

Six metrics. Each has an instrument, a threshold, and a decision it triggers. Anything without a
decision attached is not on this list.

**M1 — Waitlist conversion by source.**
Instrument: `WaitlistEntry.source`, server-side on `/public/waitlist`. Threshold: ≥8% of sessions
from therapist-referred traffic, ≥2% from cold search/social. Decision: if cold conversion is under
1% after 1,500 sessions, stop spending on acquisition and make the page a referral artefact for
therapists only.

**M2 — Who is arriving: the role split.**
Instrument: `WaitlistEntry.role`, reported weekly. Threshold: therapist submissions ≥20% of all
submissions. Decision: if therapist share is under 10%, the supply side is not finding the page —
which means the constraint on the business is not being addressed by the site at all, and the
"For therapists" section needs its own page and its own channel.

**M3 — Do people reach "Who sees what"?**
Instrument: scroll-depth event at `#who-sees-what` (a single `IntersectionObserver`, no analytics
SDK — the page must not introduce the third-party analytics the privacy policy says the product
does not use; use a first-party `/api/public/event` counter with no cookies and no identifiers).
Threshold: ≥45% of sessions reach it. Decision: tests H2. Under 25% → privacy is not the primary
objection; rebuild the middle of the page around the therapist gate and drop two sections.

**M4 — Therapist intent.**
Instrument: click on the `admin@okuvu.in` mailto, counted as a first-party event before the mail
client opens. Threshold: ≥12 clicks/month from therapist-tagged traffic. Decision: at 12+, the
manual onboarding becomes a capacity problem worth building for; below 3, the therapist section is
decoration and should be cut to one line.

**M5 — The objection, in the visitor's own words.**
Instrument: the optional 140-character "what would you want to know before trying this?" field,
coded weekly into five buckets (price / privacy / legitimacy / "does it work" / access). Threshold:
≥25% field completion. Decision: whichever bucket is largest becomes the next hero. This is the
only metric on the page that produces a *sentence* rather than a rate, and it is the most valuable
one at this stage.

**M6 — Hero A/B (H1 vs the mental-health control, and later the Hinglish alternate).**
Instrument: 50/50 split at the edge or in middleware, one variable, minimum 400 sessions per arm
before reading. Threshold: a ≥30% relative lift in M1 for one arm. Decision: adopt the winner and
retire the loser from the copy deck so the deck never carries two live heroes again.

**Deliberately not measured:** time on page (meaningless here), bounce rate (a fast exit to `/privacy`
is a success), "engagement" of any kind, and anything requiring a third-party analytics SDK.
Privacy §5 says the app carries no third-party analytics; a marketing site that loads one would
make that sentence false for the whole domain.

---

## 8. Build notes

**Route and files**

```
apps/therapist-portal/src/app/(marketing)/layout.tsx     # marketing chrome, no session, no tRPC
apps/therapist-portal/src/app/(marketing)/page.tsx       # the page: sections only
apps/therapist-portal/src/app/(marketing)/_components/   # Hero, HowItWorks, WhatYouGet,
                                                         # WhoSeesWhat, WhatItIsNot, CrisisBlock,
                                                         # DataLines, WaitlistForm, ForTherapists
apps/therapist-portal/src/lib/marketing/copy.ts          # every string, exported, typed
apps/therapist-portal/src/app/api/public/event/route.ts   # first-party counters for M3/M4
apps/api/src/routes/public-waitlist.ts                    # POST /public/waitlist
scripts/check-banned-claims.mjs                           # CI guard
```

**Rendering:** server components throughout except `WaitlistForm` (client, for validation and the
inline confirmation). No `getServerSession` anywhere in the group. The page must render with the
database unreachable — the same rule `/privacy` follows, and the reason `/privacy` behaves during
an incident. Target: static, cached at CloudFront, LCP under 1.8s on a 4G Android mid-range device.

**Brand:** Poppins 300/400/600 (already in `app/fonts`), tokens copied from
`OKUVU-Brand-Kit-Simple/OKUVU-Brand-Kit/01-Palette/03-design-tokens.css` into a marketing-scoped
stylesheet rather than mutating the portal's global theme. Assets under `public/brand/` — the proxy
already whitelists the `/brand/` prefix. Never re-draw the spiral closed; the honey tip dot is not
optional.

**The CI guard (`scripts/check-banned-claims.mjs`)** fails on a case-insensitive match in
`lib/marketing/copy.ts` for: `clinically`, `evidence-based`, `approved by`, `RCI`, `medical device`,
`HIPAA`, `ISO 27001`, `DPDP compliant`, `end-to-end`, `100% secure`, `24/7`, `here for you`,
`here with you`, `take a breath with me`, `always there`, `never alone`, `cure`, `diagnose`,
`treat your`, `download on google play`, `₹`, `free trial`, `cancel anytime`. Exit non-zero with the
offending line. Wire it into the existing CI before the page merges, not after: a rule that lives
only in a document has already been broken once by the time anyone reads the document.

**Accessibility:** body text ≥4.5:1 on every surface; the two dark sections use `lavender tint`
(`#EDE9FE`) on `royal night` (`#2A0F4E`), never `silver`. Form: labelled inputs (no placeholder-only
labels), `aria-describedby` pointing at the consent text, error summary at the top of the form,
focus ring `--focus-ring`. The page must be usable at 200% zoom on a 360px viewport — that is the
actual device.

---

## 9. Open questions for the product owner

1. **Is the waitlist the right conversion at all**, or should the page open with a therapist-only
   intake while the client side stays dark? The client side cannot act on a waitlist entry without
   a therapist on the other end.
2. **Who answers `admin@okuvu.in`?** The page sends two kinds of high-intent mail there. If nobody
   reads it within a week, the page is generating the exact disappointment it exists to prevent.
3. **What is the admission capacity per week?** Without a number, M1's conversion rate is not
   actionable — the page can only be judged on intent, not on outcomes.
4. **Does the apex domain carry the product name in the page title**, i.e. is SEO for "online
   therapy India" a goal at all? My recommendation: no. Ranking for treatment terms would put the
   page in front of people looking for care it cannot yet provide, and the 18+/invite-only gate
   makes that traffic unconvertible.
