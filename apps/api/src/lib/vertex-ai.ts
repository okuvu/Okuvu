import { v1beta1, protos } from '@google-cloud/aiplatform';

export const DEFAULT_MAX_OUTPUT_TOKENS = 250;
export const DEFAULT_TIMEOUT_MS = 10_000;

const SAFE_FALLBACK = "I'm here to support you. Could you tell me more about how you're feeling?";

let client: v1beta1.PredictionServiceClient | null = null;

function getClient(): v1beta1.PredictionServiceClient {
  if (!client) {
    const location = process.env.VERTEX_AI_LOCATION ?? 'asia-south1';
    client = new v1beta1.PredictionServiceClient({
      apiEndpoint: `${location}-aiplatform.googleapis.com`,
    });
  }
  return client;
}

function getModelResource(): string {
  const project = process.env.VERTEX_AI_PROJECT_ID ?? 'evia-dev';
  const location = process.env.VERTEX_AI_LOCATION ?? 'asia-south1';
  const model = process.env.GEMINI_PRO_MODEL ?? 'gemini-3.1-pro-preview';
  return `projects/${project}/locations/${location}/publishers/google/models/${model}`;
}

export interface GenerateContentParams {
  systemInstruction: string;
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
  }>;
  timeoutMs?: number;
}

export interface GenerateContentResult {
  text: string;
  fallbackUsed: boolean;
}

export async function generateContent(
  params: GenerateContentParams,
): Promise<GenerateContentResult> {
  if (process.env.USE_CANNED_LLM_RESPONSE === 'true') {
    return {
      text: process.env.CANNED_LLM_RESPONSE ?? SAFE_FALLBACK,
      fallbackUsed: true,
    };
  }

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const request = {
    model: getModelResource(),
    systemInstruction: {
      role: 'system' as const,
      parts: [{ text: params.systemInstruction }],
    },
    contents: params.contents,
    generationConfig: {
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      temperature: 0.7,
    },
  };

  try {
    const c = getClient();
    const result = await Promise.race([
      c.generateContent(request),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Vertex AI timeout')), timeoutMs),
      ),
    ]);

    const response = Array.isArray(result) ? result[0] : result;
    const text =
      (response as protos.google.cloud.aiplatform.v1beta1.IGenerateContentResponse)
        ?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    return { text, fallbackUsed: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error({ err: message }, 'Vertex AI call failed');
    return { text: SAFE_FALLBACK, fallbackUsed: true };
  }
}
