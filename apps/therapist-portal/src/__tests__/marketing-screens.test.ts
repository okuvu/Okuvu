import { describe, it, expect } from 'vitest';
import { screens, screenFor, type ScreenName } from '@/lib/marketing/screens';
import { copy } from '@/lib/marketing/copy';

/**
 * The screenshot-slot contract.
 *
 * These are not tests of a feature; they protect two things that are easy to
 * break silently: a slot losing its alt text (an illustration becomes an
 * unlabelled picture for a screen reader), and a slot being invented in the
 * component without a home in screens.ts.
 */
const NAMES: ScreenName[] = ['chat', 'mood', 'journal', 'breathing', 'appointments', 'portal'];

describe('marketing screens', () => {
  it('has an entry for every slot the page renders', () => {
    expect(Object.keys(screens).sort()).toEqual([...NAMES].sort());
  });

  it('returns the mapped source for a slot and null when unset', () => {
    for (const name of NAMES) {
      expect(screenFor(name)).toBe(screens[name]);
      // Today every slot is null: the illustrations stand in. When a real
      // screenshot lands this branch simply stops applying for that slot.
      expect(screens[name] === null || typeof screens[name] === 'string' || typeof screens[name] === 'object').toBe(true);
    }
  });

  it('has alt text for every slot, and calls it an illustration while it is drawn', () => {
    for (const name of NAMES) {
      const alt = copy.art.screenAlt[name];
      expect(alt.length, name).toBeGreaterThan(20);
      if (screens[name] === null) {
        expect(alt.toLowerCase(), name).toContain('illustration');
      }
    }
  });

  it('does not caption a drawn slot as a screenshot', () => {
    for (const value of Object.values(copy.art)) {
      if (typeof value !== 'string') continue;
      expect(value.toLowerCase()).not.toContain('screenshot');
    }
  });
});
