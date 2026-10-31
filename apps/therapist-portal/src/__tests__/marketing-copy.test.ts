import { describe, it, expect } from 'vitest';
import { copy } from '@/lib/marketing/copy';

/**
 * The landing page's claim guard.
 *
 * docs/product/landing-page-copy.md §12 lists three classes of word the page
 * must not use: lines the clinical authority rejected by name, clinical claims
 * nobody has signed (the claims matrix is still open), and things that are
 * simply untrue of this build — there is no Play Store listing, no billing, no
 * certification. Copy lives in one module precisely so this test can look at
 * every string that reaches a visitor.
 *
 * Deliberately a substring check on the flattened copy rather than a lint
 * rule: it fails on the string, not on the intent, which is the only thing a
 * future editor cannot argue with.
 */

function flatten(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (value && typeof value === 'object') return Object.values(value).flatMap(flatten);
  return [];
}

const strings = flatten(copy);
const haystack = strings.join('\n').toLowerCase();

/**
 * Words and phrases that must never appear. Grouped by why, so a failure
 * points at the right reviewer rather than at a style preference.
 */
const BANNED = {
  // Rejected by the clinical authority on 30 Oct 2026 — never re-introduce
  // these, in any variant that puts the product in the room with the reader.
  clinical_rejection: [
    'take a breath with me',
    "i'm here with you",
    "we're here for you",
    'here for you',
    "someone's always there",
    'never alone',
    "i'm not going anywhere",
    'stay with me',
  ],
  // Unsigned clinical claims (claims matrix D–G is still open).
  clinical_claim: [
    'clinically reviewed',
    'clinically validated',
    'evidence-based',
    'approved by therapists',
    'therapist-approved',
    'trauma-informed',
    'medical device',
    'cures',
    'cure ',
    'cbt',
    'dbt',
  ],
  // Untrue of this build: no store listing, no billing, no certification.
  untrue: [
    'download on google play',
    'available on the play store',
    'free trial',
    'cancel anytime',
    '24/7',
    'always available',
    'end-to-end encrypted',
    '100% secure',
    'hipaa',
    'iso 27001',
    'dpdp compliant',
    'gdpr ready',
    'trusted by',
    'thousands of users',
    '₹',
  ],
  // Tone.
  tone: ['journey', 'safe space', 'seamless', 'empower', 'unlock', 'revolutionise', 'holistic'],
} as const;

describe('landing page copy — claim guard', () => {
  it('has copy to check', () => {
    expect(strings.length).toBeGreaterThan(50);
  });

  for (const [group, phrases] of Object.entries(BANNED)) {
    for (const phrase of phrases) {
      it(`does not contain the banned ${group} phrase: "${phrase}"`, () => {
        expect(haystack).not.toContain(phrase.toLowerCase());
      });
    }
  }

  it('uses no exclamation marks anywhere', () => {
    expect(haystack).not.toContain('!');
  });

  it('states the crisis number plainly and does not invent others', () => {
    expect(copy.crisis.line).toBe('If someone is in danger right now, call 112.');
    // No other helpline is authored on this page: the expanded list is a
    // clinical deliverable (decision record item 1), not a copywriting task.
    expect(haystack).not.toContain('icall');
    expect(haystack).not.toContain('vandrevala');
    expect(haystack).not.toContain('14416');
  });
});
