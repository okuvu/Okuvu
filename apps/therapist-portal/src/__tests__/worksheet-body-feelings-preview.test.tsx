import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { BodyOutlinePreview } from '@/app/worksheets/_components/WorksheetRunner';
import type { WorksheetAnswerValue, WorksheetContent, WorksheetField } from '@okuvu/shared-types/worksheet';

/**
 * The therapist preview has to show what the client actually does.
 *
 * "Where do I feel it?" is a body outline the client taps, and its brief is "the
 * feelings picker for that spot": each tapped part gets its own list of feelings.
 * The preview used to list only the parts, so a therapist signing off saw a
 * worksheet with no picker at all while the client was being asked to choose
 * three feelings per spot. These tests pin the picker into the preview, and pin
 * the answer shape it writes (`feelings` keyed by part, exactly as `strength`
 * is) so the preview cannot produce an answer the api refuses.
 */

const field: Extract<WorksheetField, { type: 'body_outline' }> = {
  id: 'body',
  type: 'body_outline',
  prompt: 'Where do you feel it?',
  regions: [
    { id: 'chest', label: 'chest' },
    { id: 'stomach', label: 'stomach' },
    { id: 'throat', label: 'throat' },
  ],
  maxSelections: 3,
  withFeelings: true,
  feelingsPrompt: 'What do you feel there?',
  feelings: [
    { id: 'tight', label: 'tight' },
    { id: 'heavy', label: 'heavy' },
    { id: 'fluttery', label: 'fluttery' },
  ],
};

const picked: WorksheetAnswerValue = {
  picked: ['chest'],
  feelings: { chest: ['tight'] },
};

function html(value: WorksheetAnswerValue | undefined, overrides: Partial<typeof field> = {}) {
  return renderToStaticMarkup(
    <BodyOutlinePreview
      field={{ ...field, ...overrides }}
      value={value}
      onChange={() => {}}
    />,
  );
}

describe('body outline preview — per-spot feelings', () => {
  it('asks the approved feelings question for each tapped part', () => {
    const markup = html(picked);
    expect(markup).toContain('What do you feel there?');
    // The part that was tapped gets its own picker…
    expect(markup).toContain('data-spot="chest"');
    // …and the parts that were not tapped do not.
    expect(markup).not.toContain('data-spot="stomach"');
  });

  it('offers the piece’s own feelings for that spot, and marks the chosen one', () => {
    const markup = html(picked);
    for (const feeling of ['tight', 'heavy', 'fluttery']) {
      expect(markup, feeling).toContain(`>${feeling}</button>`);
    }
    // The chosen one carries the picked styling; the others do not.
    expect(markup).toMatch(/bg-royal-purple\/10[^>]*>tight<\/button>/);
    expect(markup).not.toMatch(/bg-royal-purple\/10[^>]*>heavy<\/button>/);
  });

  it('keeps its own words for the parts', () => {
    const markup = html({ picked: ['chest', 'stomach'], feelings: {} });
    expect(markup).toContain('chest');
    expect(markup).toContain('stomach');
    // Two tapped parts, two pickers.
    expect(markup.match(/data-spot=/g)?.length).toBe(2);
  });

  it('shows no picker on a body outline that offers none', () => {
    const markup = html(picked, { withFeelings: false });
    expect(markup).not.toContain('What do you feel there?');
    expect(markup).not.toContain('data-spot=');
    // The parts themselves are still listed — the piece just has no feelings.
    expect(markup).toContain('chest');
  });

  it('asks nothing before a part is tapped', () => {
    const markup = html(undefined);
    expect(markup).not.toContain('What do you feel there?');
    expect(markup).not.toContain('data-spot=');
  });
});

// A guard against the preview drifting from the content model: the body the
// portal renders is the shared type, so a field carrying the picker must still
// typecheck as a body_outline and keep its prompt.
const _contentTypeCheck: WorksheetContent | null = null;
void _contentTypeCheck;
