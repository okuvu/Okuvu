import { describe, it, expect } from 'vitest';
import { sessionSummaryVisible, sharedSummaryWhere, summaryAccessWindow } from '../index';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-20T09:00:00Z');

const openWindow = { summary_access_granted_at: new Date(NOW - 2 * DAY_MS), summary_access_closed_at: null };
const expiredWindow = { summary_access_granted_at: new Date(NOW - 31 * DAY_MS), summary_access_closed_at: null };
const revokedWindow = { summary_access_granted_at: new Date(NOW - 2 * DAY_MS), summary_access_closed_at: new Date(NOW - DAY_MS) };

/**
 * The per-session lock, in the one place all three surfaces read it.
 *
 * Each case here is a sentence the client can read in the app, and therefore a
 * promise the api and portal must keep:
 *   "keeping one session private"              → withhold wins
 *   "share summaries" (the relationship switch) → null follows it
 *   "for 30 days"                               → an allow cannot outlive it
 */
describe('sessionSummaryVisible()', () => {
  it('follows the relationship switch when the client has no per-session opinion', () => {
    expect(sessionSummaryVisible({ share_with_therapist: null }, openWindow, NOW)).toBe(true);
    expect(sessionSummaryVisible({ share_with_therapist: null }, expiredWindow, NOW)).toBe(false);
    expect(sessionSummaryVisible({ share_with_therapist: null }, null, NOW)).toBe(false);
  });

  it('lets a withhold win even inside an open window', () => {
    expect(sessionSummaryVisible({ share_with_therapist: false }, openWindow, NOW)).toBe(false);
  });

  it('does not let a per-session allow survive a revoked or expired grant', () => {
    expect(sessionSummaryVisible({ share_with_therapist: true }, openWindow, NOW)).toBe(true);
    expect(sessionSummaryVisible({ share_with_therapist: true }, revokedWindow, NOW)).toBe(false);
    expect(sessionSummaryVisible({ share_with_therapist: true }, expiredWindow, NOW)).toBe(false);
    // A per-session allow with no relationship at all must not read as shared.
    expect(sessionSummaryVisible({ share_with_therapist: true }, null, NOW)).toBe(false);
  });

  it('agrees with summaryAccessWindow at the boundary', () => {
    const thirtyDays = { summary_access_granted_at: new Date(NOW - 30 * DAY_MS), summary_access_closed_at: null };
    expect(summaryAccessWindow(thirtyDays, NOW)).toBeNull();
    expect(sessionSummaryVisible({ share_with_therapist: true }, thirtyDays, NOW)).toBe(false);
  });
});

describe('sharedSummaryWhere()', () => {
  it('keeps NULL rows — a client who never chose has not withheld', () => {
    expect(sharedSummaryWhere()).toEqual({
      OR: [{ share_with_therapist: null }, { share_with_therapist: true }],
    });
  });
});
