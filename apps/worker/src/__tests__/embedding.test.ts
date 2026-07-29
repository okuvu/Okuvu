import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPredict = vi.fn();

vi.mock('@google-cloud/aiplatform', () => {
  const mockValue = {
    structValue: {
      fields: {
        content: { stringValue: '' },
      },
    },
  };

  return {
    v1beta1: {
      PredictionServiceClient: vi.fn(() => ({
        predict: mockPredict,
      })),
    },
    protos: {
      google: {
        protobuf: {
          Value: {
            fromObject: vi.fn(() => mockValue),
          },
        },
      },
    },
  };
});

function makeEmbeddingValues(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    numberValue: (i + 1) / 1000,
  }));
}

function makeValidPredictResponse(embeddingDimensions: number) {
  return [
    {
      predictions: [
        {
          structValue: {
            fields: {
              embeddings: {
                structValue: {
                  fields: {
                    values: {
                      listValue: {
                        values: makeEmbeddingValues(embeddingDimensions),
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
  ];
}

describe('generateEmbedding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a 768-dimensional float array on successful API call', async () => {
    mockPredict.mockResolvedValue(makeValidPredictResponse(768));

    const { generateEmbedding } = await import('../lib/embedding.js');
    const result = await generateEmbedding('Test text to embed');

    expect(result).toHaveLength(768);
    expect(result[0]).toBeCloseTo(0.001, 5);
    expect(result[767]).toBeCloseTo(0.768, 3);
    expect(mockPredict).toHaveBeenCalledTimes(1);
  });

  it('throws when Vertex AI returns no predictions', async () => {
    mockPredict.mockResolvedValue([{ predictions: [] }]);

    const { generateEmbedding } = await import('../lib/embedding.js');
    await expect(generateEmbedding('Test text')).rejects.toThrow(
      'Vertex AI embedding returned no predictions',
    );
  });

  it('throws when Vertex AI returns null predictions', async () => {
    mockPredict.mockResolvedValue([{ predictions: null }]);

    const { generateEmbedding } = await import('../lib/embedding.js');
    await expect(generateEmbedding('Test text')).rejects.toThrow(
      'Vertex AI embedding returned no predictions',
    );
  });

  it('throws when embedding response is missing embeddings.values', async () => {
    mockPredict.mockResolvedValue([
      {
        predictions: [
          {
            structValue: {
              fields: {},
            },
          },
        ],
      },
    ]);

    const { generateEmbedding } = await import('../lib/embedding.js');
    await expect(generateEmbedding('Test text')).rejects.toThrow(
      'Vertex AI embedding response missing embeddings.values',
    );
  });

  it('throws when Vertex AI API call fails', async () => {
    mockPredict.mockRejectedValue(new Error('Vertex AI API error'));

    const { generateEmbedding } = await import('../lib/embedding.js');
    await expect(generateEmbedding('Test text')).rejects.toThrow('Vertex AI API error');
  });
});
