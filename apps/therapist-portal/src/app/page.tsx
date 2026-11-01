import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Eye, EyeOff, MapPin, ShieldOff, Smartphone, Trash2 } from 'lucide-react';
import { auth } from '@/lib/auth';
import { isGoogleConfigured } from '@/lib/google-config';
import { isCognitoConfigured } from '@/lib/cognito-config';
import { copy } from '@/lib/marketing/copy';
import { isPortalEntryHost } from '@/lib/marketing/host';
import WaitlistForm from './_marketing/WaitlistForm';
import LandingSignIn from './_marketing/LandingSignIn';
import MarketingNav from './_marketing/MarketingNav';
import MarketingMotion from './_marketing/MarketingMotion';
import ScreenSlot from './_marketing/ScreenSlot';
import {
  MarkWatermark,
  ChatArt,
  HeroMark,
  HeroWaves,
  InviteArt,
  MoodSparkline,
  Squiggle,
  TopoContours,
  WeekArt,
} from './_marketing/Artwork';
import './_marketing/marketing.css';

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="mk-label">{children}</span>;
}

/** The four "your data" rows, in brief order, with the icon for each. */
const DATA_ICONS = [MapPin, ShieldOff, Smartphone, Trash2] as const;

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
    <div className="mk-root">
      <MarketingMotion />
      <MarketingNav signedIn={signedIn} />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="mk-hero">
        <div className="mk-wrap mk-hero-grid">
          <div>
            <span className="mk-eyebrow-top">{copy.hero.eyebrowTop}</span>
            <p className="mk-badge">
              <span className="mk-badge-dot" aria-hidden="true" />
              {copy.hero.eyebrow}
            </p>
            <h1 className="mk-display mk-h1">{copy.hero.h1}</h1>
            <p className="mk-lede mk-hero-lede">{copy.hero.sub}</p>
            <div className="mk-cta-row">
              <a href="#waitlist" className="mk-pill mk-pill--amber">
                {copy.hero.ctaPrimary}
              </a>
              <a href="#who-sees-what" className="mk-link-arrow">
                {copy.hero.ctaSecondary}
              </a>
            </div>
            <p className="mk-gate">{copy.hero.gate}</p>
          </div>

          <div className="mk-hero-art">
            <HeroMark />
          </div>
        </div>
        <HeroWaves />
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="mk-sec mk-sec--stone" style={{ scrollMarginTop: '80px' }}>
        <div data-anim>
          <TopoContours />
        </div>
        <div className="mk-wrap">
          <div className="mk-how-head">
            <SectionLabel>{copy.nav.howItWorks}</SectionLabel>
            <h2 className="mk-display mk-h2">{copy.how.h2}</h2>
            <p className="mk-body">{copy.how.sub}</p>
          </div>

          <ol className="mk-cards">
            {copy.how.steps.map((step, i) => (
              <li key={step.title} className="mk-card">
                <span className="mk-card-num" aria-hidden="true">
                  0{i + 1}
                </span>
                {i === 0 && <InviteArt />}
                {i === 1 && <ChatArt />}
                {i === 2 && <WeekArt />}
                <h3 className="mk-h3">{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Squiggle />

      {/* ── Inside the app ───────────────────────────────────────────── */}
      <section className="mk-sec mk-sec--lavender">
        <div className="mk-wrap">
          <div className="mk-how-head">
            <SectionLabel>Inside the app</SectionLabel>
            <h2 className="mk-display mk-h2">{copy.benefits.h2}</h2>
            <p className="mk-body">{copy.benefits.sub}</p>
          </div>

          <ul className="mk-bento">
            {copy.benefits.cards.map((card, i) => {
              if (i === 0) {
                return (
                  <li key={card.title} className="mk-tile mk-tile--tall">
                    <h3 className="mk-h3">{card.title}</h3>
                    <p>{card.body}</p>
                    <div className="mk-tile-media">
                      <ScreenSlot name="chat" />
                    </div>
                  </li>
                );
              }
              if (i === 1) {
                return (
                  <li key={card.title} className="mk-tile mk-tile--half">
                    <h3 className="mk-h3">{card.title}</h3>
                    <p>{card.body}</p>
                    <div className="mk-spark-wrap" data-draw>
                      <MoodSparkline />
                      <span className="mk-figcap">{copy.art.illustration}</span>
                    </div>
                  </li>
                );
              }
              if (i === 2) {
                return (
                  <li key={card.title} className="mk-tile mk-tile--half">
                    <h3 className="mk-h3">{card.title}</h3>
                    <p>{card.body}</p>
                    <div className="mk-tile-media">
                      <ScreenSlot name="journal" />
                    </div>
                  </li>
                );
              }
              if (i === 3) {
                return (
                  <li key={card.title} className="mk-tile mk-tile--half">
                    <h3 className="mk-h3">{card.title}</h3>
                    <p>{card.body}</p>
                    <div className="mk-orb-wrap">
                      <span className="mk-orb" aria-hidden="true" data-anim />
                      <span className="mk-orb-label">{copy.art.breatheLabel}</span>
                    </div>
                  </li>
                );
              }
              return (
                <li key={card.title} className="mk-tile mk-tile--half">
                  <h3 className="mk-h3">{card.title}</h3>
                  <p>{card.body}</p>
                  <div className="mk-tile-media">
                    <ScreenSlot name="appointments" />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── Who sees what ────────────────────────────────────────────── */}
      <section id="who-sees-what" className="mk-sec mk-sec--stone" style={{ scrollMarginTop: '80px' }}>
        <div className="mk-wrap">
          <div className="mk-how-head">
            <SectionLabel>Privacy, concretely</SectionLabel>
            <h2 className="mk-display mk-h2">{copy.who.h2}</h2>
            <p className="mk-body">{copy.who.sub}</p>
          </div>

          <div className="mk-who-grid">
            <div className="mk-panel mk-panel--sees">
              <h3 className="mk-panel-head">
                <Eye size={18} strokeWidth={1.8} aria-hidden="true" />
                {copy.who.leftTitle}
              </h3>
              <ul>
                {copy.who.left.map((item) => (
                  <li key={item}>
                    <span className="mk-tick" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mk-panel mk-panel--not">
              <h3 className="mk-panel-head">
                <EyeOff size={18} strokeWidth={1.8} aria-hidden="true" />
                {copy.who.rightTitle}
              </h3>
              <ul>
                {copy.who.right.map((item) => (
                  <li key={item}>
                    <span className="mk-tick" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mk-who-note">
            {copy.who.note}{' '}
            <Link href="/privacy" style={{ color: 'var(--sage-ink)', fontWeight: 600 }}>
              {copy.who.link}
            </Link>
          </p>
        </div>
      </section>

      {/* ── What this isn't ──────────────────────────────────────────── */}
      <section className="mk-sec mk-sec--lavender">
        <div className="mk-wrap">
          <h2 className="mk-display mk-h2">{copy.isnt.h2}</h2>
          <ul className="mk-isnt-list">
            {copy.isnt.items.map((item, i) => (
              <li key={item.title} className="mk-isnt-row">
                <span className="mk-dash" aria-hidden="true" />
                <h3 className="mk-h3">{item.title}</h3>
                <p className={i === 1 ? 'mk-isnt-crisis' : undefined}>{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Your data ────────────────────────────────────────────────── */}
      <section className="mk-sec mk-sec--stone">
        <div className="mk-wrap">
          <h2 className="mk-display mk-h2">{copy.data.h2}</h2>
          <ul className="mk-data-grid">
            {copy.data.items.map((item, i) => {
              const Icon = DATA_ICONS[i] ?? MapPin;
              return (
                <li key={item} className="mk-data-row">
                  <span className="mk-icon-badge" aria-hidden="true">
                    <Icon size={19} strokeWidth={1.7} />
                  </span>
                  <p>{item}</p>
                </li>
              );
            })}
          </ul>
          <p className="mk-who-note">
            <Link href="/privacy" style={{ color: 'var(--sage-ink)', fontWeight: 600 }}>
              {copy.data.link}
            </Link>{' '}
            — {copy.data.linkNote}
          </p>
        </div>
      </section>

      {/* ── For therapists ───────────────────────────────────────────── */}
      <section
        id="for-therapists"
        className="mk-sec mk-sec--evening"
        style={{ scrollMarginTop: '80px' }}
      >
        <MarkWatermark />
        <span className="mk-glow" aria-hidden="true" data-anim />
        <div className="mk-wrap mk-therapist-grid">
          <div className="mk-therapist-copy">
            <SectionLabel>{copy.nav.forTherapists}</SectionLabel>
            <h2 className="mk-display mk-h2">{copy.forTherapists.h2}</h2>
            <p>{copy.forTherapists.body1}</p>
            <p>{copy.forTherapists.body2}</p>
            <a
              href="mailto:admin@okuvu.in?subject=Okuvu%20for%20my%20practice"
              className="mk-pill mk-pill--ghost"
            >
              {copy.forTherapists.mailto}
            </a>
            <p className="mk-micro">{copy.forTherapists.micro}</p>

            <div className="mk-signin">
              <h3 className="mk-h3">{copy.forTherapists.signInTitle}</h3>
              <p>{copy.forTherapists.signInBody}</p>
              <LandingSignIn googleConfigured={googleOn} cognitoConfigured={cognitoOn} />
              <p className="mk-signin-note">
                {signedIn ? 'You are already signed in.' : 'Administrator: admin@okuvu.in'}
              </p>
            </div>
          </div>

          <div>
            <ScreenSlot name="portal" />
          </div>
        </div>
      </section>

      {/* ── Waitlist ─────────────────────────────────────────────────── */}
      <section id="waitlist" className="mk-wait" style={{ scrollMarginTop: '80px' }}>
        <div className="mk-wrap mk-wait-grid">
          <div className="mk-photo">
            <Image
              src="/marketing/window-light.webp"
              alt={copy.art.photoAlt}
              width={960}
              height={600}
              sizes="(max-width: 900px) 92vw, 500px"
            />
          </div>

          <div className="mk-wait-card">
            <h2 className="mk-display">{copy.wait.h2}</h2>
            <p className="mk-wait-sub">{copy.wait.sub}</p>
            <p className="mk-wait-body">{copy.wait.body}</p>
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="mk-footer">
        <div className="mk-wrap">
          <p className="mk-footer-line">{copy.footer.line}</p>
          <p className="mk-crisis">{copy.crisis.line}</p>
          <div className="mk-footer-links">
            <Link href="/privacy">{copy.footer.privacy}</Link>
            <a href="#for-therapists">{copy.footer.therapists}</a>
            <a href="mailto:admin@okuvu.in">{copy.footer.contact}</a>
          </div>
          <p className="mk-footer-note">{copy.footer.disclaimer}</p>
          <p className="mk-copyright">{copy.footer.copyright}</p>
        </div>
      </footer>
    </div>
  );
}
