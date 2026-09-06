/**
 * Plain-language fault options for the Simulator's "test fail-safe
 * behavior" selector — maps a clinician-facing label to the same
 * `{ boundary, type }` shape `faultInjection.ts` and `simulator.ts`'s
 * `sendMessage` already use, so nothing new is invented on the backend.
 */
export type FaultOptionId = 'none' | 'safety' | 'response' | 'review';

export interface FaultOption {
  id: FaultOptionId;
  label: string;
  fault: { boundary: 'A1' | 'A2' | 'A9_pre' | 'A9_post'; type: 'timeout' | 'api_error' } | null;
}

export const FAULT_OPTIONS: FaultOption[] = [
  { id: 'none', label: 'None (normal testing)', fault: null },
  { id: 'safety', label: 'Safety check fails', fault: { boundary: 'A1', type: 'api_error' } },
  { id: 'response', label: 'Response generation fails', fault: { boundary: 'A2', type: 'api_error' } },
  { id: 'review', label: 'Post-response review fails', fault: { boundary: 'A9_post', type: 'api_error' } },
];
