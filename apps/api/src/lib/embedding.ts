import { v1beta1, protos } from '@google-cloud/aiplatform';

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
  return `projects/${project}/locations/${location}/publishers/google/models/text-embedding-004`;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const endpoint = getModelResource();
  const instances = [{ structValue: { fields: { content: { stringValue: text } } } }];
  const parameters = { structValue: { fields: { taskType: { stringValue: 'SEMANTIC_SIMILARITY' } } } };

  const result = await getClient().predict({
    endpoint,
    instances,
    parameters,
  });

  const response = Array.isArray(result) ? result[0] : result;
  const predictions = response.predictions as protos.google.protobuf.IValue[] | null | undefined;

  if (!predictions || predictions.length === 0) {
    throw new Error('Vertex AI embedding returned no predictions');
  }

  const prediction = predictions[0];
  const structValue = prediction.structValue?.fields;

  if (!structValue?.embeddings?.structValue?.fields?.values?.listValue?.values) {
    throw new Error('Vertex AI embedding response missing embeddings.values');
  }

  const values = structValue.embeddings.structValue.fields.values.listValue.values;
  const embedding = values
    .map((v: protos.google.protobuf.IValue) => v.numberValue)
    .filter((v): v is number => v !== null && v !== undefined);

  return embedding;
}
