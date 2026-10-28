import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  for (let i = 1; i <= 50; i++) {
    const uid = `load-test-vu-${i}`;
    await prisma.user.upsert({
      where: { auth_subject: uid },
      update: {},
      create: {
        auth_subject: uid,
        phone_number: `+155590${String(i).padStart(4, '0')}`,
        clinical_config: {
          create: { care_plan_id: 'CP1' },
        },
        engagement_profile: {
          create: {
            consent_1: true,
            consent_2: true,
            consent_3: true,
            consent_4: true,
          },
        },
      },
    });
  }
  console.log('Seeded 50 load-test users');
}

main().catch(console.error).finally(() => prisma.$disconnect());
