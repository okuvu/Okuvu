/**
 * The Hinglish review document, generated from the catalogue.
 *
 * The owner asked for the translations as a separate document he can read. It is
 * generated rather than written by hand so it can never describe a worksheet
 * differently from the app: if the body changes, this file changes with it, and
 * the test that keeps them in step fails the build when they drift.
 *
 * Run (writes the file): WRITE_HINGLISH_MD=1 npx vitest run __tests__/hinglish.test.ts
 */
import { LISTABLE_CATALOGUE } from '../worksheets/index';
import type { CatalogueEntry } from '../worksheets/types';
import type { WorksheetContent, WorksheetField } from '../worksheet';

export const HINGLISH_PATH = 'docs/exercise-library/05-hinglish-for-review.md';

function fieldLines(field: WorksheetField): string[] {
  const lines: string[] = [];
  const label =
    field.type === 'instruction'
      ? 'Text'
      : field.type === 'closing_reflection'
        ? 'Closing reflection'
        : field.type.replace(/_/g, ' ');
  lines.push(`- **${label}** — ${field.prompt}`);
  if (field.helper) lines.push(`  - helper: ${field.helper}`);
  if (field.example) lines.push(`  - example: ${field.example}`);
  if ('options' in field) {
    for (const option of field.options) {
      lines.push(
        `  - option \`${option.value}\`: ${option.label}${option.description ? ` — ${option.description}` : ''}`,
      );
    }
  }
  if ('feelings' in field) {
    for (const feeling of field.feelings) {
      lines.push(
        `  - feeling \`${feeling.id}\`: ${feeling.label}${feeling.parent ? ` (under ${feeling.parent})` : ''}`,
      );
    }
  }
  if ('columns' in field) {
    for (const column of field.columns) {
      lines.push(`  - column \`${column.id}\`: ${column.label} (${column.type})`);
    }
  }
  if ('strengthPrompt' in field && field.strengthPrompt) {
    lines.push(`  - strength prompt: ${field.strengthPrompt}`);
  }
  return lines;
}

function bodyLines(content: WorksheetContent | null, lang: 'English' | 'Hinglish'): string[] {
  if (!content) return [`_No ${lang} body._`];
  const lines: string[] = [];
  if (content.intro) lines.push(`> ${content.intro}`, '');
  for (const field of content.fields) lines.push(...fieldLines(field));
  if (content.closing?.text) lines.push('', `> ${content.closing.text}`);
  for (const button of content.closing?.buttons ?? []) {
    lines.push(`- button: ${button.label} (\`${button.action}\`)`);
  }
  return lines;
}

export function buildHinglishDoc(): string {
  const out: string[] = [];

  out.push(
    '# Hinglish worksheet wording — for review, NOT approved',
    '',
    'Generated from the catalogue in `packages/shared-types/worksheets`. Do not edit by hand:',
    'change the catalogue, then regenerate.',
    '',
    '**Status: not approved.** The English wording was approved by Dr. Shubhangi Goswami',
    '(clinical lead) on 9 November 2026. These Hinglish versions are translations of that',
    'English and need her separate approval. They are stored with the worksheets but the app',
    'does not serve them: `HINGLISH_RELEASED` is `false`, so a client always receives English',
    'until you approve this document.',
    '',
    'How to review: each worksheet shows the Hinglish the client would read, with the English',
    'prompt beside it where the two need comparing. Option ids are the stored values and never',
    'change with language, so a client can switch language and keep their answers.',
    '',
    '---',
    '',
  );

  for (const entry of LISTABLE_CATALOGUE as CatalogueEntry[]) {
    out.push(`## ${entry.label}`, '');
    out.push(`- id: \`${entry.tool_id}\``);
    out.push(`- Library description (English): ${entry.summary}`);
    out.push(`- Library description (Hinglish): ${entry.summary_hi ?? '_missing_'}`);
    out.push(`- who can open it: ${entry.access_mode}`);
    out.push('');
    out.push('### Hinglish', '');
    out.push(...bodyLines(entry.content_hi, 'Hinglish'));
    out.push('', '### English (approved, for comparison)', '');
    out.push(...bodyLines(entry.content_en, 'English'));
    out.push('', '---', '');
  }

  return out.join('\n');
}
