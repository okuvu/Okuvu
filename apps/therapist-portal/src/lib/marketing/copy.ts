/**
 * Every user-visible string on the landing page.
 *
 * Source of truth is docs/product/landing-page-copy.md, which marks each line
 * SHIP or BLOCKED. Only SHIP lines are here. The blocked ones — the full
 * crisis block, anything companion-flavoured, the Play Store badge, prices —
 * are absent on purpose: a missing string is recoverable, an unsigned one is
 * a clinical or legal claim nobody approved.
 *
 * `copy.test.ts` fails the build if a banned claim reappears in this file.
 * Keep string literals out of the JSX so that test can actually see them.
 */

export const meta = {
  title: 'Okuvu — the days between sessions',
  description:
    'Okuvu is something to talk to between therapy appointments. The therapist who took you on can read how the week went. Invite-only while in beta. For adults 18 and over in India.',
  ogTitle: 'Therapy is one hour a week. This is for the other 167.',
  ogDescription:
    'A place to talk between sessions, with the therapist who took you on at the other end.',
} as const;

export const nav = {
  howItWorks: 'How it works',
  whoSeesWhat: 'Who sees what',
  forTherapists: 'For therapists',
  signIn: 'Sign in',
  openPortal: 'Open portal',
  cta: 'Join the waitlist',
} as const;

export const hero = {
  eyebrow: 'In beta · places open by therapist invitation',
  h1: 'Therapy is one hour a week. This is for the other 167.',
  sub: 'Okuvu is something to talk to between sessions, and the therapist who took you on can read how the week went — so the next appointment starts where the last one ended.',
  gate: "You can't sign up on your own. A therapist adds you first. That's the point.",
  ctaPrimary: 'Join the waitlist',
  ctaSecondary: 'See who sees what',
} as const;

export const how = {
  h2: "Three steps, and the first one isn't yours.",
  sub: 'Okuvu works the way care already works: someone qualified takes you on, and then you do the week.',
  steps: [
    {
      title: 'A therapist adds you',
      body: "Okuvu isn't a download-and-go app. A licensed therapist takes you onto their caseload and sends you an invite code. No code, no account.",
    },
    {
      title: 'You talk, most days',
      body: "Type what the day was actually like — the argument, the flat afternoon, the thing you didn't say in the session. Okuvu carries context forward, so you're not re-explaining yourself every time.",
    },
    {
      title: 'Your therapist reads the week before you meet',
      body: 'Summaries of your conversations reach their portal, alongside your mood check-ins. They see a pattern, not a transcript.',
    },
  ],
} as const;

export const benefits = {
  h2: "What's actually in it.",
  sub: 'Five things, all of them working today. Nothing on this page is on a roadmap.',
  cards: [
    {
      title: "Talk when there's no appointment",
      body: '2am, a train, the ten minutes after a bad call. Type it instead of holding it until Thursday.',
    },
    {
      title: 'A mood check-in that builds a line',
      body: 'One tap a day. After a few weeks you can see the shape of the month instead of guessing at it.',
    },
    {
      title: 'A journal nobody else reads',
      body: 'Journal entries are yours. They are not shown to your therapist, and they are not part of the summary.',
    },
    {
      title: 'Five two-minute exercises',
      body: 'Breathing and grounding you can open on your own, or that your therapist can set for the week with a reminder attached.',
    },
    {
      title: 'The admin of care, in one place',
      body: 'Appointments, homework and reminders, so nothing depends on you remembering it at the right moment.',
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
    'Your raw messages, unless you switch chat access on',
    'Anything you write after you switch it off',
  ],
  note: "Every time a therapist opens your record, it's written into an access log.",
  link: 'The full detail is in the privacy policy.',
} as const;

export const isnt = {
  h2: "What this isn't.",
  items: [
    {
      title: 'Not a replacement for your therapist',
      body: "Okuvu doesn't diagnose, prescribe or treat anything. It's the space between appointments, not the appointment.",
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

export const crisis = {
  // The only crisis copy we are allowed to author. Everything else is supplied
  // by the clinical authority (decision record item 1, 30 Oct 2026) — the
  // expanded block is deliberately not written here.
  line: 'If someone is in danger right now, call 112.',
} as const;

export const data = {
  h2: 'Your data, in four lines.',
  items: [
    'Stored in AWS Mumbai, in India.',
    'No third-party analytics or crash-reporting SDK in the app.',
    "Your voice stays on your phone — dictation uses your phone's own recogniser, and no audio is sent to us.",
    'You can delete your account from inside the app, under Settings → Privacy & Data.',
  ],
  link: 'Read the full privacy policy',
  linkNote: "It lists what we don't claim, too. There's a section for that.",
} as const;

export const wait = {
  h2: 'If you want a place, leave an email.',
  sub: "We're not selling anything on this page yet. Places open when a therapist has room on their caseload, and we'd rather say that than take a payment we can't service.",
  body: "Leave an email and we'll write to you once, when a therapist has a place. If you already have a therapist who might use Okuvu, say so in the form — that's the fastest route in.",
  emailLabel: 'Email',
  emailPlaceholder: 'you@example.com',
  submit: 'Join the waitlist',
  micro: 'One email when a place opens. Not a newsletter.',
  successTitle: "You're on the list.",
  successBody:
    "We'll email you when a therapist has room. If you'd rather not wait, write to admin@okuvu.in.",
  errorEmail: "That email doesn't look complete.",
  errorNetwork: "That didn't go through. Try again, or write to admin@okuvu.in.",
  consentPrefix: 'I agree that Okuvu may email me once when a place opens, and not for anything else.',
} as const;

export const forTherapists = {
  h2: "If you're a therapist, this is the part that matters.",
  body1:
    "Your caseload in one place: who's active, what they did between sessions, what you set for them. Summaries are waiting before the appointment rather than reconstructed after it.",
  body2: 'You decide whether you see raw messages — that switch is the client\'s, and it starts off.',
  signInTitle: 'Therapist sign in',
  signInBody:
    'Accounts are created by an Okuvu administrator. There is no signup here — if your address was added to a caseload, sign in with the same address and you will land in the portal.',
  signInCta: 'Continue with Google',
  signInEmailCta: 'Continue with email & password',
  signInUnavailable:
    'Sign-in is not configured on this deployment yet. Write to admin@okuvu.in and we will set your account up directly.',
  mailto: 'Write to admin@okuvu.in',
  micro: 'Onboarding is a 45-minute walkthrough with a person, not a signup form.',
} as const;

export const footer = {
  line: 'Okuvu is a wellbeing app for adults in India, 18+. It is not therapy and it is not an emergency service.',
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
  how,
  benefits,
  who,
  isnt,
  crisis,
  data,
  wait,
  forTherapists,
  footer,
} as const;
