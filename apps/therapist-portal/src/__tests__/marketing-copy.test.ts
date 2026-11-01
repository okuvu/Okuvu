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
    // The page states that what it describes works in the beta today, so
    // nothing on it may promise a feature that does not exist yet.
    'coming soon',
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
    // Copy revision v1 §10/§14 adds Tele-MANAS 14416 to the page. Both numbers
    // are in the block the clinical lead signed on 31 Oct 2026 (block final
    // 1 Nov 2026, five entries), and the wording keeps her phrasing rather than
    // inventing "24×7".
    expect(copy.crisis.helpline).toContain('Tele-MANAS');
    expect(copy.crisis.helpline).toContain('14416');
    // The rest of the signed set is deliberately not on the page: a marketing
    // footer is not a crisis card, and two actable numbers are enough. Nothing
    // outside the signed set may appear at all.
    expect(haystack).not.toContain('icall');
    expect(haystack).not.toContain('vandrevala');
    expect(haystack).not.toContain('sneha');
    expect(haystack).not.toContain('9152987821');
    expect(haystack).not.toContain('044-24640050');
  });

  it('says it is AI, and says it is not a person, before anything else', () => {
    // Copy revision v1 §5/§8. These are the two claims that must survive any
    // future edit: the product is software, and the page says so plainly.
    expect(copy.ai.h2).toContain('Okuvu is AI');
    expect(copy.isnt.items[0].title).toBe('Not a person');
    expect(copy.footer.line).toContain('AI wellbeing companion');
    expect(copy.footer.line).toContain('not a person');
  });

  it('keeps the therapist-readable summary claim exact', () => {
    // The step-3 safety line (§4) is absent on purpose: both options the
    // revision offers are false of this build — crisis turns are summarised
    // with a safety flag, and no real-time alert exists. This test is here so
    // that an editor cannot paste either one back in without deleting a test
    // that says why.
    const how = copy.how.steps.map((step) => step.body).join(' ').toLowerCase();
    expect(how).not.toContain('your therapist is told, separately from the summary');
    expect(how).not.toContain('are not summarised');
  });
});
