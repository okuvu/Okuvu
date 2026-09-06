'use client';

import { createTRPCClient, httpBatchLink } from '@trpc/client';

// ─── Standalone client for the faultInjection router ───────────────────────
//
// TH-S11 constraint: server/routers/_app.ts is not to be edited by this
// story (several sibling stories are adding routers near it in parallel;
// someone will register them all centrally afterward). That means the
// shared `trpc` react-query client from '@/trpc/client' — typed against
// `AppRouter`, i.e. `_app.ts`'s current router map — does not know about
// `faultInjectionRouter` yet, so it can't be used to call it with type
// safety.
//
// Rather than block the UI on that central registration, this file builds
// its own tiny vanilla tRPC client hitting the same `/api/trpc` HTTP
// endpoint. It's untyped (`any`) at the client boundary — once `_app.ts`
// registers `faultInjection: faultInjectionRouter`, these calls resolve to
// exactly the same procedures over the same endpoint; nothing here needs to
// change, and the two-router-map mismatch disappears at that point (this
// file could then be deleted in favor of `trpc.faultInjection.*`).
const client = createTRPCClient<any>({
  links: [httpBatchLink({ url: '/api/trpc' })],
});

export interface InjectModelFailureInput {
  boundary: 'A1' | 'A2' | 'A9_pre' | 'A9_post';
  type: 'timeout' | 'api_error';
  message: string;
  environment: 'sandbox' | 'staging' | 'beta';
}

export interface InjectSignalFailureInput {
  message: string;
  environment: 'sandbox' | 'staging' | 'beta';
}

export function injectModelFailure(input: InjectModelFailureInput): Promise<{ result: unknown; runId: string }> {
  return (client as any).faultInjection.injectModelFailure.mutate(input);
}

export function injectSignalFailure(input: InjectSignalFailureInput): Promise<{ result: unknown; runId: string }> {
  return (client as any).faultInjection.injectSignalFailure.mutate(input);
}

export function verifyFailSafe(): Promise<{
  assertion1: 'PASS' | 'FAIL';
  assertion2: 'PASS' | 'FAIL';
  assertion3: 'PASS' | 'FAIL';
  details: unknown;
}> {
  return (client as any).faultInjection.verifyFailSafe.mutate({});
}
