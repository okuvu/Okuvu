import { randomUUID } from 'node:crypto';
import { prisma } from './prisma.js';

export type LogFn = (obj: Record<string, unknown>, msg: string) => void;

export type DeleteAccountResult =
  | { status: 'ok'; userId: string }
  | { status: 'user_not_found' }
  | { status: 'already_deleted' }
  | { status: 'active_session' };

/**
 * Every table that holds a row belonging to one data subject, in the order it
 * must be ERASEd. Children before parents: Reminder -> Homework, Turn/
 * SessionSummary -> SessionLog, and the whole set -> User.
 *
 * Exported so the test suite can assert the erasure path covers exactly the
 * subject-referencing tables in `packages/prisma/schema.prisma` — the E16-S7
 * probe found nine of them (JournalEntry, TherapistNote, Homework, Reminder,
 * Appointment, ClinicalAccessLog, TherapistClient, UserMemory, InviteToken)
 * plus one the probe itself missed (UserToolPreference) left behind, because
 * the list lived only in this function's body.
 */
export const SUBJECT_TABLES = [
  'governanceLog',
  'reminder',
  'userToolPreference',
  'journalEntry',
  'moodLog',
  'emergencyContact',
  'userMemory',
  'engagementProfile',
  'safetyState',
  'clinicalConfig',
  'therapistNote',
  'clinicalAccessLog',
  'appointment',
  'inviteToken',
  'therapistClient',
  'homework',
  'turn',
  'sessionSummary',
  'sessionLog',
  'betaConsent',
  'waitlistEntry',
] as const;

/**
 * Erase one data subject (DPDP Act 2023 §12 — right to erasure).
 *
 * Children of `User` are declared `onDelete: Cascade` in the Prisma schema
 * (migration 20261029120000_deletion_cascade_on_user), but the tombstone row
 * is RETAINED here rather than deleted, so the cascade never fires on this
 * path: the explicit, ordered deletes below are what actually erase the
 * subject's rows. Both halves exist on purpose — the schema constraint means a
 * later hard-delete can't leak a clinical record either.
 *
 * Deliberately NOT erased:
 *  - `AuditEvent` — the append-only, hash-chained governance ledger. Its rows
 *    carry no email, no name and no user id (object is `turn:<uuid>` or
 *    `turn:<sessionId>:<n>`), and rewriting or removing a row breaks
 *    `verifyAuditChain` for every later row (E17-S4). The turn/session ids it
 *    names stop existing with this transaction, so the retained row is an
 *    opaque event, not a link to a person. Retained for legal/forensic
 *    retention.
 *  - the tombstone `User` row itself — kept only as the `deleted_at`-stamped
 *    anchor that stops a re-signup from silently resurrecting the account, and
 *    stripped of every direct identifier (email, full_name, phone_number,
 *    date_of_birth, gender, auth_subject).
 */
export async function deleteAccount(
  authSubject: string,
  log?: { info: LogFn },
): Promise<DeleteAccountResult> {
  const user = await prisma.user.findUnique({
    where: { auth_subject: authSubject },
    select: {
      id: true,
      deleted_at: true,
      email: true,
      phone_number: true,
      auth_subject: true,
    },
  });

  if (!user) {
    return { status: 'user_not_found' };
  }

  if (user.deleted_at) {
    return { status: 'already_deleted' };
  }

  const activeSession = await prisma.sessionLog.findFirst({
    where: { user_id: user.id, session_ended_at: null },
    select: { id: true },
  });

  if (activeSession) {
    return { status: 'active_session' };
  }

  const erased = await prisma.$transaction(
    async (tx) => {
      const counts: Record<string, number> = {};
      const record = (table: string, result: { count: number }) => {
        counts[table] = result.count;
      };

      // Session ids first: GovernanceLog has no FK to "User" (its session_id is
      // a plain string) so it has to be reached through the subject's sessions
      // before those sessions are deleted.
      const sessions = await tx.sessionLog.findMany({
        where: { user_id: user.id },
        select: { id: true },
      });
      const sessionIds = sessions.map((s) => s.id);

      if (sessionIds.length > 0) {
        record(
          'governanceLog',
          await tx.governanceLog.deleteMany({
            where: { session_id: { in: sessionIds } },
          }),
        );
      }

      // Reminder -> Homework is a nullable relation (ON DELETE SET NULL), so
      // reminders must go before the homework they point at: a reminder row is
      // itself the subject's data either way.
      record(
        'reminder',
        await tx.reminder.deleteMany({
          where: {
            OR: [{ user_id: user.id }, { homework: { client_user_id: user.id } }],
          },
        }),
      );
      record(
        'userToolPreference',
        await tx.userToolPreference.deleteMany({ where: { user_id: user.id } }),
      );
      record(
        'journalEntry',
        await tx.journalEntry.deleteMany({ where: { user_id: user.id } }),
      );
      record('moodLog', await tx.moodLog.deleteMany({ where: { user_id: user.id } }));
      record(
        'emergencyContact',
        await tx.emergencyContact.deleteMany({ where: { user_id: user.id } }),
      );
      record('userMemory', await tx.userMemory.deleteMany({ where: { user_id: user.id } }));
      record(
        'engagementProfile',
        await tx.engagementProfile.deleteMany({ where: { user_id: user.id } }),
      );
      record('safetyState', await tx.safetyState.deleteMany({ where: { user_id: user.id } }));
      record(
        'clinicalConfig',
        await tx.clinicalConfig.deleteMany({ where: { user_id: user.id } }),
      );
      record(
        'therapistNote',
        await tx.therapistNote.deleteMany({ where: { client_user_id: user.id } }),
      );
      record(
        'clinicalAccessLog',
        await tx.clinicalAccessLog.deleteMany({ where: { client_user_id: user.id } }),
      );
      record(
        'appointment',
        await tx.appointment.deleteMany({ where: { client_user_id: user.id } }),
      );
      record(
        'inviteToken',
        await tx.inviteToken.deleteMany({ where: { client_user_id: user.id } }),
      );
      record(
        'therapistClient',
        await tx.therapistClient.deleteMany({ where: { client_user_id: user.id } }),
      );
      record('homework', await tx.homework.deleteMany({ where: { client_user_id: user.id } }));

      if (sessionIds.length > 0) {
        record(
          'turn',
          await tx.turn.deleteMany({
            where: { OR: [{ user_id: user.id }, { session_id: { in: sessionIds } }] },
          }),
        );
        record(
          'sessionSummary',
          await tx.sessionSummary.deleteMany({
            where: { OR: [{ user_id: user.id }, { session_id: { in: sessionIds } }] },
          }),
        );
      } else {
        record('turn', await tx.turn.deleteMany({ where: { user_id: user.id } }));
        record(
          'sessionSummary',
          await tx.sessionSummary.deleteMany({ where: { user_id: user.id } }),
        );
      }
      record('sessionLog', await tx.sessionLog.deleteMany({ where: { user_id: user.id } }));

      // Two tables reference the subject by a loosely-typed string rather than
      // by FK. `BetaConsent.user_ref` is documented as a user reference;
      // `WaitlistEntry` is keyed by the email/phone the person typed before
      // they had an account. Only the identifiers actually present are used —
      // an empty value is never turned into `IS NULL`, which would match rows
      // belonging to everybody else.
      const subjectRefs = [user.id, user.email, user.auth_subject].filter(
        (v): v is string => typeof v === 'string' && v.length > 0,
      );
      record(
        'betaConsent',
        await tx.betaConsent.deleteMany({ where: { user_ref: { in: subjectRefs } } }),
      );

      const waitlistIdentifiers = [
        user.email ? { email: user.email } : null,
        user.phone_number ? { phone_number: user.phone_number } : null,
      ].filter((v): v is { email: string } | { phone_number: string } => v !== null);
      if (waitlistIdentifiers.length > 0) {
        record(
          'waitlistEntry',
          await tx.waitlistEntry.deleteMany({ where: { OR: waitlistIdentifiers } }),
        );
      }

      // Tombstone: the row survives so `deleted_at` can answer "this account
      // was deleted"; every identifier on it is destroyed. `phone_number` is
      // NOT NULL in the schema, hence '' rather than null.
      await tx.user.update({
        where: { id: user.id },
        data: {
          phone_number: '',
          email: null,
          full_name: null,
          date_of_birth: null,
          gender: null,
          auth_subject: `deleted-${randomUUID()}`,
          deleted_at: new Date(),
        },
      });

      return counts;
    },
    // Interactive transaction: the default 5s is not enough for a subject with
    // a long chat history (Turn is the big table). 60s keeps a large erasure
    // atomic instead of half-applied.
    { maxWait: 10_000, timeout: 60_000 },
  );

  if (log) {
    log.info({ event: 'account_deleted', user_id: user.id, erased }, 'Account deleted');
  }

  return { status: 'ok', userId: user.id };
}
