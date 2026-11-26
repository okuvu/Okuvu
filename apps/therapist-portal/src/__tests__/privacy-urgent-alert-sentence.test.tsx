import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import PrivacyPolicyPage from '@/app/privacy/page';

/**
 * The privacy page must carry the approved urgent-alert sentence, word for word.
 *
 * The sentence is the client's only written promise about what happens when
 * they disclose wanting to hurt someone: the safety system shows help, tells
 * the therapist it is urgent, and — the one exception to "it does not share what
 * you wrote" — lets the therapist read that answer so they can judge how serious
 * it is. Behaviour and wording have to stay in step: the therapist's ability to
 * read that specific answer was built for this, and a page that still promised
 * "your therapist can't read this" without the exception would be a lie in the
 * one situation where it matters most.
 *
 * Pinned against the rendered HTML rather than the source file, so a sentence
 * moved into a different element, array or component still has to survive. The
 * old promise is asserted absent for the same reason: it is true about ordinary
 * entries and false about this one, and leaving it beside the new sentence
 * creates the contradiction the sentence exists to remove.
 */

const APPROVED =
  "The journal feature itself. Your therapist can't read this unless you choose to share it. " +
  "If OKUVU's safety system notices you may be in danger, it will show you help straight away " +
  'and let your therapist know you may need support. It does not share what you wrote, with one ' +
  'exception: if you write that you want to hurt someone else, your therapist is told it is ' +
  'urgent and can read that answer, so they can judge how serious it is. This applies to journal ' +
  'entries, chat messages, worksheet answers and Treasure Box notes alike.';

/** What the page said before the exception existed. It must not come back. */
const OLD_PROMISE = 'Journal text is yours; it is not shown to your therapist';

/**
 * React escapes `'` and `"` in text nodes, so the rendered markup does not
 * contain the sentence as written. Decode the five entities React emits, then
 * collapse whitespace so a line seam inside the JSX cannot break the match.
 */
function readable(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('privacy page — the urgent-alert sentence', () => {
  const text = readable(renderToStaticMarkup(<PrivacyPolicyPage />));

  it('says, word for word, what happens when someone writes that they want to hurt someone else', () => {
    expect(text).toContain(APPROVED);
  });

  it('still promises the ordinary case: entries are not shared unless the client chooses', () => {
    expect(text).toContain("Your therapist can't read this unless you choose to share it.");
  });

  it('names the one exception and the urgency, not just "support"', () => {
    // The distinct half: without these the sentence would describe a normal
    // alert, and the therapist could not read the client's own words.
    expect(text).toContain('with one exception: if you write that you want to hurt someone else');
    expect(text).toContain('your therapist is told it is urgent and can read that answer');
  });

  it('names every surface the exception applies to', () => {
    for (const surface of [
      'journal entries',
      'chat messages',
      'worksheet answers',
      'Treasure Box notes',
    ]) {
      expect(text, surface).toContain(surface);
    }
  });

  it('does not carry the old promise that entries are simply never shown', () => {
    expect(text).not.toContain(OLD_PROMISE);
  });
});
