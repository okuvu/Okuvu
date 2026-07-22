import { PrismaClient } from '@evia/prisma';

const prisma = new PrismaClient();

async function main() {
  const emails = process.argv.slice(2);

  if (emails.length === 0) {
    console.error('Usage: npx tsx src/scripts/seed-therapists-batch.ts <email1> <email2> ...');
    console.error('   or: npx tsx src/scripts/seed-therapists-batch.ts < file-with-emails.txt');
    process.exit(1);
  }

  let seeded = 0;

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
  await prisma.$disconnect();
}

main();
