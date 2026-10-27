/**
 * Text embeddings — Amazon Bedrock Titan Text Embeddings V2 only.
 *
 * This used to be a seam between Vertex AI's text-embedding-004 (default) and
 * Bedrock. With the GCP backend removed (docs/AWS-CUTOVER-SPEC.md) this module
 * is a thin delegate so callers keep importing `generateEmbedding` from here,
 * and the Bedrock implementation stays lazily imported: it pulls in
 * `@aws-sdk/client-bedrock-runtime`, which must not be loaded — or bundled into
 * apps/test-harness's webpack build — when only the type surface is used.
 *
 * The 768-dimension contract is enforced inside `bedrock.ts`, against the
 * pgvector column width.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { generateEmbedding: generateBedrockEmbedding } = await import('./bedrock.js');
  return generateBedrockEmbedding(text);
}
