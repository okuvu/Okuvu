import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { isGoogleConfigured } from '@/lib/google-config';
import { isCognitoConfigured } from '@/lib/cognito-config';
import { copy } from '@/lib/marketing/copy';
import { isPortalEntryHost } from '@/lib/marketing/host';
import WaitlistForm from './_marketing/WaitlistForm';
import LandingSignIn from './_marketing/LandingSignIn';

export const metadata: Metadata = {
  title: copy.meta.title,
  description: copy.meta.description,
  openGraph: {
    title: copy.meta.ogTitle,
    description: copy.meta.ogDescription,
    type: 'website',
  },
};

// The page reads the session only to decide whether the nav says "Sign in" or
// "Open portal". Rendering it per request keeps that honest behind a proxy
// that does not attach a session (this route is in PUBLIC_PATHS).
export const dynamic = 'force-dynamic';

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <img src="/brand/okuvu-mark-dark.svg" alt="" width={26} height={26} aria-hidden="true" />
      <span
        className="text-[15px] text-lavender-tint"
        style={{ fontFamily: 'var(--font-wordmark)', letterSpacing: '0.14em' }}
      >
        OKUVU
      </span>
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
      {children}
    </span>
  );
}

export default async function LandingPage() {
  // portal.okuvu.in keeps behaving as the app entry point it has always been,
  // so a therapist's existing bookmark does not land on marketing copy.
  const requestHeaders = await headers();
  if (isPortalEntryHost(requestHeaders.get('host'))) {
    redirect('/dashboard');
  }

  const session = await auth();
  const signedIn = Boolean(session?.user);
  const googleOn = isGoogleConfigured();
  const cognitoOn = isCognitoConfigured();

  return (
    <div className="min-h-screen bg-oat">
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 border-b border-white/10 backdrop-blur"
        style={{ background: 'linear-gradient(135deg, #2A0F4E 0%, #3A1A66 100%)' }}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
          <Link href="/" aria-label="Okuvu home">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-7 md:flex" aria-label="Sections">
            <a href="#how-it-works" className="text-sm text-lavender-tint/80 transition-colors hover:text-white">
              {copy.nav.howItWorks}
            </a>
            <a href="#who-sees-what" className="text-sm text-lavender-tint/80 transition-colors hover:text-white">
              {copy.nav.whoSeesWhat}
            </a>
            <a href="#for-therapists" className="text-sm text-lavender-tint/80 transition-colors hover:text-white">
              {copy.nav.forTherapists}
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href={signedIn ? '/dashboard' : '/auth'}
              className="rounded-full bg-honey px-4 py-2 text-sm font-semibold text-royal-night transition-colors hover:bg-honey-bright"
            >
              {signedIn ? copy.nav.openPortal : copy.nav.signIn}
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden px-4 pb-20 pt-16 md:px-8 md:pb-28 md:pt-24"
        style={{
          background:
            'radial-gradient(120% 90% at 15% 0%, #4A2380 0%, #2A0F4E 55%, #1E0B39 100%)',
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 top-10 h-[420px] w-[420px] rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, #A78BFA 0%, transparent 70%)' }}
        />
        <div className="relative mx-auto max-w-6xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-orchid-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-honey" aria-hidden="true" />
            {copy.hero.eyebrow}
          </span>
          <h1 className="mt-7 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-white md:text-6xl">
            {copy.hero.h1}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-lavender-tint/85 md:text-lg">
            {copy.hero.sub}
          </p>
          <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <a
              href="#waitlist"
              className="rounded-full bg-honey px-6 py-3 text-sm font-semibold text-royal-night transition-colors hover:bg-honey-bright"
            >
              {copy.hero.ctaPrimary}
            </a>
            <a
              href="#who-sees-what"
              className="text-sm font-medium text-lavender-tint underline decoration-white/30 underline-offset-4 transition-colors hover:text-white"
            >
              {copy.hero.ctaSecondary}
            </a>
          </div>
          <p className="mt-6 max-w-xl text-[13px] leading-relaxed text-lavender-tint/60">
            {copy.hero.gate}
          </p>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────── */}
      <section id="how-it-works" className="scroll-mt-20 bg-oat px-4 py-20 md:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionLabel>How it works</SectionLabel>
          <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight text-charcoal-ink md:text-3xl">
            {copy.how.h2}
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-soft">{copy.how.sub}</p>

          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {copy.how.steps.map((step, i) => (
              <li
                key={step.title}
                className="relative rounded-2xl border border-hairline bg-oat-elevated p-6"
                style={{ boxShadow: 'var(--shadow-sm)' }}
              >
                <span className="text-sm font-semibold text-honey-deep" aria-hidden="true">
                  0{i + 1}
                </span>
                <h3 className="mt-3 text-base font-semibold text-charcoal-ink">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── What's in it ────────────────────────────────────────────── */}
      <section className="border-y border-hairline bg-lavender-wash/40 px-4 py-20 md:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionLabel>Inside the app</SectionLabel>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-charcoal-ink md:text-3xl">
            {copy.benefits.h2}
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-soft">{copy.benefits.sub}</p>

          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {copy.benefits.cards.map((card, i) => (
              <li
                key={card.title}
                className={`rounded-2xl border p-6 ${
                  i === 2 ? 'border-sage/30 bg-sage-tint' : 'border-hairline bg-oat-elevated'
                } ${i === 3 ? 'md:col-span-2' : ''}`}
                style={{ boxShadow: 'var(--shadow-sm)' }}
              >
                <h3 className="text-base font-semibold text-charcoal-ink">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{card.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Who sees what ──────────────────────────────────────────── */}
      <section id="who-sees-what" className="scroll-mt-20 px-4 py-20 md:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionLabel>Privacy, concretely</SectionLabel>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-charcoal-ink md:text-3xl">
            {copy.who.h2}
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-soft">{copy.who.sub}</p>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-hairline bg-oat-elevated p-7">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-sage-deep">
                {copy.who.leftTitle}
              </h3>
              <ul className="mt-5 space-y-3">
                {copy.who.left.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed text-charcoal-ink">
                    <span aria-hidden="true" className="mt-0.5 text-sage-deep">
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-royal-night p-7">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-orchid-soft">
                {copy.who.rightTitle}
              </h3>
              <ul className="mt-5 space-y-3">
                {copy.who.right.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed text-lavender-tint">
                    <span aria-hidden="true" className="mt-0.5 text-honey">
                      ✕
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-6 text-sm text-ink-soft">
            {copy.who.note}{' '}
            <Link href="/privacy" className="font-medium text-violet underline underline-offset-4">
              {copy.who.link}
            </Link>
          </p>
        </div>
      </section>

      {/* ── What this isn't ────────────────────────────────────────── */}
      <section className="border-y border-hairline bg-oat-elevated px-4 py-20 md:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-semibold tracking-tight text-charcoal-ink md:text-3xl">
            {copy.isnt.h2}
          </h2>
          <ul className="mt-10 grid gap-8 md:grid-cols-2">
            {copy.isnt.items.map((item, i) => (
              <li key={item.title}>
                <h3 className="text-base font-semibold text-charcoal-ink">{item.title}</h3>
                <p
                  className={`mt-2 text-sm leading-relaxed ${
                    i === 1 ? 'font-semibold text-honey-deep' : 'text-ink-soft'
                  }`}
                >
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Data ───────────────────────────────────────────────────── */}
      <section className="px-4 py-20 md:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-semibold tracking-tight text-charcoal-ink md:text-3xl">
            {copy.data.h2}
          </h2>
          <ol className="mt-8 grid max-w-4xl gap-4 md:grid-cols-2">
            {copy.data.items.map((item, i) => (
              <li key={item} className="flex gap-4 rounded-xl border border-hairline bg-oat-elevated p-5">
                <span className="text-xs font-semibold text-honey-deep" aria-hidden="true">
                  0{i + 1}
                </span>
                <span className="text-sm leading-relaxed text-charcoal-ink">{item}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-ink-soft">
            <Link href="/privacy" className="font-medium text-violet underline underline-offset-4">
              {copy.data.link}
            </Link>{' '}
            — {copy.data.linkNote}
          </p>
        </div>
      </section>

      {/* ── For therapists + sign in ───────────────────────────────── */}
      <section id="for-therapists" className="scroll-mt-20 px-4 pb-20 md:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-2 md:items-start">
          <div>
            <SectionLabel>{copy.nav.forTherapists}</SectionLabel>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-charcoal-ink md:text-3xl">
              {copy.forTherapists.h2}
            </h2>
            <p className="mt-5 text-base leading-relaxed text-ink-soft">{copy.forTherapists.body1}</p>
            <p className="mt-4 text-base leading-relaxed text-ink-soft">{copy.forTherapists.body2}</p>
            <a
              href="mailto:admin@okuvu.in?subject=Okuvu%20for%20my%20practice"
              className="mt-7 inline-block rounded-full border border-violet px-5 py-2.5 text-sm font-semibold text-violet transition-colors hover:bg-lavender-tint"
            >
              {copy.forTherapists.mailto}
            </a>
            <p className="mt-3 text-xs text-ink-soft">{copy.forTherapists.micro}</p>
          </div>

          <div
            className="rounded-2xl border border-hairline bg-oat-elevated p-7"
            style={{ boxShadow: 'var(--shadow-md)' }}
          >
            <h3 className="text-base font-semibold text-charcoal-ink">
              {copy.forTherapists.signInTitle}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              {copy.forTherapists.signInBody}
            </p>
            <div className="mt-6">
              <LandingSignIn googleConfigured={googleOn} cognitoConfigured={cognitoOn} />
            </div>
            <p className="mt-5 border-t border-hairline pt-4 text-xs text-ink-soft">
              {signedIn ? 'You are already signed in.' : 'Administrator: admin@okuvu.in'}
            </p>
          </div>
        </div>
      </section>

      {/* ── Waitlist ───────────────────────────────────────────────── */}
      <section id="waitlist" className="scroll-mt-20 px-4 pb-24 md:px-8">
        <div
          className="mx-auto max-w-3xl rounded-3xl p-8 md:p-12"
          style={{ background: 'linear-gradient(135deg, #2A0F4E 0%, #4A2380 100%)' }}
        >
          <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
            {copy.wait.h2}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-lavender-tint/80">{copy.wait.sub}</p>
          <p className="mt-4 text-sm leading-relaxed text-lavender-tint/70">{copy.wait.body}</p>
          <div className="mt-8">
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-hairline bg-oat px-4 py-12 md:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">{copy.footer.line}</p>
          <p className="mt-3 text-sm font-medium text-honey-deep">{copy.crisis.line}</p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <Link href="/privacy" className="text-violet underline underline-offset-4">
              {copy.footer.privacy}
            </Link>
            <a href="#for-therapists" className="text-violet underline underline-offset-4">
              {copy.footer.therapists}
            </a>
            <a href="mailto:admin@okuvu.in" className="text-violet underline underline-offset-4">
              {copy.footer.contact}
            </a>
          </div>
          <p className="mt-8 max-w-2xl text-xs leading-relaxed text-ink-soft">
            {copy.footer.disclaimer}
          </p>
          <p className="mt-3 text-xs text-ink-soft">{copy.footer.copyright}</p>
        </div>
      </footer>
    </div>
  );
}
