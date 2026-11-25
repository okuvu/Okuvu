import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExposureLadderList } from '@/app/clients/[id]/exposure/_components/ExposureLadderList';
import ClientExposurePage from '@/app/clients/[id]/exposure/page';
import { inLadderOrder, parseDifficulty, swapPositions, type LadderStep } from '@/lib/exposure-ladder';

/**
 * The page's data source, stubbed: the ladder is the shape `exposure.list`
 * returns, deliberately out of order so the page has to put it in position
 * order itself.
 */
vi.mock('@/trpc/client', () => {
  const mutation = () => ({
    mutate: () => {},
    mutateAsync: async () => ({ ok: true }),
    isPending: false,
  });

  return {
    trpc: {
      exposure: {
        list: {
          useQuery: () => ({
            data: {
              steps: [
                {
                  id: 'c',
                  label: 'Ask a question in class',
                  difficulty: 90,
                  position: 2,
                  unlocked: false,
                  lastRun: null,
                },
                {
                  id: 'a',
                  label: 'Say hello at the till',
                  difficulty: 20,
                  position: 0,
                  unlocked: true,
                  lastRun: { before: 70, after: 45, createdAt: '2026-11-20T10:00:00.000Z' },
                },
                {
                  id: 'b',
                  label: 'Order a coffee',
                  difficulty: 55,
                  position: 1,
                  unlocked: false,
                  lastRun: null,
                },
              ],
              unlockedCount: 1,
            },
            isLoading: false,
            isError: false,
            refetch: async () => {},
          }),
        },
        add: { useMutation: mutation },
        update: { useMutation: mutation },
        setUnlocked: { useMutation: mutation },
        remove: { useMutation: mutation },
      },
      clients: {
        header: {
          useQuery: () => ({ data: { clientLabel: 'Ana', clientCode: null } }),
        },
      },
    },
  };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'client-1' }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

/**
 * The exposure ladder page's rendering contract.
 *
 * There is no jsdom harness in this app, so these render the list component
 * with `react-dom/server` and read the markup it produces. The three things
 * asserted here are the three things that would be silent if broken: the ladder
 * coming out of order, a locked step not being marked as locked, and the
 * client's two numbers being collapsed into one (a difference, a total, some
 * percentage) by a later "improvement" of this page.
 */

function step(overrides: Partial<LadderStep> & { id: string; label: string }): LadderStep {
  return {
    position: 0,
    difficulty: 50,
    unlocked: false,
    lastRun: null,
    ...overrides,
  };
}

const noop = () => {};

function render(steps: LadderStep[]): string {
  return renderToStaticMarkup(
    <ExposureLadderList
      steps={steps}
      clientLabel="Ana"
      onUnlock={noop}
      onLock={noop}
      onRemove={noop}
      onMove={noop}
      onSave={noop}
    />,
  );
}

/** One HTML block per rendered step, so a label can be checked against its own state. */
function stepBlocks(html: string): string[] {
  return html.split('data-testid="ladder-step"').slice(1);
}

function labelsIn(html: string): string[] {
  return [...html.matchAll(/data-testid="step-label"[^>]*>([^<]*)</g)].map((match) => match[1]);
}

function textOf(html: string, testId: string): string[] {
  return [...html.matchAll(new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`, 'g'))].map(
    (match) => match[1],
  );
}

describe('exposure ladder page', () => {
  it('renders the steps in the order they were built, with the locked ones marked', () => {
    const steps = [
      step({ id: 'c', label: 'Ask a question in class', position: 2 }),
      step({ id: 'a', label: 'Say hello at the till', position: 0, unlocked: true }),
      step({ id: 'b', label: 'Order a coffee', position: 1 }),
    ];

    const html = render(inLadderOrder(steps));
    const blocks = stepBlocks(html);

    expect(labelsIn(html)).toEqual([
      'Say hello at the till',
      'Order a coffee',
      'Ask a question in class',
    ]);
    expect(blocks).toHaveLength(3);
    // Every step carries its state as text, not colour alone.
    expect(textOf(blocks[0], 'lock-state')).toEqual(['Unlocked for them']);
    expect(textOf(blocks[1], 'lock-state')).toEqual(['Locked']);
    expect(textOf(blocks[2], 'lock-state')).toEqual(['Locked']);
    expect(blocks[0]).toContain('data-locked="false"');
    expect(blocks[1]).toContain('data-locked="true"');
    expect(blocks[2]).toContain('data-locked="true"');
    // A locked step says so in words, not only in the chip.
    expect(blocks[1]).toContain('Ana cannot see this step yet.');
    expect(blocks[0]).not.toContain('cannot see this step yet');
  });

  it('renders a step’s before and after as two separate numbers', () => {
    const html = render([
      step({
        id: 'a',
        label: 'Order a coffee',
        unlocked: true,
        lastRun: { before: 70, after: 45, createdAt: '2026-11-20T10:00:00.000Z' },
      }),
    ]);

    expect(textOf(html, 'rating-before')).toEqual(['70']);
    expect(textOf(html, 'rating-after')).toEqual(['45']);
    expect(html).toContain('Before');
    expect(html).toContain('After');

    // Two numbers chosen at two moments, for a step that has only been rated
    // before it was tried: the second is "not yet", never 0 and never a figure
    // derived from the first.
    const beforeOnly = render([
      step({
        id: 'b',
        label: 'Ask a question in class',
        lastRun: { before: 85, after: null, createdAt: '2026-11-20T10:00:00.000Z' },
      }),
    ]);
    expect(textOf(beforeOnly, 'rating-before')).toEqual(['85']);
    expect(textOf(beforeOnly, 'rating-after')).toEqual(['Not yet']);
    expect(beforeOnly).not.toContain('>0<');
  });

  it('renders no aggregate, percentage or chart for the ratings', () => {
    const html = render([
      step({
        id: 'a',
        label: 'Say hello at the till',
        unlocked: true,
        lastRun: { before: 90, after: 20, createdAt: '2026-11-20T10:00:00.000Z' },
      }),
      step({
        id: 'b',
        label: 'Order a coffee',
        position: 1,
        lastRun: { before: 60, after: 55, createdAt: '2026-11-21T10:00:00.000Z' },
      }),
    ]);

    expect(html).not.toContain('%');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<canvas');
    expect(html.toLowerCase()).not.toMatch(
      /average|total|progress|difference|improvement|improv|points|score|reduced by|dropped by|a drop|went from/,
    );
    // The two numbers are shown and nothing is computed between them: 90 - 20
    // would be 70, and 70 must not appear anywhere near these ratings.
    expect(textOf(html, 'rating-before')).toEqual(['90', '60']);
    expect(textOf(html, 'rating-after')).toEqual(['20', '55']);
    expect(html).not.toMatch(/data-testid="rating-(before|after)"[^>]*>70</);
    expect(html).not.toContain('110');
    expect(html).not.toContain('42.5');
  });
});

describe('exposure ladder page itself', () => {
  it('renders the ladder from the router in position order, with the locked steps marked', () => {
    const html = renderToStaticMarkup(<ClientExposurePage />);
    const blocks = stepBlocks(html);

    expect(labelsIn(html)).toEqual([
      'Say hello at the till',
      'Order a coffee',
      'Ask a question in class',
    ]);
    expect(blocks).toHaveLength(3);
    expect(textOf(blocks[0], 'lock-state')).toEqual(['Unlocked for them']);
    expect(textOf(blocks[1], 'lock-state')).toEqual(['Locked']);
    expect(textOf(blocks[2], 'lock-state')).toEqual(['Locked']);
  });

  it('shows the client’s two ratings and nothing computed from them', () => {
    const html = renderToStaticMarkup(<ClientExposurePage />);

    expect(textOf(html, 'rating-before')).toEqual(['70']);
    expect(textOf(html, 'rating-after')).toEqual(['45']);
    expect(html).not.toContain('%');
    expect(html).not.toContain('<svg');
    expect(html.toLowerCase()).not.toMatch(
      /average|total|progress|difference|improvement|improv|points|score|reduced by|dropped by/,
    );
    // 70 - 45 is 25; 70 + 45 is 115. Neither appears beside the ratings.
    expect(textOf(html, 'rating-before')).not.toContain('25');
    expect(textOf(html, 'rating-after')).not.toContain('115');
  });

  it('offers the builder: add, unlock, lock, edit, move and remove', () => {
    const html = renderToStaticMarkup(<ClientExposurePage />);

    expect(html).toContain('Add step');
    expect(html).toContain('Unlock for them');
    expect(html).toContain('Lock again');
    expect(html).toContain('Edit');
    expect(html).toContain('Move up');
    expect(html).toContain('Move down');
    expect(html).toContain('Remove');
  });
});

describe('exposure ladder arithmetic', () => {
  it('sorts by position and keeps incoming order on a tie', () => {
    const steps = [
      step({ id: 'x', label: 'X', position: 1 }),
      step({ id: 'y', label: 'Y', position: 0 }),
      step({ id: 'z', label: 'Z', position: 1 }),
    ];
    expect(inLadderOrder(steps).map((entry) => entry.id)).toEqual(['y', 'x', 'z']);
  });

  it('moves a step by trading positions with its neighbour, and does nothing at either end', () => {
    const steps = [
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
      { id: 'c', position: 2 },
    ];

    expect(swapPositions(steps, 1, 'up')).toEqual([
      { stepId: 'b', position: 0 },
      { stepId: 'a', position: 1 },
    ]);
    expect(swapPositions(steps, 1, 'down')).toEqual([
      { stepId: 'b', position: 2 },
      { stepId: 'c', position: 1 },
    ]);
    expect(swapPositions(steps, 0, 'up')).toBeNull();
    expect(swapPositions(steps, 2, 'down')).toBeNull();
  });

  it('accepts only a whole number from 0 to 100 as a difficulty', () => {
    expect(parseDifficulty('0')).toBe(0);
    expect(parseDifficulty(' 100 ')).toBe(100);
    expect(parseDifficulty('45')).toBe(45);
    expect(parseDifficulty('')).toBeNull();
    expect(parseDifficulty('101')).toBeNull();
    expect(parseDifficulty('-1')).toBeNull();
    expect(parseDifficulty('4.5')).toBeNull();
    expect(parseDifficulty('abc')).toBeNull();
  });
});
