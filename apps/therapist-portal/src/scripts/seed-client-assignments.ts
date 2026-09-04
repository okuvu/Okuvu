import { PrismaClient } from '@evia/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnvFile } from 'node:process';
import { Pool } from 'pg';

interface Pair {
  therapistEmail: string;
  clientUserId: string;
}

function loadEnv(): void {
  // Prisma 7 + tsx does not auto-load .env. Load it explicitly without
  // overriding any DATABASE_URL already present in the environment.
  for (const candidate of ['.env', 'apps/therapist-portal/.env']) {
    try {
      loadEnvFile(candidate);
      return;
    } catch {
      // Try the next candidate. No-op when neither exists.
    }
  }
}

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    throw new Error(
      'DATABASE_URL is not set. Configure apps/therapist-portal/.env first.',
    );
  }
  const pool = new Pool({ connectionString: url });
  pool.on('error', (err) => {
    console.error('Unexpected error on idle Postgres client', err);
  });
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

function parsePairs(args: string[]): Pair[] {
  const pairs: Pair[] = [];
  for (const arg of args) {
    const idx = arg.indexOf('=');
    if (idx === -1) {
      throw new Error(
        `Invalid pair argument: "${arg}". Expected therapistEmail=clientUserId[,clientUserId]`,
      );
    }
    const therapistEmail = arg.slice(0, idx);
    const clientIds = arg
      .slice(idx + 1)
      .split(',')
      .filter(Boolean);
    if (!therapistEmail || clientIds.length === 0) {
      throw new Error(
        `Invalid pair argument: "${arg}". Expected therapistEmail=clientUserId[,clientUserId]`,
      );
    }
    for (const clientUserId of clientIds) {
      pairs.push({ therapistEmail, clientUserId });
    }
  }
  return pairs;
}

async function main() {
  const pairs = parsePairs(process.argv.slice(2));
  if (pairs.length === 0) {
    console.error(
      'Usage: npx tsx src/scripts/seed-client-assignments.ts <email>=<userId>[,<userId>]',
    );
    process.exit(1);
  }

  loadEnv();
  const prisma = createClient();

  try {
    let created = 0;
    for (const { therapistEmail, clientUserId } of pairs) {
      const therapist = await prisma.therapist.findUnique({
        where: { email: therapistEmail },
      });
      if (!therapist) {
        console.error(
          `SKIP therapist "${therapistEmail}": not found — run seed-therapist.ts first`,
        );
        continue;
      }
      const client = await prisma.user.findUnique({
        where: { id: clientUserId },
      });
      if (!client) {
        console.error(`SKIP client "${clientUserId}": user not found`);
        continue;
      }
      await prisma.therapistClient.upsert({
        where: {
          therapist_id_client_user_id: {
            therapist_id: therapist.id,
            client_user_id: client.id,
          },
        },
        update: {},
        create: { therapist_id: therapist.id, client_user_id: client.id },
      });
      created += 1;
      console.log(`Assigned ${clientUserId} -> ${therapistEmail}`);
    }
    console.log(`Assignments created: ${created}/${pairs.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main();