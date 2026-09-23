/**
 * TH-S35 — POST /api/run-batch/{id}/advance: the spec-exact advance-tick
 * URL. Re-exports the [id] route's POST handler (same idempotent one-step
 * semantics) so both URLs work: POST /api/run-batch/{id} and
 * POST /api/run-batch/{id}/advance.
 */
export { POST } from '../route';
