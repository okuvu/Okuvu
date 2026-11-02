import { describe, it, expect } from 'vitest';
import { deriveClientStatus, chatAccessState } from '../clients';

/**
 * Portal P0 — the invite/relationship lifecycle the Dashboard's Last-active
 * column renders. 'pending' is gone: it conflated "added but not on the Play
 * tester list" with "emailed and not yet signed in", which are two different
 * facts and two different operator actions.
 */
describe('deriveClientStatus', () => {
  it('is waiting_app_access when nothing else has happened yet', () => {
    expect(
      deriveClientStatus({ activated_at: null, ended_at: null, invite_sent_at: null }),
    ).toBe('waiting_app_access');
  });

  it('is invited once the invite email has actually gone out', () => {
    expect(
      deriveClientStatus({
        activated_at: null,
        ended_at: null,
        invite_sent_at: new Date(),
      }),
    ).toBe('invited');
  });

  it('stays waiting_app_access when tester access was added but the send failed', () => {
    // tester_access_added_at without invite_sent_at means the client still has
    // no way in; saying "invited" would hide that.
    expect(
      deriveClientStatus({
        activated_at: null,
        ended_at: null,
        tester_access_added_at: new Date(),
        invite_sent_at: null,
      }),
    ).toBe('waiting_app_access');
  });

  it('is active once activated_at is set', () => {
    expect(deriveClientStatus({ activated_at: new Date(), ended_at: null })).toBe('active');
  });

  it('is ended once ended_at is set', () => {
    expect(deriveClientStatus({ activated_at: new Date(), ended_at: new Date() })).toBe('ended');
  });

  it('stays ended even if activated_at is also set (ended_at wins)', () => {
    expect(deriveClientStatus({ activated_at: new Date(), ended_at: new Date() })).toBe('ended');
  });

  it('is age_blocked when the client declined the 18+ attestation', () => {
    expect(
      deriveClientStatus({ activated_at: null, ended_at: null, age_declined_at: new Date() }),
    ).toBe('age_blocked');
  });

  it('keeps age_blocked above active — a declined attestation never shows as active', () => {
    expect(
      deriveClientStatus({
        activated_at: new Date(),
        ended_at: null,
        age_declined_at: new Date(),
      }),
    ).toBe('age_blocked');
  });

  it('lets ended win over a declined attestation', () => {
    expect(
      deriveClientStatus({
        activated_at: null,
        ended_at: new Date(),
        age_declined_at: new Date(),
      }),
    ).toBe('ended');
  });
});

/**
 * The consent line on Page 2 renders this value, and the read gate uses the
 * same window — so the sentence and the permission cannot drift apart.
 */
describe('chatAccessState', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('is not_requested when the therapist never asked', () => {
    expect(chatAccessState(null)).toEqual({ state: 'not_requested' });
    expect(
      chatAccessState({
        chat_access_requested_at: null,
        chat_access_granted_at: null,
        chat_access_closed_at: null,
      }),
    ).toEqual({ state: 'not_requested' });
  });

  it('is waiting_for_client after a request the client has not answered', () => {
    const requestedAt = new Date('2026-11-01T09:00:00Z');
    expect(
      chatAccessState({
        chat_access_requested_at: requestedAt,
        chat_access_granted_at: null,
        chat_access_closed_at: null,
      }),
    ).toEqual({ state: 'waiting_for_client', requestedAt: requestedAt.toISOString() });
  });

  it('is open for 30 days from the approval, not from the request', () => {
    const grantedAt = new Date('2026-11-01T09:00:00Z');
    const state = chatAccessState(
      {
        // Asked two months ago, approved yesterday: the window follows the
        // approval.
        chat_access_requested_at: new Date('2026-09-01T09:00:00Z'),
        chat_access_granted_at: grantedAt,
        chat_access_closed_at: null,
      },
      grantedAt.getTime() + 2 * DAY,
    );
    expect(state.state).toBe('open');
    if (state.state !== 'open') throw new Error('unreachable');
    expect(state.expiresAt).toBe(new Date(grantedAt.getTime() + 30 * DAY).toISOString());
  });

  it('is closed when the client revoked', () => {
    const grantedAt = new Date('2026-11-01T09:00:00Z');
    const closedAt = new Date('2026-11-02T09:00:00Z');
    expect(
      chatAccessState({
        chat_access_requested_at: null,
        chat_access_granted_at: grantedAt,
        chat_access_closed_at: closedAt,
      }),
    ).toEqual({
      state: 'closed',
      grantedAt: grantedAt.toISOString(),
      closedAt: closedAt.toISOString(),
    });
  });

  it('is closed once the 30 days have run out', () => {
    const grantedAt = new Date('2026-11-01T09:00:00Z');
    const state = chatAccessState(
      {
        chat_access_requested_at: null,
        chat_access_granted_at: grantedAt,
        chat_access_closed_at: null,
      },
      grantedAt.getTime() + 31 * DAY,
    );
    expect(state.state).toBe('closed');
  });
});
