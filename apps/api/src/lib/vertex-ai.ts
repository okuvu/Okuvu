import { v1beta1, protos } from '@google-cloud/aiplatform';
import { isCannedRequested, buildCannedResult, SAFE_FALLBACK } from './canned-response.js';

export const DEFAULT_MAX_OUTPUT_TOKENS = 2048;
export const DEFAULT_TIMEOUT_MS = 30_000;

let client: v1beta1.PredictionServiceClient | null = null;

/**
 * Application Default Credentials (the default when no `credentials` option
 * is passed) only resolve on real GCP infra — Cloud Run's metadata server,
 * or a cached `gcloud auth application-default login` session locally.
 * Platforms without either (e.g. Vercel, running apps/test-harness's
 * direct-import of this module) have nothing for ADC to find and every
 * Vertex AI call fails.
 *
 * GOOGLE_APPLICATION_CREDENTIALS_JSON carries a service account key's JSON
 * content directly (as a plain env var value, not a file path — Vercel has
 * no persistent filesystem to point GOOGLE_APPLICATION_CREDENTIALS at).
 * Cloud Run's deployment never sets this var, so its existing ADC-based
 * auth is completely unaffected — this is additive, not a replacement.
 */
interface ExplicitCredentialsOptions {
  credentials?: { client_email: string; private_key: string };
  projectId?: string;
}

function getExplicitCredentialsOptions(): ExplicitCredentialsOptions {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) return {};

  const parsed = JSON.parse(raw) as {
    client_email: string;
    private_key: string;
    project_id?: string;
  };

  return {
    credentials: {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
    },
    ...(parsed.project_id ? { projectId: parsed.project_id } : {}),
  };
}

function getClient(): v1beta1.PredictionServiceClient {
  if (!client) {
    const location = process.env.VERTEX_AI_LOCATION ?? 'asia-south1';
    client = new v1beta1.PredictionServiceClient({
      apiEndpoint: `${location}-aiplatform.googleapis.com`,
      ...getExplicitCredentialsOptions(),
    });
  }
  return client;
}

/** The bare model name this call will use — the same resolution `getModelResource` wraps into a full GCP resource path, exposed separately so callers can attribute a result to a specific model version (see `GenerateContentResult.model`). */
function resolveModelName(modelName?: string): string {
  return modelName ?? process.env.GEMINI_PRO_MODEL ?? 'gemini-2.5-flash';
}

function getModelResource(modelName?: string): string {
  const project = process.env.VERTEX_AI_PROJECT_ID ?? 'okuvu-dev';
  const location = process.env.VERTEX_AI_LOCATION ?? 'asia-south1';
  return `projects/${project}/locations/${location}/publishers/google/models/${resolveModelName(modelName)}`;
}

export interface GenerateContentParams {
  systemInstruction: string;
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
  }>;
  timeoutMs?: number;
  model?: string;
  generationConfig?: Partial<protos.google.cloud.aiplatform.v1beta1.IGenerationConfig>;
  /**
   * TH-S17 — optional per-call override for canned-response mode. When
   * omitted, behavior is unchanged from before this field existed: canned
   * mode is driven solely by the `USE_CANNED_LLM_RESPONSE` env var. Passing
   * `true`/`false` explicitly overrides the env var for this one call only,
   * without mutating `process.env` — this is what lets a caller (e.g. the
   * test harness) request a canned response for a single invocation without
   * a global, process-wide env flip.
   */
  useCanned?: boolean;
  /**
   * Schema-appropriate canned text for this specific call, supplied by the
   * calling agent. Without this, every agent got back the same generic
   * SAFE_FALLBACK prose in canned mode — which none of them can parse as
   * their own expected JSON shape, so every agent independently fell back
   * to its own hardcoded default (A1→S2, A9→Restricted, A2→SAFE_FALLBACK
   * text again), making sandbox mode look identical to total pipeline
   * failure on every single turn regardless of what the user typed.
   */
  cannedResponse?: string;
}

export interface GenerateContentResult {
  text: string;
  fallbackUsed: boolean;
  failureReason?: 'timeout' | 'api_error';
  /**
   * The bare model name this call resolved to (e.g. 'gemini-2.5-flash') —
   * present even in canned mode, reporting what *would* have been used.
   * Callers persisting this as provenance (e.g. Turn.model_version) must
   * check `canned` first and attribute nothing when it's true — canned text
   * was never actually produced by this model, only resolved-but-unused.
   */
  model: string;
  /** True when this result came from canned/test-hook text (useCanned/USE_CANNED_LLM_RESPONSE), not a real model call — see `model`'s doc comment. */
  canned: boolean;
}

export async function generateContent(
  params: GenerateContentParams,
): Promise<GenerateContentResult> {
  const model = resolveModelName(params.model);

  if (isCannedRequested(params)) {
    return buildCannedResult(params, model);
  }

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const request = {
    model: getModelResource(params.model),
    systemInstruction: {
      role: 'system' as const,
      parts: [{ text: params.systemInstruction }],
    },
    contents: params.contents,
    generationConfig: {
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      temperature: 0.7,
      ...params.generationConfig,
    },
  };

  let timedOut = false;

  try {
    const c = getClient();
    const result = await Promise.race([
      c.generateContent(request),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          timedOut = true;
          reject(new Error('Vertex AI timeout'));
        }, timeoutMs),
      ),
    ]);

    const response = Array.isArray(result) ? result[0] : result;
    const typedResponse = response as protos.google.cloud.aiplatform.v1beta1.IGenerateContentResponse;
    const text = typedResponse?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!text) {
      // This branch was previously silent — a genuinely empty candidate
      // (no exception, no timeout) looks identical to a healthy call from
      // the outside, so failures here were undiagnosable. Log the actual
      // reason Gemini didn't return text (safety block, MAX_TOKENS, etc.)
      // — confirmed live this was happening 100% of the time for one
      // specific caller (A9-post) with zero visibility into why.
      console.error(
        {
          finishReason: typedResponse?.candidates?.[0]?.finishReason,
          safetyRatings: typedResponse?.candidates?.[0]?.safetyRatings,
          promptFeedback: typedResponse?.promptFeedback,
          model: params.model,
        },
        'Vertex AI returned an empty candidate',
      );
      return { text: SAFE_FALLBACK, fallbackUsed: true, failureReason: 'api_error', model, canned: false };
    }

    return { text, fallbackUsed: false, model, canned: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failureReason: 'timeout' | 'api_error' = timedOut ? 'timeout' : 'api_error';
    console.error({ reason: failureReason, err: message }, 'Vertex AI call failed');
    return { text: SAFE_FALLBACK, fallbackUsed: true, failureReason, model, canned: false };
  }
}
