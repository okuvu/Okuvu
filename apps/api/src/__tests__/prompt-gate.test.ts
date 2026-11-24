/**
 * The strict prompt gate, asserted against the evidence files themselves.
 *
 * Owner's instruction, 24 Nov 2026: "Make it strict: no prompt becomes the
 * default unless it passes. Keep the current live prompt as the default until
 * the new one passes."
 *
 * A manifest that only says `state: 'passed'` is a comment with extra steps. So
 * every entry with evidence is checked against the run report it names: the file
 * must exist, its `gate_met` must agree with the state, and — for a pass — it
 * must have scored the same version. That is what makes "passed" a fact rather
 * than an opinion, and it is why re-labelling a failed run as a pass is a test
 * failure rather than an edit nobody notices.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { A2_PROMPT, A2_PROMPT_VERSION } from '../prompts/index.js';
import {
  PROMPT_GATE,
  defaultPromptVersion,
  isEligibleAsDefault,
  type PromptGateEntry,
} from '../prompts/gate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = resolve(__dirname, '..', '..');
const REPO_ROOT = resolve(API_ROOT, '..', '..');

function evidence(entry: PromptGateEntry): Record<string, unknown> | null {
  if (!entry.evidence) return null;
  const path = join(REPO_ROOT, entry.evidence);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

describe('the prompt gate', () => {
  it('never makes a failed or unrun prompt the default', () => {
    const chosen = PROMPT_GATE.find((entry) => entry.version === A2_PROMPT_VERSION);
    expect(chosen, `no gate entry for ${A2_PROMPT_VERSION}`).toBeDefined();
    expect(chosen!.state === 'passed' || chosen!.state === 'in_production').toBe(true);
    expect(isEligibleAsDefault(chosen!)).toBe(true);
  });

  it('agrees with every evidence report it cites', () => {
    for (const entry of PROMPT_GATE) {
      if (entry.state === 'not_run') {
        expect(entry.evidence, `${entry.version}: not_run must not cite a run`).toBeNull();
        continue;
      }
      const report = evidence(entry);
      expect(report, `${entry.version}: evidence ${entry.evidence} is missing or unreadable`).not.toBeNull();

      const gateMet = (report as { gate_met?: unknown }).gate_met;
      expect(typeof gateMet, `${entry.version}: gate_met missing`).toBe('boolean');

      if (entry.state === 'passed') {
        expect(gateMet, `${entry.version}: marked passed but the run says gate_met=false`).toBe(true);
      }
      if (entry.state === 'failed') {
        expect(gateMet, `${entry.version}: marked failed but the run says gate_met=true`).toBe(false);
      }

      // A pass has to have scored the version it claims to pass.
      const prompt = (report as { prompt?: { version?: string } }).prompt;
      if (prompt?.version) {
        expect(prompt.version, `${entry.version}: report scored ${prompt.version}`).toBe(entry.version);
      }
    }
  });

  it('is grandfathered only for the prompt that is actually in production', () => {
    const grandfathered = PROMPT_GATE.filter((entry) => entry.state === 'in_production');
    // Exactly one, and it is the version served today: the exception exists for
    // the prompt clients are already talking to, not as a way around the gate.
    expect(grandfathered).toHaveLength(1);
    expect(grandfathered[0].version).toBe(A2_PROMPT_VERSION);
  });

  it('picks the newest eligible entry, appending order is promotion order', () => {
    const versions = PROMPT_GATE.map((entry) => entry.version);
    const chosen = defaultPromptVersion();
    const chosenIndex = versions.indexOf(chosen);
    for (let i = chosenIndex + 1; i < versions.length; i += 1) {
      expect(isEligibleAsDefault(PROMPT_GATE[i]), `${versions[i]} after ${chosen} is eligible`).toBe(false);
    }
  });

  it('throws rather than guessing when nothing is eligible', () => {
    expect(() =>
      defaultPromptVersion([
        { version: 'vX', state: 'failed', evidence: null, date: '2026-11-24', note: 'x' },
      ]),
    ).toThrow(/no A2 prompt is eligible/);
  });

  it('serves a file whose header names its own version', () => {
    expect(A2_PROMPT).toContain(`Version: ${A2_PROMPT_VERSION} |`);
    expect(A2_PROMPT).toContain(`A2 Support Companion · ${A2_PROMPT_VERSION}`);
  });

  it('keeps v2.7 in the repo and scoreable while it is not the default', () => {
    const v27 = PROMPT_GATE.find((entry) => entry.version === 'v2.7');
    expect(v27).toBeDefined();
    expect(v27!.state).toBe('failed');
    expect(existsSync(join(API_ROOT, 'src', 'prompts', 'a2-okuvu-v2.7.txt'))).toBe(true);
    // Its owner-approved worksheet paragraph is still there — a failed score
    // does not delete approved wording, it only keeps it out of the default.
    expect(readFileSync(join(API_ROOT, 'src', 'prompts', 'a2-okuvu-v2.7.txt'), 'utf-8')).toContain(
      'Worksheets. Some of the Library',
    );
  });

  it('has no entry that claims a pass with no run behind it', () => {
    for (const entry of PROMPT_GATE) {
      if (entry.state === 'passed') {
        expect(entry.evidence, `${entry.version}: passed with no evidence`).not.toBeNull();
      }
    }
  });
});
