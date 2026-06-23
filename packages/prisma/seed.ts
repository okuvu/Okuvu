import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// 1. Load the .env file into process.env
config();

// 2. Create a standard Postgres connection pool using your Neon URL
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 3. Wrap that pool in Prisma's Postgres Adapter
const adapter = new PrismaPg(pool);

// 4. Pass the adapter to the Prisma Client (The Prisma 7 way!)
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  const carePlans: ('CP1' | 'CP2' | 'CP3')[] = ['CP1', 'CP2', 'CP3'];

  for (let i = 0; i < carePlans.length; i++) {
    // Wrap both creates in an interactive transaction
    await prisma.$transaction(async (tx) => {
      // 1. Create the mock user
      const user = await tx.user.create({
        data: {
          firebase_uid: `mock-firebase-uid-${i + 1}`,
          phone_number: `+1555000000${i + 1}`,
        },
      });

      // 2. Assign them the corresponding Clinical Config
      await tx.clinicalConfig.create({
        data: {
          user_id: user.id,
          care_plan_id: carePlans[i],
          assignment_state: 'provisional',
        },
      });
    });
  }

  console.log('✅ Successfully seeded 3 test users!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });