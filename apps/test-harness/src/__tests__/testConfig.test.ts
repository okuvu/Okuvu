import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { hashPromptFile } from '@/lib/prompt-hash';
import { buildFrozenTripleMetadata } from '@/lib/frozen-triple';

// ─── Hash stability (hashPromptFile) ───────────────────────────────────

describe('hashPromptFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'prompt-hash-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('produces the same hash for identical content across two calls', () => {
    const file = path.join(dir, 'a.txt');
    writeFileSync(file, 'You are a supportive companion.');

    const first = hashPromptFile(file);
    const second = hashPromptFile(file);

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces a different hash when file content changes', () => {
    const file = path.join(dir, 'b.txt');
    writeFileSync(file, 'Version one of the prompt.');
    const before = hashPromptFile(file);

    writeFileSync(file, 'Version two of the prompt — content changed.');
    const after = hashPromptFile(file);

    expect(before).not.toBe(after);
  });
});

// ─── buildFrozenTripleMetadata (pure function) ─────────────────────────

describe('buildFrozenTripleMetadata', () => {
  it('assembles all 8 FrozenTripleMetadata fields from a pin + run-specific inputs', () => {
    const result = buildFrozenTripleMetadata({
      pin: {
        model_version: 'gemini-2.5-flash',
        temperature: 0.7,
        safety_settings: 'default',
      },
      promptHash: 'abc123',
      suiteVersion: 'v1.0',
      inputId: 'input-1',
      rawOutput: 'the model said this',
      timestamp: '2026-08-19T00:00:00.000Z',
    });

    expect(result).toEqual({
      modelVersion: 'gemini-2.5-flash',
      promptHash: 'abc123',
      temperature: 0.7,
      safetySettings: 'default',
      suiteVersion: 'v1.0',
      inputId: 'input-1',
      timestamp: '2026-08-19T00:00:00.000Z',
      rawOutput: 'the model said this',
    });
  });
});

// ─── testConfigRouter — pin immutability ───────────────────────────────

// `withEnvironment` (prisma-rls.ts) wraps every RLS-scoped table access in
// `prisma.$transaction(tx => ...)` + a `SET LOCAL` — the mock below routes
// both back to this same mocked `prisma` object so every existing
// per-table `vi.fn()` mock keeps working unchanged.
vi.mock('@/lib/prisma', () => {
  const mockPrisma: any = {
    modelConfigPin: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  mockPrisma.$transaction = vi.fn((fn: any) => fn(mockPrisma));
  mockPrisma.$executeRawUnsafe = vi.fn();
  return { prisma: mockPrisma };
});

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

const { prisma } = await import('@/lib/prisma');
const { testConfigRouter } = await import('../server/routers/testConfig');

function buildCtx(overrides?: Partial<{ role: 'PI' | 'RATER' | 'ENGINEER' }>) {
  return {
    session: {
      user: {
        id: 'user-1',
        email: 'pi@evia.dev',
        name: 'PI User',
        role: overrides?.role ?? 'PI',
        environments: ['sandbox', 'staging', 'beta'],
      },
    },
    user: {
      id: 'user-1',
      email: 'pi@evia.dev',
      name: 'PI User',
      role: overrides?.role ?? 'PI',
      environments: ['sandbox', 'staging', 'beta'],
    },
    prisma,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('testConfigRouter.pinModelVersion — append-only immutability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls prisma.modelConfigPin.create for each pin and never update/delete', async () => {
    vi.mocked(prisma!.modelConfigPin.create).mockResolvedValue({
      id: 'pin-1',
      environment: 'sandbox',
      model_version: 'gemini-2.5-flash',
      prompt_hash: 'hash-1',
      temperature: 0.7,
      safety_settings: 'default',
      suite_version: 'v1.0',
      pinned_by: 'pi@evia.dev',
      created_at: new Date(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const caller = testConfigRouter.createCaller(buildCtx({ role: 'PI' }));

    const pinInput = {
      environment: 'sandbox' as const,
      model_version: 'gemini-2.5-flash',
      prompt_hash: 'hash-1',
      temperature: 0.7,
      safety_settings: 'default',
      suite_version: 'v1.0',
    };

    await caller.pinModelVersion(pinInput);
    await caller.pinModelVersion({ ...pinInput, model_version: 'gemini-2.5-pro' });

    expect(prisma!.modelConfigPin.create).toHaveBeenCalledTimes(2);
    expect(prisma!.modelConfigPin.update).not.toHaveBeenCalled();
    expect(prisma!.modelConfigPin.delete).not.toHaveBeenCalled();
  });

  it('rejects non-PI roles with FORBIDDEN and never touches prisma', async () => {
    const caller = testConfigRouter.createCaller(buildCtx({ role: 'ENGINEER' }));

    await expect(
      caller.pinModelVersion({
        environment: 'sandbox',
        model_version: 'gemini-2.5-flash',
        prompt_hash: 'hash-1',
        temperature: 0.7,
        safety_settings: 'default',
        suite_version: 'v1.0',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(prisma!.modelConfigPin.create).not.toHaveBeenCalled();
  });
});

describe('testConfigRouter.setTemperature — append-only, carries forward latest pin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the latest pin then creates a new row (never updates the old one)', async () => {
    vi.mocked(prisma!.modelConfigPin.findFirst).mockResolvedValue({
      id: 'pin-1',
      environment: 'sandbox',
      model_version: 'gemini-2.5-flash',
      prompt_hash: 'hash-1',
      temperature: 0.7,
      safety_settings: 'default',
      suite_version: 'v1.0',
      pinned_by: 'pi@evia.dev',
      created_at: new Date(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(prisma!.modelConfigPin.create).mockResolvedValue({} as any);

    const caller = testConfigRouter.createCaller(buildCtx({ role: 'PI' }));

    await caller.setTemperature({ environment: 'sandbox', temperature: 0.4 });

    expect(prisma!.modelConfigPin.create).toHaveBeenCalledWith({
      data: {
        environment: 'sandbox',
        model_version: 'gemini-2.5-flash',
        prompt_hash: 'hash-1',
        temperature: 0.4,
        safety_settings: 'default',
        suite_version: 'v1.0',
        pinned_by: 'pi@evia.dev',
      },
    });
    expect(prisma!.modelConfigPin.update).not.toHaveBeenCalled();
  });

  it('fails with PRECONDITION_FAILED when no prior pin exists', async () => {
    vi.mocked(prisma!.modelConfigPin.findFirst).mockResolvedValue(null);

    const caller = testConfigRouter.createCaller(buildCtx({ role: 'PI' }));

    await expect(
      caller.setTemperature({ environment: 'beta', temperature: 0.5 }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    expect(prisma!.modelConfigPin.create).not.toHaveBeenCalled();
  });
});
