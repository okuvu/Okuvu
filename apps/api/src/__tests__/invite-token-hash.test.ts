import { describe, it, expect } from 'vitest';
import { hashInviteToken } from '../crypto/invite-token-hash.js';

describe('hashInviteToken', () => {
  it('is deterministic for the same input', () => {
    expect(hashInviteToken('AB12CD34')).toBe(hashInviteToken('AB12CD34'));
  });

  it('normalizes case before hashing, so a lowercase paste still matches', () => {
    expect(hashInviteToken('ab12cd34')).toBe(hashInviteToken('AB12CD34'));
  });

  it('normalizes surrounding whitespace before hashing', () => {
    expect(hashInviteToken('  AB12CD34  ')).toBe(hashInviteToken('AB12CD34'));
  });

  it('produces different hashes for different tokens', () => {
    expect(hashInviteToken('AB12CD34')).not.toBe(hashInviteToken('WX98YZ76'));
  });

  it('produces a 64-character lowercase hex SHA-256 digest', () => {
    const hash = hashInviteToken('AB12CD34');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
