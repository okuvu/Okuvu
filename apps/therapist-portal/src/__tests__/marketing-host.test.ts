import { describe, it, expect } from 'vitest';
import { isPortalEntryHost } from '@/lib/marketing/host';

/**
 * `portal.okuvu.in` was the app entry point before the landing page existed,
 * and therapists have it bookmarked. `/` renders marketing on the apex and
 * www, but must keep redirecting on the portal subdomain — otherwise a
 * launching beta silently changes the address every existing user types.
 */

describe('isPortalEntryHost', () => {
  it('treats the portal subdomain as the app', () => {
    expect(isPortalEntryHost('portal.okuvu.in')).toBe(true);
    expect(isPortalEntryHost('PORTAL.okuvu.in')).toBe(true);
    expect(isPortalEntryHost('portal.okuvu.in:443')).toBe(true);
  });

  it('leaves the apex and www on the landing page', () => {
    expect(isPortalEntryHost('okuvu.in')).toBe(false);
    expect(isPortalEntryHost('www.okuvu.in')).toBe(false);
    expect(isPortalEntryHost('okuvu.in:443')).toBe(false);
    expect(isPortalEntryHost('localhost:3000')).toBe(false);
    expect(isPortalEntryHost('localhost')).toBe(false);
  });

  it('does not match a host that merely contains the word', () => {
    expect(isPortalEntryHost('notportal.okuvu.in')).toBe(false);
    expect(isPortalEntryHost('my-portal.okuvu.in')).toBe(false);
    expect(isPortalEntryHost('portalx.okuvu.in')).toBe(false);
  });

  it('is safe on a missing or empty header', () => {
    expect(isPortalEntryHost(null)).toBe(false);
    expect(isPortalEntryHost(undefined)).toBe(false);
    expect(isPortalEntryHost('')).toBe(false);
  });
});
