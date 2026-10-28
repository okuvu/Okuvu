/**
 * Embedding seam for the worker: `generateEmbedding(text) => number[]`.
 *
 * Amazon Bedrock Titan Text Embeddings V2 (768 dims, matching the
 * `SessionLog.summary_embedding vector(768)` column) is the only
 * implementation after the AWS cutover (docs/AWS-CUTOVER-SPEC.md) — the cloud
 * SDK client this file used to hold, and the switch that chose between them,
 * are gone. Callers (`summary.ts`, `scripts/backfill-embeddings.ts`) keep
 * importing this seam so the model/dimension guard stays in one place.
 *
 * The Bedrock module is imported lazily: `@aws-sdk/client-bedrock-runtime` only
 * loads when an embedding is actually requested.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { generateEmbedding: generateBedrockEmbedding } = await import('./bedrock.js');
  return generateBedrockEmbedding(text);
}
