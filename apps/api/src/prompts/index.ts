import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Kept in sync with the filename by hand — there is no other source of truth for this version string (see prompt-hash.ts's manifest, which duplicates it the same way). */
export const A2_MVP_PROMPT_VERSION = 'v1.0';

export const A2_MVP_PROMPT = readFileSync(
  join(__dirname, 'a2-mvp-v1.0.txt'),
  'utf-8',
);

export const A2_ONBOARDING_PROMPT = readFileSync(
  join(__dirname, 'a2-onboarding-v1.0.txt'),
  'utf-8',
);
