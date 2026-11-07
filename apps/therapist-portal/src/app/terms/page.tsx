import type { Metadata } from 'next';

/**
 * Google Play — Terms of Service URL.
 *
 * The URL registered with Play Console is https://okuvu.in/terms. Play requires
 * a publicly reachable, non-editable HTML page (not a PDF, no login, no
 * geofencing), so `/terms` is listed in PUBLIC_PATHS in `src/proxy.ts` — that
 * is the only reason this page renders for an anonymous visitor.
 *
 * Every factual claim below is traceable to code in this repo:
 *   - age gate (18+) ........... apps/mobile/lib/src/features/onboarding_welcome/
 *                                age_blocked_screen.dart, /privacy §13
 *   - crisis screen ............ apps/mobile/lib/src/features/crisis/crisis_overlay.dart
 *   - therapist sees summaries . /privacy §6, TherapistClient.chat_access_granted
 *   - AI provider/residency .... /privacy §4 and §8 (Bedrock, ap-south-1)
 *   - deletion ................. /delete-account, SUBJECT_TABLES in
 *                                apps/api/src/lib/account.ts
 *   - no billing in this build . admin.paymentsStatus in
 *                                therapist-portal/src/server/routers/admin.ts
 *
 * Do not add a promise here that no code or person enforces — no SLA, no
 * certification, no refund policy for charges that do not exist. If a fact
 * below stops being true, change it in the same commit as the code.
 */

export const metadata: Metadata = {
  title: 'Terms of Service — OKUVU',
  description:
    'The terms you agree to when you use the OKUVU app and the OKUVU therapist portal: eligibility, what the service is and is not, acceptable use, your content, and liability.',
  robots: { index: true, follow: true },
};

const LAST_UPDATED = '2026-11-07';
const TERMS_VERSION = '1.0 (beta)';
const CONTACT_EMAIL = 'admin@okuvu.in';
const APP_ID = 'ai.okuvu.app';

function Section({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-hairline pt-8">
      <h2 className="font-[family-name:var(--font-wordmark)] text-xl text-royal-night md:text-2xl">
        <span className="mr-2 text-violet">{number}.</span>
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[15px] leading-7 text-charcoal-ink/90">{children}</div>
    </section>
  );
}

export default function TermsOfServicePage() {
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
        <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">Legal</p>
        <h1 className="mt-2 font-[family-name:var(--font-wordmark)] text-3xl text-royal-night md:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-3 text-sm text-ink-soft">
          Applies to the OKUVU mobile app ({APP_ID}) and the OKUVU therapist portal at
          portal.okuvu.in. Version {TERMS_VERSION}. Last updated{' '}
          <time dateTime={LAST_UPDATED}>{LAST_UPDATED}</time>.
        </p>

        <div className="mt-8 rounded-lg border border-hairline bg-oat-elevated p-5">
          <h2 className="font-semibold text-royal-night">The short version</h2>
          <ul className="mt-3 space-y-2 text-[15px] leading-7 text-charcoal-ink/90">
            <li>
              OKUVU is an AI-guided mental-health companion for adults. <strong>It is not a
              therapist, it does not diagnose, and it is not an emergency service.</strong> If you
              are in danger now, call 112 or the helplines the app lists.
            </li>
            <li>
              The AI writes its replies and summaries, and it can be wrong. Treat it as a support
              tool, and follow your therapist&apos;s advice over the app&apos;s.
            </li>
            <li>
              Your therapist sees summaries by default. They see your raw chat only if you switch
              that on, and you can switch it off again.
            </li>
            <li>
              You must be 18 or older. The app blocks under-18 sign-up.
            </li>
            <li>
              Nothing is charged today — there is no billing code in this build. If that changes,
              you will be told before it does, and it will run through Google Play billing.
            </li>
            <li>
              You can delete your account from inside the app at any time. What that removes, and
              the two things it keeps, are set out on the{' '}
              <a className="text-royal-purple underline underline-offset-2" href="/delete-account">
                account-deletion page
              </a>
              .
            </li>
          </ul>
        </div>

        <nav aria-label="Contents" className="mt-8 rounded-lg bg-lavender-wash/60 p-5 text-sm">
          <p className="font-semibold text-royal-night">Contents</p>
          <ol className="mt-2 grid gap-1 text-royal-purple sm:grid-cols-2">
            <li><a className="underline-offset-2 hover:underline" href="#scope">1. Who we are, and what these terms cover</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#eligibility">2. Who may use OKUVU</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#not-a-clinician">3. What OKUVU is, and what it is not</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#who-sees">4. Your therapist, and who sees what</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#acceptable-use">5. Acceptable use</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#your-content">6. Your content, and the permission you give us</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#our-content">7. Our content</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#security">8. Your account and its security</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#availability">9. Availability, changes and beta status</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#charges">10. Charges</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#ending">11. Ending your use</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#privacy">12. Privacy and your data</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#liability">13. Disclaimers and liability</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#law">14. Governing law and disputes</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#changes">15. Changes to these terms</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#contact">16. Contact and grievances</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#unconfirmed">17. What these terms do not claim</a></li>
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          <Section id="scope" number="1" title="Who we are, and what these terms cover">
            <p>
              OKUVU is a mental-health and wellbeing support service operated at okuvu.in. A person
              uses the OKUVU mobile app for an AI-guided conversational companion, mood and journal
              check-ins, and exercises set by their therapist. A therapist uses the OKUVU therapist
              portal to see the people assigned to them, their summaries, notes and appointments.
            </p>
            <p>
              These terms are the agreement between you and OKUVU for the use of the app and the
              portal. By creating an account, or by using either surface, you accept them. If you do
              not accept them, do not use the service.
            </p>
            <p>
              Separate documents form part of this agreement: the{' '}
              <a className="text-royal-purple underline underline-offset-2" href="/privacy">
                privacy policy
              </a>
              , which describes what we collect and how long we keep it, and the{' '}
              <a className="text-royal-purple underline underline-offset-2" href="/delete-account">
                account-deletion page
              </a>
              . Where a therapist is given a portal account, they accept these terms as a user of
              the portal as well.
            </p>
          </Section>

          <Section id="eligibility" number="2" title="Who may use OKUVU">
            <p>
              <strong>You must be 18 or older.</strong> The app asks for your date of birth at
              sign-up and refuses to continue if it makes you a minor; the service is not offered to
              children and we do not accept parental consent as a way in.
            </p>
            <p>
              You need a working phone number to sign in, because a one-time code is how the
              account is authenticated. One account belongs to one person: do not create an account
              for someone else, and do not use another person&apos;s account.
            </p>
            <p>
              The details you give at sign-up and at intake must be accurate — particularly your age,
              so that the service and any safety response are appropriate to you. If a therapist
              registers you on the portal, ask them to correct anything wrong rather than creating a
              second account.
            </p>
          </Section>

          <Section id="not-a-clinician" number="3" title="What OKUVU is, and what it is not">
            <p>
              <strong>OKUVU is not a therapist, a doctor, a diagnostic tool, or a crisis service.</strong>{' '}
              The companion is a large language model that produces text. It does not examine you, it
              cannot diagnose a condition, it cannot prescribe or adjust medication, and it cannot
              admit you to care. It is a support tool that sits alongside the care you get from a
              person.
            </p>
            <p>
              <strong>It can be wrong.</strong> Replies, summaries, mood inferences and journal
              prompts are generated automatically, and generated text can be inaccurate, incomplete
              or inappropriate to your situation. Do not rely on it as the only basis for a decision
              about your health, medication, money, or anyone&apos;s safety. Where the app and your
              therapist disagree, follow your therapist.
            </p>
            <p className="rounded-md border border-danger/30 bg-danger-tint p-4 text-sm">
              <strong>In an emergency, do not use the app.</strong> If you are in immediate danger or
              thinking about harming yourself, call <strong>112</strong> or the helplines the app
              shows on its crisis screen (Tele-MANAS on 14416), or go to your nearest emergency
              department. The service runs safety checks and can show a crisis screen, but it is not
              monitored around the clock and no person is watching a queue of messages. The mailbox
              in §16 is not monitored for emergencies either.
            </p>
            <p>
              Nothing in the app is a substitute for emergency services, and the safety features are
              a supplement to your own judgement and your therapist&apos;s care — not a guarantee that
              a crisis will be detected.
            </p>
          </Section>

          <Section id="who-sees" number="4" title="Your therapist, and who sees what">
            <p>
              If you are a client, your account is linked to a therapist on the portal. By default
              your therapist sees <strong>summaries</strong> of your sessions, your mood trend, your
              care plan and the homework and appointments they set — not the raw text of your chats.
              Raw chat becomes visible only if you switch it on for that therapist, and you can
              switch it off again at any time; the setting is enforced on the server.
            </p>
            <p>
              Journal entries are yours. They are not shown to your therapist.
            </p>
            <p>
              Your therapist&apos;s own clinical notes about you are written by them and belong to
              their professional record. OKUVU holds those notes on their behalf as part of running
              the service, and they are not shown to you in the app today.
            </p>
            <p>
              If you are a therapist, you must use the portal only for the clients assigned to you,
              only for their care, and only through the access you have been given. Every time you
              open a client record, the access is logged.
            </p>
          </Section>

          <Section id="acceptable-use" number="5" title="Acceptable use">
            <p>You agree not to:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                use OKUVU for anyone other than yourself, or enter another person&apos;s health
                information as if it were your own;
              </li>
              <li>
                use it to harass, threaten, defame or impersonate anyone, or to plan or carry out
                something unlawful;
              </li>
              <li>
                try to make the companion produce content that breaches these terms by prompting,
                jailbreaking, or otherwise steering it around its safety behaviour, or probe the
                safety system to find ways past it;
              </li>
              <li>
                copy, scrape, reverse-engineer or automate access to the service beyond ordinary
                use — including bulk extraction of content, model outputs or other users&apos;
                data;
              </li>
              <li>
                interfere with the service or its security, including probing, scanning or
                attempting to gain access to accounts, servers or data you are not authorised to
                reach;
              </li>
              <li>
                present OKUVU output as the advice of a qualified clinician, or as a diagnosis.
              </li>
            </ul>
            <p>
              The app is designed to keep working when a message is flagged — a blocked or
              redirected reply is the safety system doing its job, not a malfunction, and working
              around it is a breach of these terms.
            </p>
          </Section>

          <Section id="your-content" number="6" title="Your content, and the permission you give us">
            <p>
              What you write in the app — messages, mood values, journal entries, and anything else
              you enter — stays yours. We do not claim ownership of it, and we do not sell it or use
              it for advertising.
            </p>
            <p>
              To run the service we need permission to handle it, so you grant OKUVU a limited,
              non-exclusive licence to store, process, transmit and display your content{' '}
              <strong>only</strong> to operate the features you use: continuing a conversation,
              producing a summary, running safety checks, showing your trend, and showing your
              therapist what §4 says they may see. That permission lasts as long as the content is
              held, and it ends when the content is deleted — except for what deletion keeps, as set
              out on the{' '}
              <a className="text-royal-purple underline underline-offset-2" href="/delete-account">
                account-deletion page
              </a>
              .
            </p>
            <p>
              We do not use your conversations to train our own models. Where text is sent to a model
              provider to generate a reply, the provider&apos;s own terms apply to that processing;
              the privacy policy names the provider, the model family and the region (§4, §8).
            </p>
            <p>
              AI-generated text in the app — replies, summaries, prompts — is produced for you to
              use within the service. It is not a clinical record and it is not advice from a named
              professional.
            </p>
          </Section>

          <Section id="our-content" number="7" title="Our content">
            <p>
              The app, the portal, the OKUVU name and marks, the interface, the written content and
              the software behind them belong to OKUVU or its licensors. You get a personal,
              non-transferable right to use the app and portal for your own care or practice as these
              terms describe — nothing more. You may not copy, modify, distribute, sell or lease any
              part of the service, or use the OKUVU name or marks without written permission.
            </p>
            <p>
              If you are a therapist, this does not restrict you from using, in your own professional
              records, the clinical material you are entitled to — your own notes, and a
              client&apos;s information as your professional obligations require.
            </p>
          </Section>

          <Section id="security" number="8" title="Your account and its security">
            <p>
              Sign-in is by a one-time code sent to your phone number, or by a linked Google account
              in the portal. Keep control of that number and that mailbox: anyone who receives your
              code can reach your account. Do not share a code with anyone, including someone who
              says they are from OKUVU — we will never ask you for one.
            </p>
            <p>
              Tell us at{' '}
              <a className="text-royal-purple underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>{' '}
              straight away if you think someone else has access to your account, or if your phone is
              lost or its number is reassigned. We may need to verify that a request comes from the
              account holder before acting on it.
            </p>
          </Section>

          <Section id="availability" number="9" title="Availability, changes and beta status">
            <p>
              OKUVU is in beta. The service is provided as it is built, and it can change: features
              can be added, altered or withdrawn, and the service can be interrupted for maintenance
              or because a dependency fails. <strong>We do not promise uptime, and there is no
              service-level commitment in these terms.</strong>
            </p>
            <p>
              Because this is a health-adjacent product, some changes are gated on review rather than
              on a release schedule — a change to safety behaviour, crisis copy or what your therapist
              can see may take longer to ship than a change to the interface. Where a change affects
              what we collect or who sees it, the privacy policy governs the notice we give.
            </p>
            <p>
              We may suspend or end the service, in whole or in part. If we end it for everyone, we
              will tell you before it stops and give you a way to get your data out — deletion tools
              and the mailbox in §16 remain available for that.
            </p>
          </Section>

          <Section id="charges" number="10" title="Charges">
            <p>
              <strong>Nothing is charged today.</strong> There is no payment code in the build you
              are using: no subscription, no in-app purchase, no card or UPI details are collected
              anywhere in the app or the portal, and the therapist console explicitly reports that
              billing is not enabled rather than showing amounts.
            </p>
            <p>
              If paid features are introduced, they will run through Google Play&apos;s billing
              system, the price and what it buys will be shown before you are asked to pay, these
              terms will be updated first, and the version and date at the top of this page will
              change. Nothing in these terms obliges you to pay for anything today, and nothing here
              creates a refund policy for a charge that does not exist.
            </p>
          </Section>

          <Section id="ending" number="11" title="Ending your use">
            <p>
              <strong>You can stop at any time.</strong> Delete the app, and delete your account from
              inside it — Settings → Privacy &amp; Data → Delete my account — or by writing to us.
              Deletion is immediate and final: it removes your content and the records described on
              the{' '}
              <a className="text-royal-purple underline underline-offset-2" href="/delete-account">
                account-deletion page
              </a>
              , and the account cannot be restored.
            </p>
            <p>
              <strong>We may suspend or close an account</strong> if these terms are breached, if the
              service is being used to harm someone, or if we are required to by law. Where it is
              reasonable to do so, we will tell you why and give you the chance to respond first. A
              therapist account is closed as a handover, not a bulk delete: their clients are
              reassigned or released before access ends, because closing a caseload in one keystroke
              would take care away from people who did not ask for it.
            </p>
          </Section>

          <Section id="privacy" number="12" title="Privacy and your data">
            <p>
              The{' '}
              <a className="text-royal-purple underline underline-offset-2" href="/privacy">
                privacy policy
              </a>{' '}
              is part of this agreement. It names what we collect, the third parties that touch it,
              where it is stored (AWS Mumbai), how long it is kept, and the rights you have under
              India&apos;s Digital Personal Data Protection Act, 2023 — access, correction, erasure,
              withdrawal of consent, nomination, and complaint to the Data Protection Board of India.
            </p>
            <p>
              Two things are worth repeating here because they are decisions, not accidents: your
              data is stored in India, and the two flows that leave it — dictation audio handled by
              your phone&apos;s speech recogniser, and invitation emails sent through our email
              provider — are named in the privacy policy rather than buried.
            </p>
          </Section>

          <Section id="liability" number="13" title="Disclaimers and liability">
            <p>
              The service is provided <strong>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</strong>.
              To the extent the law allows, we exclude implied warranties of merchantability, fitness
              for a particular purpose and non-infringement, and we do not warrant that the service
              will be uninterrupted, error-free, or that generated content will be accurate.
            </p>
            <p>
              To the extent the law allows, OKUVU is not liable for indirect or consequential loss, or
              for loss arising from a decision you took in reliance on generated content, from a
              feature being unavailable, or from a safety check failing to detect something it was
              not designed to detect. §3 says what the service is not; that section is the basis of
              this one.
            </p>
            <p>
              <strong>Nothing in these terms excludes or limits liability that cannot lawfully be
              excluded or limited</strong> — including liability for death or personal injury caused
              by negligence, for fraud, or any right you have under the Consumer Protection Act, 2019
              or the DPDP Act, 2023. If a term here is held to be unenforceable, the rest of these
              terms stand.
            </p>
            <p>
              If you are a therapist using the portal, you remain professionally responsible for your
              own clinical judgement, your notes and your record-keeping; these terms do not transfer
              that responsibility to OKUVU.
            </p>
          </Section>

          <Section id="law" number="14" title="Governing law and disputes">
            <p>
              These terms are governed by the laws of India. Subject to §16, disputes are subject to
              the jurisdiction of the courts of India.
            </p>
            <p>
              Before going to court, write to{' '}
              <a className="text-royal-purple underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>{' '}
              and give us 30 days to resolve it — most things that reach this point are a data
              request or an account problem, and both are faster by mail than by filing.
            </p>
          </Section>

          <Section id="changes" number="15" title="Changes to these terms">
            <p>
              When these terms change we update the version and the date at the top. If a change is
              material — what we collect, who sees it, what you pay, or what you are permitted to do
              — we will tell you in the app before it takes effect and, where the law requires it,
              ask you to accept again. Continuing to use the service after a change takes effect
              means you accept the updated terms. Previous versions are available on request.
            </p>
          </Section>

          <Section id="contact" number="16" title="Contact and grievances">
            <p>
              For any question about these terms, an account problem, or a complaint about how the
              service or a request was handled:
            </p>
            <p className="rounded-md bg-lavender-wash/70 p-4">
              <strong>Email:</strong>{' '}
              <a className="text-royal-purple underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              <br />
              <strong>Subject line:</strong> Terms question, Account, or Grievance
              <br />
              <strong>Response:</strong> acknowledged within 7 days, resolved within 30 days
            </p>
            <p>
              Data-protection requests and grievances are handled under the privacy policy (§15),
              including escalation to the Data Protection Board of India. This mailbox is not
              monitored for emergencies — in a crisis, use §3.
            </p>
          </Section>

          <Section id="unconfirmed" number="17" title="What these terms do not claim">
            <p>
              These terms describe the service as it is built. They do not assert any clinical
              certification, audit attestation, compliance status or regulatory approval — we hold
              none, and inventing one would be worse than having none.
            </p>
            <p>Open points that are stated as open rather than resolved:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                the retention period for clinical records, which no scheduled job currently enforces
                (privacy §9);
              </li>
              <li>
                the transfer basis for dictation audio handled by platform speech recognisers and for
                invitation emails sent through our email provider (privacy §8);
              </li>
              <li>
                the designation of a named Grievance Officer and the formal response timeline the
                DPDP rules will require, beyond the mailbox and the 30-day target in §16;
              </li>
              <li>
                whether the service will be offered to minors in any form — today it is not, and
                these terms are written on that basis.
              </li>
            </ul>
            <p>
              Each of these is with counsel. When an answer is settled, this page changes and the
              version number with it.
            </p>
          </Section>
        </div>

        <footer className="mt-14 border-t border-hairline pt-6 text-sm text-ink-soft">
          <p>
            OKUVU · Terms of Service v{TERMS_VERSION} · Last updated{' '}
            <time dateTime={LAST_UPDATED}>{LAST_UPDATED}</time>
          </p>
          <p className="mt-2">
            <a className="text-royal-purple underline underline-offset-2" href="/privacy">
              Privacy Policy
            </a>{' '}
            ·{' '}
            <a className="text-royal-purple underline underline-offset-2" href="/delete-account">
              Delete your account
            </a>{' '}
            · Questions:{' '}
            <a className="text-royal-purple underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
