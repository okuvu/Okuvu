import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';

/**
 * E17-S3 — the roster endpoint, exercised over real HTTP.
 *
 * Acceptance: "the roster endpoint lists each [agent] with its identifier; every listed agent has
 * at least one passing test; agents outside the roster definition are absent."
 *
 * So this file drives `buildApp()` and `app.inject()` (a real Fastify request through the real
 * middleware chain), and then checks the filesystem for the two things a JSON body cannot show:
 * that each id has code, and that each id has a test file with at least one test. "Passing" is
 * established by running those files, not by reading them — the evidence file records the
 * per-file run.
 *
 * Nothing here mocks the roster. If `agents/roster.ts` grows an agent, these tests see it.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = join(HERE, '..', 'agents');
const TEST_DIR = HERE;

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({ prisma: {} }));
vi.mock('../lib/redis.js', () => ({ getRedisClient: () => null }));

import { buildApp } from '../app.js';
import { agentsRoute, buildRosterResponse, ROSTER_SCHEMA_VERSION } from '../routes/agents.js';
import { ROSTER, ROSTER_IDS, validateRoster, type AgentSpec } from '../agents/roster.js';

/** Files the roster id owns, by the repo's existing naming (`a8-router.ts`, `a14/scoring.ts`). */
function filesFor(id: string, dir: string): string[] {
  const lower = id.toLowerCase();
  return readdirSync(dir).filter((name) => {
    const n = name.toLowerCase();
    if (!(n.startsWith(`${lower}.`) || n.startsWith(`${lower}-`))) return false;
    return statSync(join(dir, name)).isFile();
  });
}

function testFilesFor(id: string): string[] {
  const lower = id.toLowerCase();
  return readdirSync(TEST_DIR).filter(
    (name) =>
      name.endsWith('.test.ts') &&
      (name.startsWith(`${lower}.`) || name.startsWith(`${lower}-`)),
  );
}

function hasAtLeastOneTest(source: string): boolean {
  // `it(` / `it.each(` / `test(` — a file that only imports and mocks proves nothing.
  return /(^|\s)(it|test)(\.\w+)?\s*\(/m.test(source);
}

async function getRoster() {
  const app = buildApp();
  const response = await app.inject({
    method: 'GET',
    url: '/agents/roster',
    headers: { authorization: 'Bearer ignored-under-bypass' },
  });
  await app.close();
  return { statusCode: response.statusCode, body: response.json(), raw: response.body };
}

describe('E17-S3: GET /agents/roster', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns 200 and lists every roster agent with its stable identifier', async () => {
    const { statusCode, body } = await getRoster();

    expect(statusCode).toBe(200);
    expect(body.schemaVersion).toBe(ROSTER_SCHEMA_VERSION);
    expect(body.agents).toHaveLength(15);
    expect(body.count).toBe(15);

    // The identifiers, in roster order, are exactly ROSTER_IDS — not a subset.
    expect(body.agents.map((a: { id: string }) => a.id)).toEqual([...ROSTER_IDS]);

    for (const agent of body.agents) {
      expect(agent.id).toMatch(/^A([1-9]|1[0-5])$/);
      expect(typeof agent.name).toBe('string');
      expect(agent.name.length).toBeGreaterThan(0);
      expect(Array.isArray(agent.writes)).toBe(true);
      expect(typeof agent.inTurnLoop).toBe('boolean');
    }
  });

  it('serves the authority model from roster.ts rather than a copy of it', () => {
    const body = buildRosterResponse();
    expect(body.agents.map((a) => a.id)).toEqual(ROSTER.map((a) => a.id));

    for (const entry of body.agents) {
      const spec = ROSTER.find((a) => a.id === entry.id)!;
      expect(entry.writes).toEqual([...spec.writes].sort());
      expect(entry.clientFacing).toBe(spec.clientFacing);
      expect(entry.canVeto).toBe(spec.canVeto);
      expect(entry.canSelect).toBe(spec.canSelect);
      expect(entry.inTurnLoop).toBe(spec.inTurnLoop);
      expect(entry.maySignalSeverity).toBe(spec.maySignalSeverity);
    }
  });

  it('keeps the single-writer rules visible through the endpoint', async () => {
    const { body } = await getRoster();
    const writers = (write: string) =>
      body.agents.filter((a: { writes: string[] }) => a.writes.includes(write)).map((a: { id: string }) => a.id);

    expect(writers('severity')).toEqual(['A9']);
    expect(writers('text')).toEqual(['A12']);
    expect(writers('audio')).toEqual(['A13']);
    expect(writers('selection')).toEqual(['A8']);
    // Only A12 may be client-facing, so only A12 may be read by a client's UI.
    expect(body.agents.filter((a: { clientFacing: boolean }) => a.clientFacing).map((a: { id: string }) => a.id)).toEqual(['A12']);
  });

  it('every listed agent has code on disk', () => {
    const missing: string[] = [];
    for (const id of ROSTER_IDS) {
      const dirFiles = existsSync(join(AGENTS_DIR, id.toLowerCase()))
        ? readdirSync(join(AGENTS_DIR, id.toLowerCase())).filter((f) => f.endsWith('.ts'))
        : [];
      if (dirFiles.length === 0 && filesFor(id, AGENTS_DIR).length === 0) missing.push(id);
    }
    expect(missing).toEqual([]);
  });

  it('every listed agent has at least one test file carrying at least one test', () => {
    const unproven: string[] = [];
    for (const id of ROSTER_IDS) {
      const files = testFilesFor(id);
      const withTests = files.filter((f) => hasAtLeastOneTest(readFileSync(join(TEST_DIR, f), 'utf8')));
      if (withTests.length === 0) unproven.push(`${id}: files=[${files.join(', ')}]`);
    }
    expect(unproven).toEqual([]);
  });

  it('omits A9-post and J2 — components, not roster members', async () => {
    const { body, raw } = await getRoster();
    const ids: string[] = body.agents.map((a: { id: string }) => a.id);

    expect(ids).not.toContain('A9-post');
    expect(ids).not.toContain('A9POST');
    expect(ids).not.toContain('J2');
    expect(ids).not.toContain('A16');

    // Not just absent from `id` — absent from every string in the payload, so they cannot reappear
    // as a name or a purpose line either.
    const lower = raw.toLowerCase();
    expect(lower).not.toContain('a9-post');
    expect(lower).not.toContain('a9post');
    expect(lower).not.toContain('journal-prompt');
    expect(lower).not.toContain('"j2"');
  });

  it('A9-post and J2 cannot be added to the roster without failing validation', () => {
    for (const id of ['A9-post', 'J2']) {
      const smuggled: AgentSpec[] = [
        ...ROSTER,
        { ...ROSTER[0], id, writes: new Set() } as AgentSpec,
      ];
      const violations = validateRoster(smuggled);
      expect(violations.map((v) => v.code)).toContain('roster_incomplete');
      expect(violations.find((v) => v.code === 'roster_incomplete')!.detail).toContain(id);
    }
  });

  it('requires authentication when the dev bypass is off', async () => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.LOCAL_DEV_BYPASS_AUTH;

    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/agents/roster' });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('fails closed with 503 when the roster breaks its own rules', async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };

    // Two text writers: A2 promoted to client-facing prose, next to A12.
    const broken: AgentSpec[] = ROSTER.map((a) =>
      a.id === 'A2'
        ? { ...a, writes: new Set(['payload', 'text'] as const), clientFacing: true }
        : { ...a, writes: new Set(a.writes) },
    );

    const app = Fastify({ logger: false });
    await app.register(agentsRoute, { roster: broken });
    const response = await app.inject({
      method: 'GET',
      url: '/agents/roster',
      headers: { authorization: 'Bearer ignored-under-bypass' },
    });
    await app.close();

    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.error.code).toBe('ROSTER_INVALID');
    // The specific broken rule, not a generic refusal.
    expect(body.error.violations).toContain('text_writer_ambiguous');
    // And no agent list leaks out alongside the refusal.
    expect(body.agents).toBeUndefined();
  });
});
