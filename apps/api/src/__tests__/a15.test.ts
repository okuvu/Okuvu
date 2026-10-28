import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MEMORY_KINDS,
  applyMemoryUpdate,
  checkAddition,
  emptyMemoryState,
  findCrisisContent,
  isMemoryKind,
  normaliseMemoryText,
} from '../agents/a15/memory.js';
import { A15_AGENT_ID, MAX_MEMORY_CONTEXT_CHARS, buildMemoryContext, updateMemory } from '../agents/a15/agent.js';
import { MAX_MEMORY_TEXT_CHARS, MEMORY_CAPS } from '../agents/a15/types.js';
import type { MemoryItem, MemoryState, MemoryUpdate } from '../agents/a15/types.js';

const NOW = '2026-03-04T09:00:00.000Z';
const EARLIER = '2026-02-01T09:00:00.000Z';

function makeState(overrides: Partial<MemoryState> = {}): MemoryState {
  return { clientId: 'client-1', sessionCount: 3, updatedAt: EARLIER, items: [], ...overrides };
}

let itemCounter = 0;

function makeItem(overrides: Partial<MemoryItem> = {}): MemoryItem {
  itemCounter += 1;
  return {
    kind: 'life_context',
    text: `item ${itemCounter}`,
    firstSeen: EARLIER,
    lastSeen: EARLIER,
    mentions: 1,
    ...overrides,
  };
}

function texts(state: MemoryState): string[] {
  return state.items.map((item) => item.text);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

describe('A15 Memory & Continuity — applyMemoryUpdate', () => {
  describe('creation and session counting', () => {
    it('creates a state from null', () => {
      const next = applyMemoryUpdate(null, {
        now: NOW,
        clientId: 'client-1',
        additions: [{ kind: 'life_context', text: 'works night shifts' }],
      });

      expect(next.clientId).toBe('client-1');
      expect(next.sessionCount).toBe(0);
      expect(next.updatedAt).toBe(NOW);
      expect(next.items).toEqual([
        {
          kind: 'life_context',
          text: 'works night shifts',
          firstSeen: NOW,
          lastSeen: NOW,
          mentions: 1,
        },
      ]);
    });

    it('emptyMemoryState has no items and a zero count', () => {
      expect(emptyMemoryState('client-9', NOW)).toEqual({
        clientId: 'client-9',
        sessionCount: 0,
        updatedAt: NOW,
        items: [],
      });
    });

    it('increments sessionCount from null', () => {
      const next = applyMemoryUpdate(null, { now: NOW, clientId: 'client-1', sessionIncrement: true });
      expect(next.sessionCount).toBe(1);
    });

    it('increments sessionCount on an existing state', () => {
      const next = applyMemoryUpdate(makeState({ sessionCount: 7 }), { now: NOW, sessionIncrement: true });
      expect(next.sessionCount).toBe(8);
    });

    it('leaves sessionCount alone without the flag', () => {
      const next = applyMemoryUpdate(makeState({ sessionCount: 7 }), { now: NOW });
      expect(next.sessionCount).toBe(7);
      expect(next.updatedAt).toBe(NOW);
    });

    it('keeps the existing clientId even if the update names another', () => {
      const next = applyMemoryUpdate(makeState({ clientId: 'client-1' }), {
        now: NOW,
        clientId: 'client-2',
      });
      expect(next.clientId).toBe('client-1');
    });

    it('sets updatedAt from the update, not the clock', () => {
      const next = applyMemoryUpdate(makeState(), { now: '2026-06-01T00:00:00.000Z' });
      expect(next.updatedAt).toBe('2026-06-01T00:00:00.000Z');
    });
  });

  describe('dedupe', () => {
    it('collapses a repeat inside one update into one item with two mentions', () => {
      const next = applyMemoryUpdate(null, {
        now: NOW,
        clientId: 'client-1',
        additions: [
          { kind: 'recurring_themes', text: 'fear of being a burden' },
          { kind: 'recurring_themes', text: 'fear of being a burden' },
        ],
      });

      expect(next.items).toHaveLength(1);
      expect(next.items[0].mentions).toBe(2);
      expect(next.items[0].lastSeen).toBe(NOW);
    });

    it('keeps firstSeen from the first sighting and bumps lastSeen', () => {
      const first = applyMemoryUpdate(null, {
        now: EARLIER,
        clientId: 'client-1',
        additions: [{ kind: 'life_context', text: 'caring for her mother' }],
      });
      const second = applyMemoryUpdate(first, {
        now: NOW,
        additions: [{ kind: 'life_context', text: 'caring for her mother' }],
      });

      expect(second.items).toHaveLength(1);
      expect(second.items[0].firstSeen).toBe(EARLIER);
      expect(second.items[0].lastSeen).toBe(NOW);
      expect(second.items[0].mentions).toBe(2);
    });

    it('dedupes on normalised text, not raw text', () => {
      const next = applyMemoryUpdate(null, {
        now: NOW,
        clientId: 'client-1',
        additions: [
          { kind: 'current_stressors', text: 'Work deadlines.' },
          { kind: 'current_stressors', text: '  work   deadlines ' },
        ],
      });

      expect(next.items).toHaveLength(1);
      expect(next.items[0].mentions).toBe(2);
      // The original phrasing is preserved, not the latest one.
      expect(next.items[0].text).toBe('Work deadlines.');
    });

    it('keeps the same text under different kinds separate', () => {
      const next = applyMemoryUpdate(null, {
        now: NOW,
        clientId: 'client-1',
        additions: [
          { kind: 'what_helps', text: 'walking' },
          { kind: 'what_doesnt_help', text: 'walking' },
        ],
      });

      expect(next.items).toHaveLength(2);
      expect(next.items.map((item) => item.kind).sort()).toEqual(['what_doesnt_help', 'what_helps']);
    });

    it('normalises case, punctuation and whitespace deterministically', () => {
      expect(normaliseMemoryText('  Work   DEADLINES!! ')).toBe('work deadlines');
      expect(normaliseMemoryText('mother’s illness')).toBe("mother's illness");
      expect(normaliseMemoryText('!!!')).toBe('');
    });
  });

  describe('caps and eviction', () => {
    it('evicts the item with the oldest lastSeen first', () => {
      const items = Array.from({ length: MEMORY_CAPS.life_context }, (_, index) =>
        makeItem({
          text: `theme ${index}`,
          firstSeen: `2026-01-${String(index + 1).padStart(2, '0')}T09:00:00.000Z`,
          lastSeen: `2026-01-${String(index + 1).padStart(2, '0')}T09:00:00.000Z`,
        }),
      );

      const next = applyMemoryUpdate(makeState({ items }), {
        now: NOW,
        additions: [{ kind: 'life_context', text: 'a brand new theme' }],
      });

      expect(next.items).toHaveLength(MEMORY_CAPS.life_context);
      expect(texts(next)).not.toContain('theme 0');
      expect(texts(next)).toContain('theme 1');
      expect(texts(next)).toContain('a brand new theme');
    });

    it('breaks a lastSeen tie by fewest mentions', () => {
      const items = Array.from({ length: MEMORY_CAPS.life_context }, (_, index) =>
        makeItem({
          text: `theme ${index}`,
          lastSeen: EARLIER,
          firstSeen: EARLIER,
          mentions: index === 3 ? 1 : 4,
        }),
      );

      const next = applyMemoryUpdate(makeState({ items }), {
        now: NOW,
        additions: [{ kind: 'life_context', text: 'a brand new theme' }],
      });

      expect(next.items).toHaveLength(MEMORY_CAPS.life_context);
      expect(texts(next)).not.toContain('theme 3');
    });

    it('breaks a lastSeen+mentions tie by longest text', () => {
      const items = [
        makeItem({ text: 'short', lastSeen: EARLIER, mentions: 2 }),
        makeItem({ text: 'a considerably longer sentence about work', lastSeen: EARLIER, mentions: 2 }),
        makeItem({ text: 'medium length', lastSeen: EARLIER, mentions: 2 }),
      ];
      // Fill the rest of the kind to the cap.
      while (items.length < MEMORY_CAPS.life_context) {
        items.push(makeItem({ text: `filler ${items.length}`, lastSeen: EARLIER, mentions: 5 }));
      }

      const next = applyMemoryUpdate(makeState({ items }), {
        now: NOW,
        additions: [{ kind: 'life_context', text: 'a brand new theme' }],
      });

      expect(next.items).toHaveLength(MEMORY_CAPS.life_context);
      expect(texts(next)).not.toContain('a considerably longer sentence about work');
      expect(texts(next)).toContain('short');
    });

    it('falls back to array order on a full tie, deterministically', () => {
      const items = ['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff', 'ggg', 'hhh'].map((text) =>
        makeItem({ text, lastSeen: EARLIER, mentions: 2 }),
      );

      const next = applyMemoryUpdate(makeState({ items }), {
        now: NOW,
        additions: [{ kind: 'life_context', text: 'zzz new' }],
      });

      expect(next.items).toHaveLength(MEMORY_CAPS.life_context);
      expect(texts(next)).not.toContain('aaa');
      expect(texts(next)).toEqual(['bbb', 'ccc', 'ddd', 'eee', 'fff', 'ggg', 'hhh', 'zzz new']);
    });

    it('enforces the documented cap for every kind', () => {
      for (const kind of MEMORY_KINDS) {
        const cap = MEMORY_CAPS[kind];
        const items = Array.from({ length: cap + 3 }, (_, index) =>
          makeItem({
            kind,
            text: `${kind} ${index}`,
            lastSeen: `2026-01-${String(index + 1).padStart(2, '0')}T09:00:00.000Z`,
          }),
        );

        const next = applyMemoryUpdate(makeState({ items }), {
          now: NOW,
          additions: [{ kind, text: `fresh ${kind}` }],
        });

        expect(next.items.filter((item) => item.kind === kind)).toHaveLength(cap);
        expect(next.items.some((item) => item.text === `fresh ${kind}`)).toBe(true);
      }
    });

    it('exports a sane positive cap for every kind', () => {
      expect(Object.keys(MEMORY_CAPS).sort()).toEqual([...MEMORY_KINDS].sort());
      for (const kind of MEMORY_KINDS) {
        expect(MEMORY_CAPS[kind]).toBeGreaterThan(0);
        expect(MEMORY_CAPS[kind]).toBeLessThanOrEqual(12);
      }
    });
  });

  describe('additions are filtered before they reach memory', () => {
    const crisisExamples = [
      'I have been thinking about suicide again',
      'I cut myself last night after the argument',
      'sometimes I just want to die',
    ];

    it.each(crisisExamples)('drops crisis content: %s', (text) => {
      const next = applyMemoryUpdate(makeState({ items: [makeItem({ text: 'night shifts' })] }), {
        now: NOW,
        additions: [{ kind: 'recurring_themes', text }],
      });

      expect(next.items).toHaveLength(1);
      expect(texts(next)).toEqual(['night shifts']);
    });

    it('drops crisis content on a fresh state too, and still counts the session', () => {
      const next = applyMemoryUpdate(null, {
        now: NOW,
        clientId: 'client-1',
        sessionIncrement: true,
        additions: [{ kind: 'current_stressors', text: 'I want to die most evenings' }],
      });

      expect(next.items).toEqual([]);
      expect(next.sessionCount).toBe(1);
    });

    it.each([
      ['suicide', 'I have been thinking about suicide again'],
      ['self_harm', 'I self-harm when the week gets bad'],
      ['self_harm', 'I hurt myself after work'],
      ['suicide', "I don't want to be here anymore"],
    ])('recognises the %s pattern', (label, text) => {
      expect(findCrisisContent(text)).toBe(label);
    });

    it('does not treat bereavement as crisis content', () => {
      const grief = 'my father died last year and I still miss him';
      expect(findCrisisContent(grief)).toBeNull();

      const next = applyMemoryUpdate(null, {
        now: NOW,
        clientId: 'client-1',
        additions: [{ kind: 'significant_events', text: grief }],
      });
      expect(texts(next)).toEqual([grief]);
    });

    it('drops an over-long addition and keeps one at exactly the limit', () => {
      const tooLong = 'a'.repeat(MAX_MEMORY_TEXT_CHARS + 1);
      const atLimit = 'b'.repeat(MAX_MEMORY_TEXT_CHARS);

      const next = applyMemoryUpdate(null, {
        now: NOW,
        clientId: 'client-1',
        additions: [
          { kind: 'life_context', text: tooLong },
          { kind: 'life_context', text: atLimit },
        ],
      });

      expect(next.items).toHaveLength(1);
      expect(next.items[0].text).toHaveLength(MAX_MEMORY_TEXT_CHARS);
      expect(next.items[0].text).toBe(atLimit);
    });

    it.each(['', '   ', '\n\t '])('drops an empty addition (%j)', (text) => {
      const next = applyMemoryUpdate(null, {
        now: NOW,
        clientId: 'client-1',
        additions: [{ kind: 'life_context', text }],
      });
      expect(next.items).toEqual([]);
    });

    it('drops an unknown kind at runtime', () => {
      const next = applyMemoryUpdate(null, {
        now: NOW,
        clientId: 'client-1',
        additions: [{ kind: 'astrology' as 'life_context', text: 'leo rising' }],
      });
      expect(next.items).toEqual([]);
      expect(isMemoryKind('astrology')).toBe(false);
      expect(isMemoryKind('what_helps')).toBe(true);
    });

    it('reports every rejection reason from checkAddition', () => {
      expect(checkAddition('life_context', 'ok text')).toEqual({ ok: true, kind: 'life_context', text: 'ok text' });
      expect(checkAddition('life_context', '')).toEqual({ ok: false, kind: 'life_context', reason: 'empty' });
      expect(checkAddition('life_context', 'x'.repeat(241))).toMatchObject({ ok: false, reason: 'too_long' });
      expect(checkAddition('life_context', 'I want to die')).toMatchObject({ ok: false, reason: 'crisis_content' });
      expect(checkAddition('astrology', 'leo')).toMatchObject({ ok: false, reason: 'unknown_kind' });
      expect(checkAddition('life_context', 42)).toMatchObject({ ok: false, reason: 'empty' });
    });
  });

  describe('purity', () => {
    it('is deterministic — same input twice gives a deeply equal state', () => {
      const state = deepFreeze(
        makeState({
          items: [makeItem({ text: 'night shifts', mentions: 2, lastSeen: EARLIER })],
        }),
      );
      const update = deepFreeze<MemoryUpdate>({
        now: NOW,
        sessionIncrement: true,
        additions: [
          { kind: 'life_context', text: 'night shifts' },
          { kind: 'what_helps', text: 'walking the dog' },
        ],
      });

      const first = applyMemoryUpdate(state, update);
      const second = applyMemoryUpdate(state, update);

      expect(first).toEqual(second);
      expect(first).not.toBe(second);
    });

    it('does not mutate the input state or its items', () => {
      const base = makeState({ items: [makeItem({ text: 'night shifts', mentions: 2 })] });
      const snapshot = JSON.parse(JSON.stringify(base));
      deepFreeze(base);

      const next = applyMemoryUpdate(base, {
        now: NOW,
        sessionIncrement: true,
        additions: [{ kind: 'life_context', text: 'night shifts' }],
      });

      expect(base).toEqual(snapshot);
      expect(next).not.toBe(base);
      expect(next.items[0]).not.toBe(base.items[0]);
      expect(next.items[0].mentions).toBe(3);
      expect(base.items[0].mentions).toBe(2);
    });

    it('does not mutate the update, including its additions array', () => {
      const update: MemoryUpdate = {
        now: NOW,
        additions: [{ kind: 'life_context', text: '  night   shifts  ' }],
      };
      const snapshot = JSON.parse(JSON.stringify(update));
      deepFreeze(update);

      expect(() => applyMemoryUpdate(makeState(), update)).not.toThrow();
      expect(update).toEqual(snapshot);
    });

    it('returns a fresh top-level object even with no changes to apply', () => {
      const base = makeState();
      const next = applyMemoryUpdate(base, { now: NOW });
      expect(next).not.toBe(base);
      expect(next.items).not.toBe(base.items);
    });
  });
});

describe('A15 agent wrapper', () => {
  it('wraps an update and returns the new state', () => {
    const out = updateMemory({
      state: null,
      update: { now: NOW, clientId: 'client-1', sessionIncrement: true, additions: [{ kind: 'what_helps', text: 'walking' }] },
    });

    expect(out.agentId).toBe(A15_AGENT_ID);
    expect(out.fallbackUsed).toBe(false);
    expect(out.failureReason).toBeNull();
    expect(out.state.sessionCount).toBe(1);
    expect(out.state.items).toHaveLength(1);
    expect(out.droppedAdditions).toEqual([]);
  });

  it('reports dropped additions with their reasons, rather than swallowing them', () => {
    const out = updateMemory({
      state: null,
      update: {
        now: NOW,
        clientId: 'client-1',
        additions: [
          { kind: 'recurring_themes', text: 'I want to die' },
          { kind: 'life_context', text: 'x'.repeat(MAX_MEMORY_TEXT_CHARS + 1) },
          { kind: 'life_context', text: '  ' },
          { kind: 'life_context', text: 'works nights' },
        ],
      },
    });

    expect(out.state.items.map((item) => item.text)).toEqual(['works nights']);
    expect(out.droppedAdditions.map((drop) => drop.reason)).toEqual(['crisis_content', 'too_long', 'empty']);
    expect(out.fallbackUsed).toBe(false);
  });

  it('builds no context when memory is empty', () => {
    expect(buildMemoryContext(null)).toBeNull();
    expect(buildMemoryContext(makeState())).toBeNull();
  });

  it('builds bounded context that names the kind of each item', () => {
    const state = makeState({
      sessionCount: 4,
      items: [
        makeItem({ kind: 'life_context', text: 'caring for her mother' }),
        makeItem({ kind: 'what_helps', text: 'walking the dog' }),
      ],
    });

    const context = buildMemoryContext(state);

    expect(context).toContain('Sessions so far: 4');
    expect(context).toContain('- [life_context] caring for her mother');
    expect(context).toContain('- [what_helps] walking the dog');
    expect(context).toBe(buildMemoryContext(state));
  });

  it('truncates context to the char budget on item boundaries', () => {
    const items = Array.from({ length: 40 }, (_, index) =>
      makeItem({ text: `theme number ${index} ${'x'.repeat(60)}` }),
    );

    const context = buildMemoryContext(makeState({ items })) as string;

    expect(context.length).toBeLessThanOrEqual(MAX_MEMORY_CONTEXT_CHARS);
    for (const line of context.split('\n')) {
      expect(line).toMatch(/^(Sessions so far: \d+|- \[[a-z_]+\] .+)$/);
    }
  });

  it('never imports an LLM client', () => {
    for (const file of ['../agents/a15/agent.ts', '../agents/a15/memory.ts', '../agents/a15/types.ts']) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(source).not.toContain('generate-content');
      expect(source).not.toContain('generateContent');
    }
  });
});
