import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../../.env') });

import { getPrisma } from '../lib/prisma.js';
import { generateEmbedding } from '../lib/embedding.js';

const BATCH_DELAY_MS = 100;

async function main() {
  console.log('[Backfill] Starting embedding backfill...');

  const summaries = await getPrisma().sessionSummary.findMany({
    where: {
      status: 'COMPLETED',
      summary_text: { not: null },
    },
    select: {
      session_id: true,
      summary_text: true,
    },
  });

  console.log(`[Backfill] Found ${summaries.length} completed sessions`);

  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const summary of summaries) {
    const summaryText = summary.summary_text!;

    try {
      const embedding = await generateEmbedding(summaryText);

      const updated = await getPrisma().$executeRaw`
        UPDATE "SessionLog"
        SET summary_embedding = ${JSON.stringify(embedding)}::vector
        WHERE id = ${summary.session_id}
          AND summary_embedding IS NULL
      `;

      if (updated > 0) {
        succeeded++;
        console.log(`[Backfill] Session ${summary.session_id}: embedding stored`);
      } else {
        skipped++;
        console.log(`[Backfill] Session ${summary.session_id}: already has embedding, skipped`);
      }
    } catch (err) {
      failed++;
      console.error(
        `[Backfill] Session ${summary.session_id}: failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }

  console.log('\n[Backfill] Complete');
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Skipped (already had embedding): ${skipped}`);
  console.log(`  Failed: ${failed}`);

  await getPrisma().$disconnect();
}

main().catch((err) => {
  console.error('[Backfill] Fatal error:', err);
  process.exit(1);
});
