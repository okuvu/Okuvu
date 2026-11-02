/**
 * Seed one REAL safety flag, so the Dashboard's Safety column, the banner and
 * the Overview Safety card can be seen working against an actual row.
 *
 * This is the "live half" of the acceptance criterion. The other half is
 * `src/server/__tests__/safety.test.ts`, which renders a fixture through the
 * real procedures with no database. Neither is a substitute for the other: the
 * test proves the mapping, this proves the row, the query and the UI agree on
 * a deployed database.
 *
 * The row it writes is exactly what `apps/api/src/lib/safety-flags.ts` writes
 * when a client is served the S4 crisis card — level, source, screen-shown
 * flag, no message content. It does NOT fabricate a turn or a conversation:
 * `turn_id` stays null, so it can never be mistaken for a real classified turn
 * and cannot collide with the per-turn unique index.
 *
 * Usage (against dev RDS, through the in-VPC task — see
 * scripts/in-vpc-db-task.sh):
 *
 *   pnpm exec tsx src/scripts/seed-safety-flag.ts \
 *     --client-label "A." --level S4
 *
 * --client-label matches TherapistClient.client_label (exact). --level is S3
 * or S4, default S4. --therapist-email narrows the search when two therapists
 * use the same label. --clean removes the flags this script wrote (identified
 * by `source = 'seed_s4_demo'`).
 */

import { PrismaClient } from '@okuvu/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnvFile } from 'node:process';
import { Pool } from 'pg';

/** Marks rows this script created, so --clean can find exactly them and
 * nothing a real client turn wrote. */
const SEED_SOURCE = 'seed_s4_demo';

function loadEnv(): void {
  for (const candidate of ['.env', 'apps/therapist-portal/.env']) {
    try {
      loadEnvFile(candidate);
      return;
    } catch {
      // Try the next candidate.
    }
  }
}

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    throw new Error('DATABASE_URL is not set. Configure apps/therapist-portal/.env first.');
  }
  const pool = new Pool({ connectionString: url });
  pool.on('error', (err) => {
    console.error('Unexpected error on idle Postgres client', err);
  });
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

function arg(args: string[], name: string): string | null {
  const index = args.indexOf(`--${name}`);
  if (index === -1 || index + 1 >= args.length) return null;
  return args[index + 1];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const clientLabel = arg(args, 'client-label');
  const therapistEmail = arg(args, 'therapist-email');
  const levelArg = (arg(args, 'level') ?? 'S4').toUpperCase();
  const clean = args.includes('--clean');

  if (levelArg !== 'S3' && levelArg !== 'S4') {
    throw new Error('--level must be S3 or S4');
  }

  const prisma = createClient();
  try {
    if (clean) {
      const removed = await prisma.safetyFlag.deleteMany({ where: { source: SEED_SOURCE } });
      console.log(`Removed ${removed.count} seeded flag(s).`);
      return;
    }

    if (!clientLabel) {
      const available = await prisma.therapistClient.findMany({
        where: { ended_at: null },
        select: { client_label: true, therapist: { select: { email: true } } },
        take: 20,
      });
      console.error('--client-label is required. Current active relationships:');
      for (const row of available) {
        console.error(`  ${row.client_label}  (${row.therapist.email})`);
      }
      process.exitCode = 1;
      return;
    }

    const assignment = await prisma.therapistClient.findFirst({
      where: {
        client_label: clientLabel,
        ended_at: null,
        ...(therapistEmail ? { therapist: { email: therapistEmail } } : {}),
      },
      select: { client_user_id: true, client_label: true, therapist: { select: { email: true } } },
    });

    if (!assignment) {
      console.error(`No active relationship with the label "${clientLabel}".`);
      process.exitCode = 1;
      return;
    }

    const flag = await prisma.safetyFlag.create({
      data: {
        user_id: assignment.client_user_id,
        level: levelArg as 'S3' | 'S4',
        occurred_at: new Date(),
        crisis_screen_shown: true,
        source: SEED_SOURCE,
      },
      select: { id: true, level: true, occurred_at: true },
    });

    console.log(
      `Seeded ${flag.level} flag ${flag.id} at ${flag.occurred_at.toISOString()} ` +
        `for "${assignment.client_label}" (therapist ${assignment.therapist.email}).`,
    );
    console.log('Check: /dashboard for the banner and the Safety column; ');
    console.log(`       /clients/${assignment.client_user_id}#safety for the Safety card.`);
    console.log('Clean up with: --clean');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
