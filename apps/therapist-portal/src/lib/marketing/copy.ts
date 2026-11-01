/**
 * Every user-visible string on the landing page.
 *
 * Source of truth is docs/product/landing-page-copy.md, which marks each line
 * SHIP or BLOCKED. Copy revision v1 (1 Nov 2026) is applied on top of it; where
 * the revision asks for a line that no one has signed, the line is absent, not
 * paraphrased. An absent string is recoverable. An unsigned clinical claim is
 * not.
 *
 * `__tests__/marketing-copy.test.ts` fails the build if a banned claim
 * reappears in this file. Keep string literals out of the JSX so that test can
 * actually see them.
 */

export const meta = {
  // 1. Meta — copy revision v1 §1. The old OG line ("with the therapist who
  // took you on at the other end") implied a person reading live. Now it says
  // what it is.
  title: 'Okuvu — an AI companion for the days between therapy',
  description:
    'Therapy is one hour a week. Okuvu is an AI companion for the other 167, and the therapist who took you on reads a summary before your next session. Invite-only beta. Adults 18+ in India.',
  ogTitle: 'Therapy is one hour a week. This is for the other 167.',
  ogDescription:
    'An AI to talk to between sessions. Your therapist reads the summary before you meet, not while you type.',
} as const;

export const nav = {
  howItWorks: 'How it works',
  whoSeesWhat: 'Who sees what',
  forTherapists: 'For therapists',
  signIn: 'Sign in',
  openPortal: 'Open portal',
  cta: 'Join the waitlist',
  // The colour-theme switch. Names the state it is in and the state a click
  // moves to, so it is useful rather than "toggle dark mode" guesswork.
  theme: {
    system: 'Colour theme: follows your device. Switch to light.',
    light: 'Colour theme: light. Switch to dark.',
    dark: 'Colour theme: dark. Switch to follow your device.',
  },
} as const;

export const hero = {
  // Brand line, and the header tagline beside the logo (§1 of the revision
  // keeps it there). Not a clinical claim: it makes no promise about care.
  eyebrowTop: 'You are always becoming.',
  // §2 — the eyebrow now declares what Okuvu is, before the H1 says when it
  // is for.
  eyebrow: 'AI companion · in beta · places open by therapist invitation',
  h1: 'Therapy is one hour a week. This is for the other 167.',
  sub: 'Okuvu is an AI you can talk to between sessions. Before your next appointment, the therapist who took you on reads a summary of how your week went, so you start where you actually are, not from the beginning.',
  gate: "You can't sign up on your own. A therapist adds you first. That's the point.",
  // §2 — therapist-first while access is therapist-gated. Amber stays on the
  // waitlist alone (nav + form), so the primary here is the indigo pill.
  ctaPrimary: "I'm a therapist — book a walkthrough",
  ctaSecondary: 'I have a therapist — join the waitlist',
} as const;

/**
 * The story spine (copy revision v1 §3). Sits directly under the hero: the
 * tagline was a header ornament, and here it becomes the argument of the page.
 * Wording is the revision's, verbatim.
 */
export const becoming = {
  eyebrow: 'You are always becoming',
  h2: 'Nobody changes in the therapy room.',
  body: [
    'You change on the walk home. In the argument you handled a little differently. On the flat Tuesday you got through anyway.',
    "Therapy gives you the map. The becoming happens in the 167 hours in between, mostly when no one is watching. Those are also the hours that slip away: the good day blurs into the bad week, and by Thursday you're explaining yourself from scratch.",
    "Okuvu is built for those hours. Somewhere to put the day down when it happens, so what you worked through doesn't go missing, and your next session picks up from where you really are.",
  ],
  close: 'You are always becoming. Okuvu is where that becoming lives.',
} as const;

export const how = {
  h2: "Three steps, and the first one isn't yours.",
  sub: 'Okuvu works the way care already works: someone qualified takes you on, and then you do the week.',
  steps: [
    {
      title: 'A therapist adds you',
      body: "Okuvu isn't a download-and-go app. A licensed therapist has to register you first, with the email you sign in with. No therapist, no account.",
    },
    {
      title: 'You talk to Okuvu, most days',
      body: "Type what the day was actually like: the argument, the flat afternoon, the thing you didn't say in the session. Okuvu's AI replies, and it remembers what you've told it before, so you're not re-explaining yourself every time.",
    },
    {
      title: 'Your therapist reads the week before you meet',
      body: "Summaries of your conversations reach their portal, alongside your mood check-ins. They see patterns, not a transcript. They don't read along while you type; they read before your next session.",
    },
  ],
  // §4 closing line under the steps.
  close: "Session to session, the pieces start to join up. That's what becoming looks like up close.",
  // §4's P0 safety line about S3/S4 conversations is deliberately NOT here.
  // The revision offers two sentences, gated on [CONFIRM], and neither is true
  // of this build: crisis turns ARE summarised (worker summary prompt mandates
  // safety_flags.crisis_language_detected plus verbatim quotes) and there is no
  // separate real-time therapist alert anywhere (no notification consumer
  // exists — see the Turn schema comment in the API). Publishing either option
  // would put a false safety claim on the page. See docs/product/
  // landing-page-copy.md §4a for the finding and the wording awaiting sign-off.
} as const;

/**
 * §5 — "Yes, it's AI". New section, P0, placed directly after "How it works".
 *
 * Every line is checkable against this build: A1 classifies safety before A2
 * speaks and S3/S4 route to the deterministic crisis/grounding paths rather
 * than a chat reply; the A2 system prompt forbids advice, diagnosis and
 * outcome promises; limits are written and re-approved by the clinical lead
 * (docs/00a-clinical-authority.md, sign-off 31 Oct 2026).
 */
export const ai = {
  eyebrow: "Yes, it's AI",
  h2: "Okuvu is AI. Here's exactly what that means.",
  lead: "It won't pretend to be a person, and it won't pretend to be your therapist.",
  points: [
    {
      title: "It's not a person.",
      body: "When you talk to Okuvu, you're talking to an AI model. Not your therapist, and not someone on our team.",
    },
    {
      title: "It listens; it doesn't tell you what to do.",
      body: "It reflects back what you're feeling and helps you slow down with breathing and grounding. It won't give advice, diagnose you, or promise you'll feel better.",
    },
    {
      title: 'A psychologist set its limits.',
      body: 'How Okuvu is allowed to respond was written and approved by a clinical psychologist, and it is re-checked before every release.',
    },
    {
      title: 'Every message is checked for safety first.',
      body: 'Before Okuvu replies, separate safety checks look for signs you might be in danger. If they find them, Okuvu stops the chat and shows crisis support instead.',
    },
    {
      title: 'It can get things wrong.',
      body: 'AI misreads people sometimes. If a reply feels off, say so in the chat, and bring it to your therapist.',
    },
    {
      title: "Your therapist isn't reading live.",
      body: 'They read summaries before your session. If you need someone right now, see the numbers at the bottom of this page.',
    },
  ],
} as const;

export const benefits = {
  h2: "What's actually in it.",
  // §6 — "working today" became "working in the beta today". The absolute
  // claim ("nothing here is on a roadmap") is gone with it.
  sub: 'Five things, all working in the beta today.',
  cards: [
    {
      title: "Talk when there's no appointment",
      body: '2am, a train, the ten minutes after a bad call. Type it to Okuvu instead of holding it until Thursday.',
    },
    {
      title: 'A mood check-in that draws a line',
      body: "One tap a day. After a few weeks you can see the shape of your month, a record of where you've been, even on the weeks it's hard to tell.",
    },
    {
      title: 'A journal nobody else reads',
      // "not read by the AI" is a claim, not a flourish: no code path passes a
      // JournalEntry row to a model (only routes/journal.ts and account
      // deletion read the table), so it is stated plainly rather than hedged.
      body: 'Some becoming is just for you. Journal entries are not shown to your therapist, not read by the AI, and not part of any summary.',
    },
    {
      title: 'Five two-minute exercises',
      body: 'Breathing and grounding you can open on your own, or that your therapist can set for the week with a reminder attached.',
    },
    {
      title: 'Homework and reminders, in one place',
      body: "Appointments, the practice your therapist sets, and a nudge when it's due, so nothing depends on you remembering at the right moment.",
    },
  ],
} as const;

export const who = {
  h2: 'Who sees what.',
  sub: 'Not a summary of our privacy policy. The actual switches, as they exist in the app.',
  leftTitle: 'Your therapist sees',
  left: [
    'Summaries of your conversations',
    "Your mood check-ins, if you've agreed to share them",
    'The homework and reminders they set for you',
    'The notes they write about you',
  ],
  rightTitle: "Your therapist doesn't see",
  right: [
    'Your journal, ever',
    'Your chats as they happen. They read summaries before your session.',
    'Your raw messages, unless you switch chat access on',
    'Anything you write after you switch it off',
  ],
  // §7 — the AI's access, counted separately from the therapist's.
  aiTitle: "Okuvu's AI sees",
  ai: [
    'Your chat messages, so it can reply',
    "Context it has kept from earlier chats, so you don't repeat yourself",
  ],
  note: "Every time a therapist opens your record, it's written into an access log.",
  link: 'The full detail is in the privacy policy.',
} as const;

export const isnt = {
  h2: "What this isn't.",
  items: [
    // §8 — the first item is new, and it is the one that must never be
    // softened: the product is software.
    {
      title: 'Not a person',
      body: 'Okuvu is AI. It can be warm, but it is software, and it can get things wrong.',
    },
    {
      title: 'Not a replacement for your therapist',
      body: "Okuvu doesn't diagnose, prescribe or treat anything. It's AI for the space between appointments, not the appointment.",
    },
    {
      title: 'Not an emergency service',
      body: 'If someone is in danger right now, Okuvu cannot send help. Call 112.',
    },
    {
      title: 'Not for under-18s',
      body: "Okuvu is for adults, 18 and over. We don't take accounts for children, and there is no parent or guardian sign-up.",
    },
    {
      title: 'Not finished',
      body: "This is a beta with a small number of therapists. Things break. We'd rather say so here than after you've trusted us with something.",
    },
  ],
} as const;

/**
 * The crisis numbers — §10 and §14 of the revision.
 *
 * Two numbers, both from the block the clinical lead signed on 31 Oct 2026
 * (block final 1 Nov 2026; see the A9-post prompt and docs/CLINICAL-*). Nothing
 * else is added: the signed set has five entries, the page deliberately shows
 * the two a visitor can act on from a marketing page, and the wording keeps
 * her phrasing ("free, 24 hours") rather than inventing a variant.
 *
 * This is the only crisis copy the page may carry, and no decorative layer is
 * ever placed over it — see `.mk-urgent` in marketing.css.
 */
export const crisis = {
  line: 'If someone is in danger right now, call 112.',
  helpline: 'To talk to someone now, call Tele-MANAS on 14416.',
  /** Rendered on its own, above the footer (§10). */
  h2: "If it's urgent",
  lead: "Okuvu can't send help, and your therapist isn't watching your chats live.",
  items: [
    {
      title: 'Someone is in danger right now',
      lead: 'Call',
      number: '112',
      note: '',
    },
    {
      title: 'You need to talk to someone now',
      lead: 'Tele-MANAS, the national mental health helpline,',
      number: '14416',
      note: '(free, 24 hours).',
    },
  ],
} as const;

export const data = {
  // The revision asked for "five lines" but lists four; the heading counts what
  // is under it. If a fifth line is coming, it belongs here and the heading
  // changes with it.
  h2: 'Your data, in four lines.',
  items: [
    'Stored in AWS Mumbai, in India.',
    'No third-party analytics or crash-reporting SDK in the app.',
    "We never receive your voice. Dictation uses your phone's own speech recogniser and only the text reaches Okuvu.",
    'You can delete your account from inside the app, under Settings → Privacy & Data.',
  ],
  link: 'Read the full privacy policy',
  linkNote: "It lists what we don't claim, too. There's a section for that.",
} as const;

/**
 * §12 — Who's behind it. P1.
 *
 * The disclaimer line that used to sit in the footer alone now sits beside
 * this, because "built by a company, with a clinical lead" is exactly the
 * claim a certification badge would be used to support.
 */
export const behind = {
  h2: "Who's behind it",
  body: 'Okuvu is built by Suvok Systems LLP. Its clinical lead is a clinical psychologist who writes and approves how the AI is allowed to respond, and who can stop any release.',
  disclaimer:
    'We hold no clinical certification, audit attestation or compliance badge, and this page claims none.',
} as const;

/**
 * §13 — two forms, one card. Clients and therapists are asked different
 * things because they need different things from us; a single email box made
 * the therapist enquiry indistinguishable from the client one.
 */
export const wait = {
  h2: 'If you want a place, leave an email.',
  sub: "We're not selling anything on this page yet. Places open when a therapist has room on their caseload, and we'd rather say that than take a payment we can't service.",
  body: "Leave an email and we'll write to you once, when a therapist has a place. If you already have a therapist who might use Okuvu, say so in the form — that's the fastest route in.",
  tabClients: 'For clients',
  tabTherapists: 'For therapists',
  emailLabel: 'Email',
  emailPlaceholder: 'you@example.com',
  nameLabel: 'Name',
  namePlaceholder: 'Your name',
  practiceLabel: 'Practice or organisation',
  practicePlaceholder: 'The name you practise under',
  caseloadLabel: 'Rough caseload size',
  caseloadPlaceholder: 'e.g. 12 clients',
  hasTherapistLabel: 'Do you already have a therapist? (optional)',
  hasTherapistYes: 'Yes',
  hasTherapistNo: 'No',
  hasTherapistUnsure: 'Prefer not to say',
  submit: 'Join the waitlist',
  micro: 'One email when a place opens. Not a newsletter.',
  successTitle: "You're on the list.",
  successBody:
    "We'll email you when a therapist has room. If you'd rather not wait, write to admin@okuvu.in.",
  successTherapistTitle: "We'll be in touch.",
  successTherapistBody:
    'A person reads this, not a queue. We will write to you about a walkthrough, usually within a few days.',
  errorEmail: "That email doesn't look complete.",
  errorName: 'We need a name to write to you by.',
  errorConsent: 'We need this box ticked before we can keep your details.',
  errorNetwork: "That didn't go through. Try again, or write to admin@okuvu.in.",
  consentPrefix: 'I agree that Okuvu may email me once when a place opens, and not for anything else.',
  consentPrefixTherapist: 'I agree that Okuvu may email me about a walkthrough, and not for anything else.',
} as const;

export const forTherapists = {
  h2: 'For therapists: the week, before the session.',
  body1:
    "Your caseload in one place: who's active, what they did between sessions, what you set for them. Summaries are ready before the appointment, not reconstructed after it.",
  body2:
    "Your clients talk to an AI companion whose limits were set by a clinical psychologist. It doesn't diagnose, advise or reframe. It reflects, grounds and holds the space until you see them.",
  body3: "You decide whether you see raw messages — that switch is the client's, and it starts off.",
  signInTitle: 'Therapist sign in',
  signInBody:
    'Accounts are created by an Okuvu administrator. There is no signup here — if your address was added to a caseload, sign in with the same address and you will land in the portal.',
  signInCta: 'Continue with Google',
  signInEmailCta: 'Continue with email & password',
  signInUnavailable:
    'Sign-in is not configured on this deployment yet. Write to admin@okuvu.in and we will set your account up directly.',
  walkthrough: 'Book a 20-minute walkthrough',
  mailto: 'Write to admin@okuvu.in',
  micro: 'A walkthrough is 20 minutes with a person, not a signup form.',
} as const;

/**
 * Alt text, captions and image labels (redesign, 1 Nov 2026).
 *
 * These describe pictures, not the product, so they are new strings rather
 * than edits to signed copy. Two rules held here:
 *   - every illustration is called an illustration, never a screenshot —
 *     real screenshots do not exist yet and the page must not imply one;
 *   - no alt text invents data ("42 % calmer") or phrases a feature as a
 *     promise. It says what is drawn.
 */
export const art = {
  illustration: 'Illustration',
  breatheLabel: 'Breathe with it',
  screenAlt: {
    chat: 'Illustration of a phone showing a conversation with Okuvu, drawn as plain message bubbles.',
    mood: 'Illustration of the mood check-in, drawn as a rising line across a month.',
    journal: 'Illustration of the private journal, drawn as a page with ruled lines.',
    breathing: 'Illustration of a breathing exercise, drawn as two concentric rings.',
    appointments: 'Illustration of the appointments list, drawn as dated cards.',
    portal:
      'Illustration of the therapist portal, drawn as a caseload list beside a summary panel.',
  },
  photoAlt: 'Morning light through a window and a pale curtain, falling across a soft wall.',
  wordmark: 'Okuvu',
} as const;

export const footer = {
  line: 'Okuvu is an AI wellbeing companion for adults in India, 18+. It is not therapy, not a person, and not an emergency service.',
  // The sign-off is the last beat of the story spine (§14).
  signoff: 'You are always becoming. Okuvu is where that becoming lives.',
  privacy: 'Privacy policy',
  therapists: 'For therapists',
  contact: 'admin@okuvu.in',
  disclaimer:
    'We hold no clinical certification, audit attestation or compliance badge, and this page claims none.',
  copyright: '© 2026 Okuvu',
} as const;

export const copy = {
  meta,
  nav,
  hero,
  becoming,
  how,
  ai,
  benefits,
  who,
  isnt,
  crisis,
  data,
  behind,
  wait,
  forTherapists,
  art,
  footer,
} as const;
