import type { FrozenTripleMetadata } from '@evia/shared-types';
import type { Prisma } from '@evia/prisma';
import { getPromptManifest, hashPromptManifest } from './prompt-hash';
import type { TestEnvironment } from './prisma-rls';

/**
 * Minimal shape of a `ModelConfigPin` row needed to assemble a frozen
 * triple. Declared structurally (rather than importing the Prisma model
 * type) so this stays a pure, easily-unit-testable function that doesn't
 * need a live Prisma client to test.
 */
export interface ModelConfigPinLike {
  model_version: string;
  temperature: number;
  safety_settings: string;
}

export interface BuildFrozenTripleParams {
  pin: ModelConfigPinLike;
  promptHash: string;
  suiteVersion: string;
  inputId: string;
  rawOutput: string;
  /** Defaults to `new Date().toISOString()` if omitted. */
  timestamp?: string;
}

/**
 * Assemble the 8-field `FrozenTripleMetadata` record from a model config
 * pin row plus the run-specific fields (prompt hash, suite version, input,
 * raw output). This is what makes a `TestRun` reproducible/auditable later:
 * exactly which model/temperature/safety-settings/prompt-hash produced a
 * given output.
 */
export function buildFrozenTripleMetadata(
  params: BuildFrozenTripleParams,
): FrozenTripleMetadata {
  const { pin, promptHash, suiteVersion, inputId, rawOutput, timestamp } = params;

  return {
    modelVersion: pin.model_version,
    promptHash,
    temperature: pin.temperature,
    safetySettings: pin.safety_settings,
    suiteVersion,
    inputId,
    timestamp: timestamp ?? new Date().toISOString(),
    rawOutput,
  };
}

export interface ResolveFrozenTripleParams {
  /** RLS-scoped transaction client from the caller's own `withEnvironment` call. */
  tx: Prisma.TransactionClient;
  environment: TestEnvironment;
  inputId: string;
  rawOutput: string;
  suiteVersion?: string;
}

/**
 * Look up the latest `ModelConfigPin` for `environment` (via the caller's
 * already-RLS-scoped transaction — see `testConfig.ts`'s `getFrozenTripleMetadata`
 * for the read-only counterpart of this same lookup) and assemble a full
 * `FrozenTripleMetadata` record from it.
 *
 * Returns `{}` when no pin exists yet for the environment, rather than
 * throwing: a test run shouldn't hard-fail just because nobody has pinned a
 * model version for this environment yet — this matches the pre-existing
 * `frozen_triple: {}` placeholder every run-creation path used before this
 * function existed, so runs against an unpinned environment keep working
 * exactly as before, just without frozen-triple data attached.
 */
export async function resolveFrozenTriple(
  params: ResolveFrozenTripleParams,
): Promise<FrozenTripleMetadata | Record<string, never>> {
  const { tx, environment, inputId, rawOutput, suiteVersion } = params;

  const latestPin = await tx.modelConfigPin.findFirst({
    where: { environment },
    orderBy: { created_at: 'desc' },
  });

  if (!latestPin) return {};

  const promptHash = hashPromptManifest(getPromptManifest());

  return buildFrozenTripleMetadata({
    pin: latestPin,
    promptHash,
    suiteVersion: suiteVersion ?? latestPin.suite_version,
    inputId,
    rawOutput,
  });
}
