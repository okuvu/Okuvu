import { describe, it, expect } from 'vitest';
import { deriveClientStatus } from '../clients';

describe('deriveClientStatus (therapist-portal wireframes C-07/C-08)', () => {
  it('is pending when neither activated_at nor ended_at is set', () => {
    expect(deriveClientStatus({ activated_at: null, ended_at: null })).toBe('pending');
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
});
