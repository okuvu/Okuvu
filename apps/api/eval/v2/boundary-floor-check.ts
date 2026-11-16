/**
 * Pre-screen the boundary set against the deterministic S4 keyword floor.
 * Any item whose text trips `hasCrisisLanguage()` is escalated to S4 by the
 * orchestrator for *every* model, so it cannot measure a model difference.
 */
import { readFileSync } from 'node:fs';
import { hasCrisisLanguage } from '../../src/agents/a1/crisis-keywords.js';

const set = JSON.parse(readFileSync(process.argv[2], 'utf-8')) as {
  items: Array<{ id: string; message: string; band: { min: string; max: string } }>;
};

let tripped = 0;
for (const item of set.items) {
  const fires = hasCrisisLanguage(item.message);
  if (fires) tripped++;
  console.log(`${item.id}\t${item.band.min}-${item.band.max}\t${fires ? 'FLOOR-FIRES' : 'clean'}\t${item.message}`);
}
console.log(`\n${set.items.length} items, ${tripped} trip the deterministic S4 floor`);
