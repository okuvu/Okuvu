/**
 * TH-S17 — best-effort live Vertex AI pricing fetch.
 *
 * There is no publicly documented, stable JSON API for Vertex AI Gemini
 * pricing as of this writing (the canonical source is the human-readable
 * pricing page at https://cloud.google.com/vertex-ai/generative-ai/pricing).
 * Rather than invent a fake response shape, this module is intentionally
 * generic and defensive: it will call an operator-configured endpoint
 * (`VERTEX_AI_PRICE_API_URL`) if and only if one is set, and treats any
 * failure — not configured, network error, timeout, non-2xx, unexpected
 * JSON shape — identically: return `null` and let the caller fall back to
 * the static table in `apps/test-harness/src/lib/pricing.ts` (TH-S15).
 *
 * This is a pending integration point, not a finished pricing client. When
 * a real pricing API contract exists, replace the response parsing below
 * with the real shape.
 */

const FETCH_TIMEOUT_MS = 5000;

export interface LivePricing {
  inputPer1k: number;
  outputPer1k: number;
}

function isValidPricingShape(value: unknown): value is LivePricing {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.inputPer1k === 'number' &&
    Number.isFinite(candidate.inputPer1k) &&
    typeof candidate.outputPer1k === 'number' &&
    Number.isFinite(candidate.outputPer1k)
  );
}

/**
 * Attempt to fetch live per-1K-token INR pricing for `model` from the
 * configured price API. Returns `null` on any failure so callers can
 * transparently fall back to the static `GEMINI_PRICING_INR` table.
 */
export async function fetchLivePricing(model: string): Promise<LivePricing | null> {
  const baseUrl = process.env.VERTEX_AI_PRICE_API_URL;
  if (!baseUrl) {
    return null;
  }

  try {
    const url = `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(model)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      return null;
    }

    const json: unknown = await res.json();
    if (!isValidPricingShape(json)) {
      return null;
    }

    return { inputPer1k: json.inputPer1k, outputPer1k: json.outputPer1k };
  } catch {
    // Network error, timeout, JSON parse failure, or anything else — this
    // integration is best-effort only, never let it throw into the caller.
    return null;
  }
}
