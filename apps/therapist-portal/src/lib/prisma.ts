import { PrismaClient } from '@evia/prisma';

const globalForPrisma = globalThis as { prisma?: PrismaClient };

function prismaClientSingleton(): PrismaClient | null {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    return null;
  }
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}

export const prisma = prismaClientSingleton();
