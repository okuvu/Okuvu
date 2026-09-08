import { PrismaClient } from '@okuvu/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnvFile } from 'node:process';
import { Pool } from 'pg';

function loadEnv(): void {
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

async function main() {
  const emails = process.argv.slice(2);

  if (emails.length === 0) {
    console.error('Usage: npx tsx src/scripts/seed-therapists-batch.ts <email1> <email2> ...');
    console.error('   or: npx tsx src/scripts/seed-therapists-batch.ts < file-with-emails.txt');
    process.exit(1);
  }

  loadEnv();
  const prisma = createClient();

  let seeded = 0;

  try {
    for (const email of emails) {
      await prisma.therapist.upsert({
        where: { email },
        update: {},
        create: { email },
      });
      console.log(`Seeded: ${email}`);
      seeded++;
    }

    console.log(`\nDone: ${seeded} therapists processed.`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
