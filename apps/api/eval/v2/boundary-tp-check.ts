import { readFileSync } from 'node:fs';
import { hasCrisisLanguage, hasThirdPartyCrisisLanguage } from '../../src/agents/a1/crisis-keywords.js';

const set = JSON.parse(readFileSync(process.argv[2], 'utf-8')) as { items: Array<{ id: string; message: string }> };
for (const it of set.items) {
  const self = hasCrisisLanguage(it.message);
  const third = hasThirdPartyCrisisLanguage(it.message);
  if (self || third) console.log(`${it.id}\tself=${self}\tthird=${third}\t${it.message}`);
}
console.log('check complete');
