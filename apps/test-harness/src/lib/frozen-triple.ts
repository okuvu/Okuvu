import type { FrozenTripleMetadata } from '@evia/shared-types';

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
