import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';
import { getPromptManifest, hashPromptFile, hashPromptManifest } from '@/lib/prompt-hash';
import { buildFrozenTripleMetadata } from '@/lib/frozen-triple';
import { withEnvironment } from '@/lib/prisma-rls';

const environmentSchema = z.enum(['sandbox', 'staging', 'beta']);

function requirePI(role: string): void {
  if (role !== 'PI') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only PI role may modify the model config registry',
    });
  }
}

export const testConfigRouter = router({
  /**
   * Pin a new model config (version/prompt hash/temperature/safety
   * settings) for an environment. PI-only.
   *
   * ModelConfigPin is append-only per the schema/story: this always
   * creates a new row and never updates or deletes an existing one, so
   * every past pin remains available for reproducing a historical
   * TestRun's frozenTriple.
   */
  pinModelVersion: protectedProcedure
    .input(
      z.object({
        environment: environmentSchema,
        model_version: z.string().min(1),
        prompt_hash: z.string().min(1),
        temperature: z.number().min(0).max(2),
        safety_settings: z.string().min(1),
        suite_version: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requirePI(ctx.user.role);

      return withEnvironment(input.environment, (tx) =>
        tx.modelConfigPin.create({
          data: {
            environment: input.environment,
            model_version: input.model_version,
            prompt_hash: input.prompt_hash,
            temperature: input.temperature,
            safety_settings: input.safety_settings,
            suite_version: input.suite_version,
            pinned_by: ctx.user.email ?? ctx.user.id,
          },
        }),
      );
    }),

  /**
   * The most recent pin for an environment, or null if none exists yet.
   * Used by the config UI to show "what's currently pinned" without
   * requiring the caller to already know a promptHash/inputId/rawOutput
   * (unlike getFrozenTripleMetadata, which assembles a full run-specific
   * record).
   */
  getLatestPin: protectedProcedure
    .input(z.object({ environment: environmentSchema }))
    .query(async ({ input }) => {
      return withEnvironment(input.environment, (tx) =>
        tx.modelConfigPin.findFirst({
          where: { environment: input.environment },
          orderBy: { created_at: 'desc' },
        }),
      );
    }),

  /**
   * Live prompt registry: hashes each known prompt file (see
   * lib/prompt-hash.ts's manifest) on every call, so the returned hash is
   * always current — not a possibly-stale stored value.
   */
  getPromptRegistry: protectedProcedure.query(() => {
    const manifest = getPromptManifest();
    return manifest.map((entry) => ({
      agentId: entry.agentId,
      path: entry.path,
      version: entry.version,
      contentHash: hashPromptFile(entry.path),
    }));
  }),

  /**
   * Set temperature for an environment.
   *
   * Design choice: there is no dedicated "current temperature" table
   * separate from ModelConfigPin, and ModelConfigPin is append-only (no
   * updates), so "setting the temperature" is modeled as reading the
   * latest pin for the environment and creating a new pin row that
   * carries forward its model_version/prompt_hash/safety_settings/
   * suite_version but with the new temperature. If no prior pin exists,
   * this fails with a clear error rather than inventing placeholder
   * values for the other required fields — callers should pinModelVersion
   * first to establish a baseline.
   */
  setTemperature: protectedProcedure
    .input(
      z.object({
        environment: environmentSchema,
        temperature: z.number().min(0).max(2),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requirePI(ctx.user.role);

      return withEnvironment(input.environment, async (tx) => {
        const latestPin = await tx.modelConfigPin.findFirst({
          where: { environment: input.environment },
          orderBy: { created_at: 'desc' },
        });

        if (!latestPin) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'No existing model config pin for this environment — pin a model version before setting temperature.',
          });
        }

        return tx.modelConfigPin.create({
          data: {
            environment: input.environment,
            model_version: latestPin.model_version,
            prompt_hash: latestPin.prompt_hash,
            temperature: input.temperature,
            safety_settings: latestPin.safety_settings,
            suite_version: latestPin.suite_version,
            pinned_by: ctx.user.email ?? ctx.user.id,
          },
        });
      });
    }),

  /**
   * Assemble the reproducible 8-field FrozenTripleMetadata for a given
   * run's output: latest pin for the environment + a live prompt hash +
   * the run-specific fields (inputId/rawOutput/suiteVersion).
   */
  getFrozenTripleMetadata: protectedProcedure
    .input(
      z.object({
        environment: environmentSchema,
        inputId: z.string().min(1),
        rawOutput: z.string(),
        suiteVersion: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const latestPin = await withEnvironment(input.environment, (tx) =>
        tx.modelConfigPin.findFirst({
          where: { environment: input.environment },
          orderBy: { created_at: 'desc' },
        }),
      );

      if (!latestPin) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'No model config pin exists for this environment yet.',
        });
      }

      // The FrozenTripleMetadata contract has a single `promptHash` field,
      // but the registry tracks multiple prompt files (A2's two variants +
      // memory-extraction). We combine all of them into one manifest-level
      // hash (see hashPromptManifest) so drift in *any* tracked prompt is
      // reflected, rather than arbitrarily picking one file.
      const promptHash = hashPromptManifest(getPromptManifest());

      return buildFrozenTripleMetadata({
        pin: latestPin,
        promptHash,
        suiteVersion: input.suiteVersion ?? latestPin.suite_version,
        inputId: input.inputId,
        rawOutput: input.rawOutput,
      });
    }),
});
