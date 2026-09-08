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
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx tsx src/scripts/seed-therapist.ts <email>');
    process.exit(1);
  }

  loadEnv();
  const prisma = createClient();

  try {
    const therapist = await prisma.therapist.upsert({
      where: { email },
      update: {},
      create: { email },
    });

    console.log(`Therapist seeded: ${therapist.email} (${therapist.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
