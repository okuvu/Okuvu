import type { Prisma } from '@prisma/client';

export function getISTDateString(): string {
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;
  return `${year}-${month}-${day}`;
}

export function getDailyLimit(tier: 'SD' | 'TL'): number {
  const key = tier === 'SD' ? 'SESSION_LIMIT_SD_DAILY' : 'SESSION_LIMIT_TL_DAILY';
  return parseInt(process.env[key] ?? '', 10);
}

export function validateSessionConfig(): void {
  const sd = parseInt(process.env.SESSION_LIMIT_SD_DAILY ?? '', 10);
  const tl = parseInt(process.env.SESSION_LIMIT_TL_DAILY ?? '', 10);
  if (isNaN(sd) || sd < 1) {
    throw new Error('SESSION_LIMIT_SD_DAILY must be a positive integer');
  }
  if (isNaN(tl) || tl < 1) {
    throw new Error('SESSION_LIMIT_TL_DAILY must be a positive integer');
  }
}

interface AcquireResult {
  allowed: boolean;
  sessions_used: number;
}

export async function tryAcquireSessionSlot(
  tx: Prisma.TransactionClient,
  userId: string,
  tier: 'SD' | 'TL',
  dateIst: string,
  dailyLimit: number,
): Promise<AcquireResult> {
  const [row] = await tx.$queryRaw<Array<{ allowed: boolean; sessions_used: bigint }>>`
    WITH attempt AS (
      INSERT INTO "SessionLimit" (id, user_id, tier, date_ist, sessions_used)
      VALUES (gen_random_uuid(), ${userId}, ${tier}::"Tier", ${dateIst}::date, 1)
      ON CONFLICT (user_id, date_ist)
      DO UPDATE SET sessions_used = "SessionLimit".sessions_used + 1
      WHERE "SessionLimit".sessions_used < ${dailyLimit}
      RETURNING sessions_used
    )
    SELECT true AS allowed, sessions_used FROM attempt
    UNION ALL
    SELECT false AS allowed, sessions_used FROM "SessionLimit"
    WHERE user_id = ${userId} AND date_ist = ${dateIst}::date
      AND NOT EXISTS (SELECT 1 FROM attempt)
    LIMIT 1
  `;
  return { allowed: row.allowed, sessions_used: Number(row.sessions_used) };
}
