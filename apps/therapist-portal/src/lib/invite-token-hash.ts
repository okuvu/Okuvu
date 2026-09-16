import { createHash } from 'node:crypto';

// Invite codes are short (8 chars) but drawn from a high-entropy random
// alphabet (node:crypto's randomInt, not user-chosen) and single-purpose —
// the standard "hash an API-key-shaped secret at rest" pattern, not a
// user password, so a fast one-way hash (not bcrypt/scrypt) is the right
// tool: it protects against a DB read/leak, which is the threat this is
// closing. Must stay byte-identical to the API's own copy of this function
// (apps/api/src/crypto/invite-token-hash.ts) — two separate deployables,
// no shared runtime package between them for this, so keep both in sync
// by hand if either changes.
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token.trim().toUpperCase()).digest('hex');
}
