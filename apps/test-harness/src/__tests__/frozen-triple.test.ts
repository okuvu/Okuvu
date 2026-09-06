import { describe, it, expect, vi } from 'vitest';
import { resolveFrozenTriple } from '@/lib/frozen-triple';
import type { TestEnvironment } from '@/lib/prisma-rls';

function makeTx(pin: unknown) {
  return { modelConfigPin: { findFirst: vi.fn().mockResolvedValue(pin) } } as any;
}

describe('resolveFrozenTriple', () => {
  it('returns {} when no ModelConfigPin exists for the environment yet', async () => {
    const tx = makeTx(null);

    const result = await resolveFrozenTriple({
      tx,
      environment: 'sandbox' as TestEnvironment,
      inputId: 'input-1',
      rawOutput: 'some output',
    });

    expect(result).toEqual({});
  });

  it('assembles a full FrozenTripleMetadata record when a pin exists', async () => {
    const tx = makeTx({
      model_version: 'gemini-2.5-flash',
      temperature: 0.7,
      safety_settings: 'default',
      suite_version: 'v1.0',
    });

    const result = await resolveFrozenTriple({
      tx,
      environment: 'staging' as TestEnvironment,
      inputId: 'input-1',
      rawOutput: 'some output',
    });

    expect(result).toMatchObject({
      modelVersion: 'gemini-2.5-flash',
      temperature: 0.7,
      safetySettings: 'default',
      suiteVersion: 'v1.0',
      inputId: 'input-1',
      rawOutput: 'some output',
    });
    expect((result as any).promptHash).toMatch(/^[0-9a-f]{64}$/);
    expect((result as any).timestamp).toBeTruthy();
  });

  it('prefers an explicit suiteVersion over the pin\'s own', async () => {
    const tx = makeTx({
      model_version: 'gemini-2.5-flash',
      temperature: 0.7,
      safety_settings: 'default',
      suite_version: 'v1.0',
    });

    const result = await resolveFrozenTriple({
      tx,
      environment: 'staging' as TestEnvironment,
      inputId: 'input-1',
      rawOutput: 'some output',
      suiteVersion: 'v2.0-override',
    });

    expect((result as any).suiteVersion).toBe('v2.0-override');
  });
});
