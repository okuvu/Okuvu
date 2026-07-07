import { PrismaClient } from '@evia/prisma';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx tsx src/scripts/seed-therapist.ts <email>');
    process.exit(1);
  }

  const therapist = await prisma.therapist.upsert({
    where: { email },
    update: {},
    create: { email },
  });

  console.log(`Therapist seeded: ${therapist.email} (${therapist.id})`);
  await prisma.$disconnect();
}

main();
