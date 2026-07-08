import { PrismaClient } from '@evia/prisma';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as { prisma?: PrismaClient };

function prismaClientSingleton(): PrismaClient | null {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    return null;
  }
  if (!globalForPrisma.prisma) {
    const pool = new Pool({ connectionString: url });
    const adapter = new PrismaPg(pool);
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}

export const prisma = prismaClientSingleton();