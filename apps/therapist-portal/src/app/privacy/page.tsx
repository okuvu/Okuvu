import type { Metadata } from 'next';

/**
 * E19-S2 — the public privacy policy.
 *
 * Deliberately a static server component with no session, no tRPC and no
 * client hooks: it has to render for an anonymous visitor who has never
 * signed in (Google Play requires the policy URL to be publicly reachable,
 * and DPDP requires the notice to be accessible before consent). `/privacy`
 * is listed in PUBLIC_PATHS in `src/proxy.ts` — that is the only reason this
 * page is reachable without a session.
 *
 * Every factual claim below is traceable to code in this repo; the file
 * comments name the source so a future editor can re-check it rather than
 * trusting the prose:
 *   - collected fields ......... packages/prisma/schema.prisma
 *   - audio/dictation .......... apps/mobile/lib/src/core/speech_service.dart
 *   - model provider ........... apps/api/src/lib/{generate-content,bedrock,provider-config}.ts,
 *                                infrastructure/aws/evia-beta/ecs.tf (LLM_PROVIDER=bedrock)
 *   - analytics/crash .......... apps/mobile/lib/src/core/{analytics_service,crash_reporter}.dart
 *   - email .................... apps/therapist-portal/src/lib/email.ts (Brevo)
 *   - retention ................ infrastructure/aws/evia-beta/{variables,observability}.tf,
 *                                apps/worker/src/routes/beta-retention.ts
 *   - deletion ................. apps/api/src/lib/account.ts
 *   - therapist access audit ... packages/prisma/schema.prisma (ClinicalAccessLog),
 *                                TherapistClient.chat_access_granted
 *
 * Do not add "clinically reviewed", certification, or compliance-badge claims
 * here. The last section states plainly what is still unconfirmed.
 */

export const metadata: Metadata = {
  title: 'Privacy Policy — OKUVU',
  description:
    'How OKUVU collects, uses, stores and deletes health and wellbeing data, including audio dictation, first-party analytics and crash reporting.',
  robots: { index: true, follow: true },
};

const LAST_UPDATED = '2026-10-28';
const POLICY_VERSION = '1.0 (beta)';
const CONTACT_EMAIL = 'admin@okuvu.in';

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

function Table({
  head,
  rows,
}: {
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-hairline">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="bg-lavender-tint/70">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-semibold text-royal-night">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-hairline align-top">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-charcoal-ink/90">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-oat">
      <header
        className="flex h-16 items-center px-4 md:px-8"
        style={{ background: 'var(--brand-thread)' }}
      >
        <span className="font-[family-name:var(--font-wordmark)] text-lg tracking-[0.18em] text-lavender-tint">
          OKUVU
        </span>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 md:py-14">
        <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">Legal</p>
        <h1 className="mt-2 font-[family-name:var(--font-wordmark)] text-3xl text-royal-night md:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-ink-soft">
          Applies to the OKUVU mobile app and the OKUVU therapist portal.
          Version {POLICY_VERSION}. Last updated{' '}
          <time dateTime={LAST_UPDATED}>{LAST_UPDATED}</time>.
        </p>

        <div className="mt-8 rounded-lg border border-hairline bg-oat-elevated p-5">
          <h2 className="font-semibold text-royal-night">The short version</h2>
          <ul className="mt-3 space-y-2 text-[15px] leading-7 text-charcoal-ink/90">
            <li>
              We hold what you tell OKUVU — chat messages, mood check-ins, journal entries, session
              summaries — and what your therapist records about your care. That is health data, and
              we treat it as sensitive.
            </li>
            <li>
              <strong>We never receive or store your voice recordings.</strong> Speech-to-text
              runs through your phone&apos;s own recogniser, which may send audio to Google or
              Apple (see §3).
            </li>
            <li>
              Chat text is processed by an AI model running on Amazon Bedrock{' '}
              <em>inside India</em> (Mumbai region) to produce summaries and safety checks.
            </li>
            <li>
              We use our own first-party analytics and crash logging. No third-party analytics or
              crash SDK is bundled in the app.
            </li>
            <li>
              You can delete your account from inside the app at any time. What is deleted, what is
              kept, and for how long is spelled out in §9 and §10 — including the parts that are
              not yet automatic.
            </li>
          </ul>
        </div>

        <nav aria-label="Contents" className="mt-8 rounded-lg bg-lavender-wash/60 p-5 text-sm">
          <p className="font-semibold text-royal-night">Contents</p>
          <ol className="mt-2 grid gap-1 text-royal-purple sm:grid-cols-2">
            <li><a className="underline-offset-2 hover:underline" href="#who-we-are">1. Who we are</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#what-we-collect">2. What we collect</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#audio">3. Audio and dictation</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#ai">4. AI processing</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#analytics">5. Analytics and crash reports</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#who-sees">6. Who can see your data</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#processors">7. Service providers</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#residency">8. Where data is stored</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#retention">9. How long we keep it</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#deletion">10. Deleting your data</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#rights">11. Your rights</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#security">12. Security</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#children">13. Age limits</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#changes">14. Changes</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#contact">15. Contact and grievances</a></li>
            <li><a className="underline-offset-2 hover:underline" href="#unconfirmed">16. What we do not claim</a></li>
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          <Section id="who-we-are" number="1" title="Who we are">
            <p>
              OKUVU is a mental-health and wellbeing support service. A person uses the OKUVU mobile
              app for an AI-guided conversational companion, mood and journal check-ins, and
              exercises set by their therapist. A therapist uses the OKUVU therapist portal to see
              the people assigned to them, their summaries, notes and appointments.
            </p>
            <p>
              For the purposes of India&apos;s Digital Personal Data Protection Act, 2023
              (&ldquo;DPDP Act&rdquo;), OKUVU is the Data Fiduciary for the data described here: we
              decide why it is processed and how. Where a therapist enters their own clinical notes
              about a client, the therapist remains professionally responsible for those notes, and
              OKUVU holds them on the therapist&apos;s behalf as part of providing the service.
            </p>
            <p>
              This policy covers the mobile app (<code className="rounded bg-lavender-tint px-1 py-0.5 text-[13px]">ai.okuvu.app</code>)
              and the therapist portal at <code className="rounded bg-lavender-tint px-1 py-0.5 text-[13px]">portal.okuvu.in</code>.
            </p>
          </Section>

          <Section id="what-we-collect" number="2" title="What we collect">
            <p>
              This is the actual data model, not a generic list. Each row below is a table that
              exists in the running service today.
            </p>
            <Table
              head={['What', 'Details', 'Why we hold it']}
              rows={[
                [
                  <strong key="a">Account and identity</strong>,
                  'Mobile number (the sign-in identifier), and — when a therapist invites someone through the portal — email address, full name as recorded by the therapist, date of birth and gender as entered at intake.',
                  'Creating the account, signing in, matching a client to their therapist.',
                ],
                [
                  <strong key="b">Conversation</strong>,
                  'Every chat turn you and the AI companion exchange, stored as text: your messages and the replies. Also a session record with start/end time, turn count and whether a crisis signal was detected.',
                  'Continuing the conversation across sessions, safety review, and giving your therapist a summary you have agreed to share.',
                ],
                [
                  <strong key="c">Session summaries</strong>,
                  'AI-written summaries of a conversation, plus a numeric vector representation used to find relevant earlier context. Generated automatically after a session.',
                  'Continuity, and the therapist-facing summary.',
                ],
                [
                  <strong key="d">Mood check-ins</strong>,
                  'A daily mood value (an integer score) with the date, which may be inferred from conversation as well as entered by you.',
                  'Trends shown to you and, if shared, to your therapist.',
                ],
                [
                  <strong key="e">Journal entries</strong>,
                  'Free-text journal entries with the emotion you selected and its intensity.',
                  'The journal feature itself. Journal text is yours; it is not shown to your therapist.',
                ],
                [
                  <strong key="f">Therapist notes</strong>,
                  'Free-text notes a therapist writes about a client, and homework, reminders and appointments they set.',
                  'Your care. Notes are written by the therapist and are visible to them, not to you in the app today.',
                ],
                [
                  <strong key="g">Consent and safety records</strong>,
                  'Whether you consented to safety monitoring and mood inference; changes to whether your therapist may see raw chat (versus summaries only); an audit log each time a therapist opens your record; and a safety/governance log recording which gate blocked or flagged model output, including the blocked text.',
                  'Proving what you agreed to, honouring withdrawal of consent, and reviewing whether the safety system behaved correctly.',
                ],
                [
                  <strong key="h">Technical data</strong>,
                  'Server logs of requests (timestamps, route, response status, internal user id), and — only if switched on at build time, which it currently is not — app analytics events and crash reports (§5).',
                  'Operating the service, diagnosing faults, security.',
                ],
              ]}
            />
            <p className="text-sm text-ink-soft">
              We do not collect your contacts, your location, your photo library, advertising
              identifiers, or anything from other apps on your phone. The app requests the
              microphone permission only while you hold the dictation button, and asks for
              notification permission only if you turn notifications on.
            </p>
          </Section>

          <Section id="audio" number="3" title="Audio and dictation">
            <p>
              <strong>OKUVU does not record your therapy conversations, and no audio file is ever
              sent to or stored on our servers.</strong> There is no recording feature, no upload
              endpoint for audio, and no object storage bucket that audio is written to. If you
              never tap the microphone, no audio is captured at all.
            </p>
            <p>
              When you tap the microphone to dictate instead of typing, this is what happens:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                The app asks for microphone permission and starts your phone&apos;s own speech
                recogniser — on Android that is normally Google&apos;s, on iOS it is Apple&apos;s.
                OKUVU does not run its own speech model.
              </li>
              <li>
                <strong>
                  On most Android phones that recogniser streams the audio to Google to transcribe
                  it, so the audio does leave your device — to Google, not to us.
                </strong>{' '}
                On iOS, Apple&apos;s recogniser may do the same. We deliberately left the
                &ldquo;on-device only&rdquo; mode switched off, because it fails outright on phones
                without a downloaded offline English model; that trade-off is documented in the
                app&apos;s source and is a live privacy decision, not an oversight.
              </li>
              <li>
                What comes back to OKUVU is only the <em>text</em> transcript, which then behaves
                exactly like something you typed. Dictation stops on its own after 60 seconds of
                listening or 3 seconds of silence.
              </li>
              <li>
                Your phone&apos;s own voice-assistant settings (for example, whether Google keeps
                audio history) govern what the platform recogniser retains. That is outside our
                control and outside our systems; you can review it in your device settings.
              </li>
            </ul>
            <p>
              Separately, the app can <em>speak</em> replies aloud when you turn voice mode on. That
              audio is generated on the server from the reply text and played on your device; it is
              output, not a recording of you, and it is not stored.
            </p>
            <p className="text-sm text-ink-soft">
              If a future release adds voice notes or call recording, this section has to change
              before that release ships — and it would be a materially different data flow
              (audio stored server-side) requiring fresh consent.
            </p>
          </Section>

          <Section id="ai" number="4" title="AI processing">
            <p>
              The companion&apos;s replies, the session summaries, the safety classification and the
              journal prompts are produced by a large language model. To produce them, we send{' '}
              <strong>text</strong> to the model: your recent messages, the assistant&apos;s recent
              replies, summaries of earlier sessions, your care plan and language preference, and
              relevant context retrieved from your own history.
            </p>
            <p>
              In the running service that model is served by <strong>Amazon Bedrock in the
              ap-south-1 (Mumbai) region</strong>, from inside our own AWS account and network. The
              model currently configured is Qwen3 32B for conversation and Titan Text Embeddings V2
              for the vector representations. Amazon states that it does not use Bedrock customer
              content to train its foundation models; counsel should confirm that position holds for
              every model we call, because it is a contractual assurance rather than something we
              can verify from our side.
            </p>
            <p>
              We do not use your conversations to train our own models, and we do not sell data or
              share it for advertising.
            </p>
            <p className="rounded-md border border-honey/40 bg-honey-tint/60 p-4 text-sm">
              <strong>One exception you should know about.</strong> The codebase also contains a
              second, non-AWS model path (OpenRouter) that is used in development and automated
              testing. Production is configured to use Bedrock only. If that configuration were ever
              switched, conversation text would go to a provider outside India — a change we would
              have to tell you about, and one that is called out in the deployment configuration so
              it cannot happen silently. Today, in production, it has not been switched.
            </p>
          </Section>

          <Section id="analytics" number="5" title="Analytics and crash reports">
            <p>
              OKUVU uses <strong>its own first-party</strong> analytics and crash logging. There is
              no Firebase, Crashlytics, Google Analytics, Mixpanel, Amplitude, Sentry or any other
              third-party analytics or crash SDK in the app — the Firebase surface was removed when
              the platform moved to AWS, and nothing replaced it.
            </p>
            <p>
              What the code does today, precisely:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Analytics events</strong> — a name, a small property map and a UTC
                timestamp, written to the app&apos;s local log.
              </li>
              <li>
                <strong>Crash reports</strong> — the error message, stack trace, whether it was
                fatal, the platform, the app version and a UTC timestamp, also written to the local
                log.
              </li>
              <li>
                Both have a remote-shipping path that posts to an endpoint we operate, but{' '}
                <strong>
                  that endpoint is only set at build time and is not currently set
                </strong>
                . In the builds we ship today, analytics and crash data therefore stay on your
                phone and are not transmitted to us. If we switch remote shipping on, the payloads
                go to our own infrastructure in Mumbai, not to a third party, and this section will
                be updated first.
              </li>
              <li>
                Neither path sends conversation content, journal text, mood values or your phone
                number. Analytics events carry no free text; crash reports carry whatever the error
                message happens to contain, which is why we keep them first-party.
              </li>
            </ul>
          </Section>

          <Section id="who-sees" number="6" title="Who can see your data">
            <p>
              Only two groups of people can see anything about you: you, and the therapist you are
              assigned to. There is no advertising, no data broker, and no internal team browsing
              conversations for interest.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Your therapist sees summaries by default — not your raw chat.</strong> Raw
                chat is visible only if you switch it on, and you can switch it off again at any
                time. The setting is stored per therapist relationship and enforced on the server,
                not just hidden in the interface.
              </li>
              <li>
                <strong>Every look is logged.</strong> When a therapist opens your record, an audit
                row is written recording which therapist, which client, what action, and when.
              </li>
              <li>
                <strong>Journal entries are not shared with your therapist.</strong> They are yours;
                nothing in the portal reads them.
              </li>
            </ul>
            <p>
              A small number of OKUVU engineers can technically access the production database as
              part of running the service. Access is through AWS credentials held by named
              individuals, is logged in AWS CloudTrail, and is limited to operating the service —
              not to reading content.
            </p>
          </Section>

          <Section id="processors" number="7" title="Service providers">
            <p>
              These are the third parties that actually touch data in the current build. There are
              no others; if that changes, this table changes with it.
            </p>
            <Table
              head={['Provider', 'What it does', 'What it sees']}
              rows={[
                [
                  <strong key="aws">Amazon Web Services</strong>,
                  'Hosts the service in the Mumbai region: application servers, the PostgreSQL database, Redis, the sign-in service (Cognito), and logs.',
                  'All data in this policy, stored in AWS ap-south-1 under our account.',
                ],
                [
                  <strong key="bedrock">Amazon Bedrock (model provider)</strong>,
                  'Serves the language model and the embedding model that produce replies, summaries, safety classifications and journal prompts.',
                  'The text described in §4 — recent messages, replies, summaries, care plan. Not your name, phone number or journal entries.',
                ],
                [
                  <strong key="brevo">Brevo</strong>,
                  'Sends the invitation email when a therapist adds a client from the portal.',
                  'The invitee’s email address and name, the therapist’s name, and the invite code. Nothing clinical.',
                ],
                [
                  <strong key="speech">Your phone&apos;s speech recogniser (Google on Android, Apple on iOS)</strong>,
                  'Transcribes dictation into text on the device.',
                  'The audio you dictate, if the platform recogniser is configured to stream it (see §3). OKUVU never receives the audio.',
                ],
              ]}
            />
            <p className="text-sm text-ink-soft">
              We do not use a third-party analytics, crash-reporting, CRM, support-desk or
              marketing tool today. The invitation email is the only outbound email the product
              sends.
            </p>
          </Section>

          <Section id="residency" number="8" title="Where data is stored">
            <p>
              Your account, conversations, moods, journal entries, notes and summaries are stored in
              a PostgreSQL database in <strong>AWS ap-south-1 (Mumbai, India)</strong>. Application
              servers, caches, logs and the model endpoint are in the same region. The deployment
              configuration refuses any other region, so this is enforced rather than merely
              intended.
            </p>
            <p>
              Two flows leave India or leave our systems, and we would rather name them than bury
              them:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Dictation audio</strong> goes to your platform&apos;s speech recogniser
                (§3), which is generally operated by Google or Apple outside India. This happens
                only while you are holding the microphone.
              </li>
              <li>
                <strong>Invitation emails</strong> are sent through Brevo, whose infrastructure is
                not in India. Those emails contain a name, an email address and an invite code —
                never clinical content.
              </li>
            </ul>
            <p>
              Whether these two flows need a specific cross-border transfer basis, and how they
              should be disclosed under the DPDP Act and its rules, is a legal question we have put
              to counsel. We are not asserting a conclusion here (§16).
            </p>
          </Section>

          <Section id="retention" number="9" title="How long we keep it">
            <p>
              Being precise matters more than sounding tidy, so here is the honest position:
              clinical data does not currently expire on a timer.
            </p>
            <Table
              head={['Data', 'How long', 'Notes']}
              rows={[
                [
                  'Account, conversations, summaries, moods, journal entries, notes, appointments',
                  <span key="r1">Until you delete them</span>,
                  'There is no automatic ageing-out of clinical records in the current build. We are not going to claim a retention period the code does not implement.',
                ],
                [
                  'Database backups',
                  <span key="r2">7 days</span>,
                  'Automated RDS backups. A deleted row can persist inside a backup for up to this window before the backup itself is replaced.',
                ],
                [
                  'Server and network logs',
                  <span key="r3">14 days</span>,
                  'Application, worker and VPC flow logs. Retained for fault diagnosis and security only.',
                ],
                [
                  'Beta evaluation data (test harness)',
                  <span key="r4">90 days</span>,
                  'Only applies to evaluation runs and case sets, not to your account. The cleanup job defaults to dry-run, so deletion there is an explicit operator action.',
                ],
                [
                  'Deleted account record',
                  <span key="r5">Indefinitely, as a tombstone</span>,
                  'See §10 — the row is reduced to a marker that the account existed, with no phone number and no link to your sign-in identity.',
                ],
              ]}
            />
            <p>
              A defined retention period for clinical records — how long after a client stops using
              the service their history should be kept, and what a therapist&apos;s professional
              record-keeping obligations require — is a decision with legal and clinical input. It
              has not been set, and we say so rather than publishing a number that no job enforces.
              Until it is set, the practical control is deletion (§10).
            </p>
          </Section>

          <Section id="deletion" number="10" title="Deleting your data">
            <p>
              <strong>If you are a client:</strong> open the app, go to <em>Settings → Privacy &amp;
              Data → Delete my account</em>, and confirm. You can also write to{' '}
              <a className="text-royal-purple underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>{' '}
              from the number or address on your account and we will do it for you.
            </p>
            <p>
              <strong>If you are a therapist:</strong> deleting your portal account is a request to{' '}
              <a className="text-royal-purple underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              . Because closing a therapist account affects the clients assigned to them, we handle
              it as a handover — their clients are reassigned or released first — rather than
              deleting a caseload in one keystroke.
            </p>
            <p>What deletion actually does, in one transaction, when you confirm in the app:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                permanently deletes your emergency contact, engagement/streak profile, clinical
                configuration, safety state, <strong>every chat turn</strong>, every session
                summary, every mood check-in and every session record;
              </li>
              <li>
                blanks your phone number and replaces your sign-in identifier with a random value,
                so the record can no longer be tied to you or to your login;
              </li>
              <li>marks the account deleted, with the deletion timestamp.</li>
            </ul>
            <p>
              Deletion is refused while a conversation is still open, so a session in progress is
              never half-erased — end the session first.
            </p>
            <p className="rounded-md border border-danger/30 bg-danger-tint p-4 text-sm">
              <strong>What deletion does not do today, stated plainly.</strong> The current delete
              path covers the rows above. It does <em>not</em> delete journal entries, therapist
              notes written about you, homework, reminders, appointments, or the therapist access
              audit log — those rows are not touched by the account-deletion transaction. It also
              leaves the reduced account row in place. If you want those removed as well, ask us in
              writing at{' '}
              <a className="text-royal-purple underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>{' '}
              and we will do it manually, and confirm when it is done. Closing this gap in the
              product is tracked work; we would rather tell you it exists than describe a deletion
              that does not happen.
            </p>
          </Section>

          <Section id="rights" number="11" title="Your rights">
            <p>Under the DPDP Act you can ask us to:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Confirm and access</strong> what we hold about you, and get a summary of it;
              </li>
              <li>
                <strong>Correct or complete</strong> anything inaccurate — including your name,
                date of birth and contact details;
              </li>
              <li>
                <strong>Erase</strong> your data, using the deletion path in §10;
              </li>
              <li>
                <strong>Withdraw consent</strong> at any time — for safety monitoring, mood
                inference, or your therapist seeing raw chat — without losing access to the parts of
                the service that do not need that consent;
              </li>
              <li>
                <strong>Nominate</strong> someone to exercise these rights on your behalf if you die
                or become unable to act;
              </li>
              <li>
                <strong>Complain</strong> to us first, and then to the Data Protection Board of
                India if we do not resolve it.
              </li>
            </ul>
            <p>
              Write to{' '}
              <a className="text-royal-purple underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              . We aim to respond within 30 days. We may need to verify that the request comes from
              the account holder before acting on it — for an account holding this kind of data, we
              will not delete or export on an unverified email alone.
            </p>
            <p>
              Withdrawing consent to safety monitoring does not switch the safety checks off for
              other people&apos;s benefit — it changes what we store about those checks. If OKUVU
              believes you are in immediate danger, the crisis escalation path runs regardless of
              consent, because that is the one place where not acting is the greater harm.
            </p>
          </Section>

          <Section id="security" number="12" title="Security">
            <p>
              Data is encrypted at rest (the database volume and its backups are encrypted) and in
              transit (TLS between your app and our servers, and certificate-validated TLS to the
              database). Production credentials are held in AWS Secrets Manager, not in the source
              code. Access to the database is through named individual AWS credentials and is
              logged.
            </p>
            <p>
              No system is perfectly secure, and we will not pretend otherwise. If a breach affects
              your data, we will notify you and the Data Protection Board as the DPDP Act requires.
            </p>
          </Section>

          <Section id="children" number="13" title="Age limits">
            <p>
              OKUVU is for adults. You must be 18 or older to create an account. We do not
              knowingly collect data from children, and we do not process children&apos;s data with
              parental consent because the service is not offered to them. If you believe a
              child&apos;s data has reached us, write to{' '}
              <a className="text-royal-purple underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>{' '}
              and we will remove it.
            </p>
          </Section>

          <Section id="changes" number="14" title="Changes to this policy">
            <p>
              When this policy changes we update the date at the top and the version. If a change
              affects what we collect, who sees it, or how long we keep it, we will tell you in the
              app before the change takes effect and, where the law requires it, ask for your
              consent again. Previous versions are available on request.
            </p>
          </Section>

          <Section id="contact" number="15" title="Contact and grievances">
            <p>
              For any privacy question, data request, or grievance — including a complaint about how
              we handled an earlier request:
            </p>
            <p className="rounded-md bg-lavender-wash/70 p-4">
              <strong>Email:</strong>{' '}
              <a className="text-royal-purple underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              <br />
              <strong>Subject line:</strong> Privacy request, or Grievance
              <br />
              <strong>Response:</strong> acknowledged within 7 days, resolved within 30 days
            </p>
            <p>
              If you are not satisfied with our response, you can complain to the Data Protection
              Board of India. If you are in crisis, please contact your local emergency services or
              a helpline — this mailbox is not monitored for emergencies.
            </p>
          </Section>

          <Section id="unconfirmed" number="16" title="What we do not claim">
            <p>
              This policy describes the service as it is built, not as we hope it will be read. It
              has not been clinically reviewed, and it does not assert any certification, audit
              attestation, or compliance status — we hold none, and inventing one would be worse
              than having none.
            </p>
            <p>
              These points are open and are stated as open rather than resolved:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                the retention period for clinical records (§9), which no scheduled job currently
                enforces;
              </li>
              <li>
                the completeness of account deletion (§10), which today leaves journal entries,
                therapist notes, appointments and audit rows in place;
              </li>
              <li>
                the transfer basis for dictation audio handled by platform speech recognisers and
                for invitation emails sent through Brevo (§8);
              </li>
              <li>
                the designation of a named Grievance Officer and the formal response timeline the
                DPDP rules will require, beyond the mailbox and the 30-day target in §15;
              </li>
              <li>
                the contractual position on model-provider training data (§4), which rests on the
                provider&apos;s published terms rather than on anything we can verify technically.
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
            OKUVU · Privacy Policy v{POLICY_VERSION} · Last updated{' '}
            <time dateTime={LAST_UPDATED}>{LAST_UPDATED}</time>
          </p>
          <p className="mt-2">
            Questions:{' '}
            <a className="text-royal-purple underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
