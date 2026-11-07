import type { Metadata } from 'next';

/**
 * Google Play — account deletion URL.
 *
 * Play Console requires a publicly reachable page (no login, no app install)
 * that tells a user how to delete their account and what deletion removes.
 * The URL we register with Play is https://okuvu.in/delete-account, and
 * `/delete-account` is listed in PUBLIC_PATHS in `src/proxy.ts` — that is the
 * only reason this page renders for an anonymous visitor.
 *
 * Facts here are taken from code, not from intent:
 *   - the in-app path ......... apps/mobile/lib/src/features/settings/
 *                               {settings,privacy_data,account_deletion}_screen.dart
 *   - what is erased .......... SUBJECT_TABLES in apps/api/src/lib/account.ts
 *   - tombstone + audit ledger  comments above deleteAccount() in the same file
 *   - backup/log windows ...... infrastructure/aws/evia-beta/{variables,observability}.tf,
 *                               and §9 of /privacy
 *   - contact mailbox ......... apps/therapist-portal/src/app/privacy/page.tsx
 *
 * Do not add a numbered promise here that no job or person enforces. If a
 * fact below stops being true, change it in the same commit as the code.
 */

export const metadata: Metadata = {
  title: 'Delete your account — OKUVU',
  description:
    'How to delete your OKUVU account from inside the app, or by email if you can no longer sign in, and exactly what is deleted and what is kept.',
  robots: { index: true, follow: true },
};

const CONTACT_EMAIL = 'admin@okuvu.in';
const APP_ID = 'ai.okuvu.app';
const LAST_UPDATED = '2026-11-07';

const MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  'Delete my account',
)}&body=${encodeURIComponent(
  [
    'Please delete my OKUVU account.',
    '',
    'The phone number I signed in with:',
    'The email address on the account, if any:',
    '',
    'I understand this deletes my chat history, mood check-ins, journal entries and session records.',
  ].join('\n'),
)}`;

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-hairline pt-8">
      <h2 className="font-[family-name:var(--font-wordmark)] text-xl text-royal-night md:text-2xl">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[15px] leading-7 text-charcoal-ink/90">{children}</div>
    </section>
  );
}

export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-oat">
      <header
        className="flex h-16 items-center justify-between px-4 md:px-8"
        style={{ background: 'var(--brand-thread)' }}
      >
        <span className="font-[family-name:var(--font-wordmark)] text-lg tracking-[0.18em] text-lavender-tint">
          OKUVU
        </span>
        <a
          className="text-xs text-lavender-tint/80 underline underline-offset-2 hover:text-lavender-tint"
          href="/privacy"
        >
          Privacy Policy
        </a>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 md:py-14">
        <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">Account</p>
        <h1 className="mt-2 font-[family-name:var(--font-wordmark)] text-3xl text-royal-night md:text-4xl">
          Delete your OKUVU account
        </h1>
        <p className="mt-3 text-sm text-ink-soft">
          OKUVU mobile app ({APP_ID}), operated by OKUVU (okuvu.in). This page explains how to
          delete your account and your data. You do not need to install the app to use the email
          route below. Last updated <time dateTime={LAST_UPDATED}>{LAST_UPDATED}</time>.
        </p>

        <div className="mt-8 rounded-lg border border-hairline bg-oat-elevated p-5">
          <h2 className="font-semibold text-royal-night">Two ways to delete your account</h2>
          <ul className="mt-3 space-y-2 text-[15px] leading-7 text-charcoal-ink/90">
            <li>
              <strong>In the app</strong> — Settings → Privacy &amp; Data → Delete my account.
              Instant, and it is the same operation we run by hand.
            </li>
            <li>
              <strong>By email</strong> — write to{' '}
              <a className="text-royal-purple underline underline-offset-2" href={MAILTO}>
                {CONTACT_EMAIL}
              </a>{' '}
              from the phone number or email address on your account. Use this if you have changed
              phones, cannot sign in, or have already uninstalled the app.
            </li>
          </ul>
        </div>

        <div className="mt-10 space-y-10">
          <Section id="in-app" title="1. Delete from inside the app">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Open Okuvu and sign in.</li>
              <li>Tap Settings, then Privacy &amp; Data.</li>
              <li>
                Tap <strong>Delete my account</strong> and confirm the prompt.
              </li>
            </ol>
            <p>
              One condition, and the app will tell you if it applies: a conversation has to be
              closed first. Deletion is refused while a session is still open, so that a session in
              progress is never half-erased. End the session, then delete.
            </p>
            <p>
              There is no undo and no grace period. Once you confirm, the account cannot be restored
              — signing in again later starts a new account with no history.
            </p>
          </Section>

          <Section id="by-email" title="2. Delete by email">
            <p>
              Send a message to{' '}
              <a className="text-royal-purple underline underline-offset-2" href={MAILTO}>
                {CONTACT_EMAIL}
              </a>{' '}
              with the subject <em>Delete my account</em>. Clicking the link above opens a message
              with the subject and the details we need already filled in.
            </p>
            <p>
              We have to be able to tell that the request comes from the account holder, so write
              from the email address on the account, or name the phone number you signed in with.
              If we cannot verify it, we will ask for something we can check rather than act on an
              unverified request.
            </p>
            <p>
              We confirm by email when it is done. Requests are normally completed within 7 days,
              and always inside the 30-day window stated in the privacy policy (§15).
            </p>
          </Section>

          <Section id="what-is-deleted" title="3. What deletion removes">
            <p>
              Deletion runs as a single transaction, so either all of it happens or none of it does.
              It permanently removes:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Everything you said or recorded in the app</strong> — every chat turn, every
                session record, every session summary, every mood check-in, every journal entry and
                your saved tool preferences;
              </li>
              <li>
                <strong>Your safety and care settings</strong> — safety state and safety flags,
                clinical configuration, your emergency contact, and the engagement/streak profile;
              </li>
              <li>
                <strong>Clinical records held about you</strong> — your therapist&apos;s notes, the
                homework and reminders assigned to you, and your appointments;
              </li>
              <li>
                <strong>The audit trail of who looked at your data</strong> — the therapist access
                log entries for your account, plus your notification inbox;
              </li>
              <li>
                <strong>The link to your therapist</strong> — after deletion your therapist can no
                longer open your conversations or your record;
              </li>
              <li>
                <strong>Sign-up artefacts</strong> — your invitation token, beta consent record, any
                waitlist entry, and what the assistant remembered about you across sessions.
              </li>
            </ul>
            <p>
              It also blanks the phone number and email on your record, and replaces your sign-in
              identifier with a random value, so the remaining row cannot be tied back to your
              phone, your email or your Google account.
            </p>
          </Section>

          <Section id="what-is-kept" title="4. What is kept, and for how long">
            <p>
              Two things survive deletion, deliberately, and this page says so rather than implying
              a clean wipe:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>A marker that an account existed</strong> — the row reduced to a deletion
                timestamp with no phone number, name, date of birth or sign-in identifier. It is
                kept indefinitely so that signing in again cannot silently resurrect a closed
                account and its history.
              </li>
              <li>
                <strong>Append-only audit ledger entries</strong> — these carry no name, email or
                user id, only opaque event ids, and they are retained for legal and forensic
                integrity: rewriting or deleting one breaks the tamper-evident chain for every
                entry after it.
              </li>
            </ul>
            <p>Two copies also age out on their own timers rather than instantly:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Database backups — up to 7 days.</strong> A deleted row can persist inside
                an automated backup until that backup is replaced.
              </li>
              <li>
                <strong>Server and network logs — up to 14 days.</strong> Retained for fault
                diagnosis and security only.
              </li>
            </ul>
            <p>
              Full detail, including what we do not claim about retention, is in the{' '}
              <a className="text-royal-purple underline underline-offset-2" href="/privacy">
                privacy policy
              </a>
              .
            </p>
          </Section>

          <Section id="contact" title="5. If something goes wrong">
            <p>
              If a request is not actioned inside 30 days, or you want confirmation of what was
              removed, write to{' '}
              <a className="text-royal-purple underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              . Under the DPDP Act 2023 you can also ask us to correct your data or complain about
              how it was handled, and escalate to the Data Protection Board of India.
            </p>
            <p className="rounded-md border border-hairline bg-lavender-wash/50 p-4 text-sm">
              This mailbox is not monitored for emergencies. If you are in crisis, contact your
              local emergency services or a helpline.
            </p>
          </Section>
        </div>

        <footer className="mt-14 border-t border-hairline pt-6 text-sm text-ink-soft">
          <p>
            OKUVU · Delete your account · Last updated{' '}
            <time dateTime={LAST_UPDATED}>{LAST_UPDATED}</time>
          </p>
          <p className="mt-2">
            Contact:{' '}
            <a className="text-royal-purple underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>{' '}
            ·{' '}
            <a className="text-royal-purple underline underline-offset-2" href="/privacy">
              Privacy Policy
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
