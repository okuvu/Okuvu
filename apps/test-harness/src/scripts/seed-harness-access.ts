import { PrismaClient, HarnessRole } from '@evia/prisma';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function isHarnessRole(value: string): value is HarnessRole {
  return (Object.values(HarnessRole) as string[]).includes(value);
}

async function main() {
  const [email, role, environmentsArg] = process.argv.slice(2);

  if (!email || !role || !environmentsArg) {
    console.error(
      'Usage: npx tsx src/scripts/seed-harness-access.ts <email> <role: PI|RATER|ENGINEER> <environments: comma-separated e.g. sandbox,staging,beta>',
    );
    process.exit(1);
  }

  if (!isHarnessRole(role)) {
    console.error(`Invalid role "${role}". Must be one of: PI, RATER, ENGINEER`);
    process.exit(1);
  }

  const environments = environmentsArg
    .split(',')
    .map((env) => env.trim())
    .filter(Boolean);

  const access = await prisma.testHarnessAccess.upsert({
    where: { email },
    update: { role, environments },
    create: { email, role, environments },
  });

  console.log(
    `TestHarnessAccess seeded: ${access.email} (${access.role}, [${access.environments.join(', ')}])`,
  );
  await prisma.$disconnect();
}

main();
