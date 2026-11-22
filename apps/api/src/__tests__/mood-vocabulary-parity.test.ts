import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FEELING_WORDS,
  GENTLE_CARD_BUTTONS,
  GENTLE_CARD_LINE,
  HEAVY_FEELING_WORDS,
  MOOD_FACES,
} from '@okuvu/shared-types/mood';

/**
 * The mood vocabulary exists twice: `packages/shared-types/mood.ts` for the api
 * and the portal, and `apps/mobile/lib/src/features/mood/mood_vocabulary.dart`
 * for the app, which cannot import TypeScript. Two hand-kept copies of approved
 * copy drift, and the drift shows up as a client seeing a different word from
 * the one the therapist reads.
 *
 * So this test reads the Dart file as text and compares it with the TS module.
 * A wording change has to be made in both places or the suite fails here — and
 * that is the point: the owner's list is the list.
 */

function repoPath(...parts: string[]): string {
  const candidates = [
    resolve(process.cwd(), '..', '..', ...parts),
    resolve(process.cwd(), '..', ...parts),
    resolve(process.cwd(), ...parts),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Could not find ${parts.join('/')} from ${process.cwd()}`);
}

const dart = readFileSync(
  repoPath('mobile', 'lib', 'src', 'features', 'mood', 'mood_vocabulary.dart'),
  'utf8',
);

function section(name: string): string {
  const start = dart.indexOf(name);
  if (start === -1) throw new Error(`${name} not found in the Dart vocabulary`);
  const end = dart.indexOf('\n];', start);
  return end === -1 ? dart.slice(start) : dart.slice(start, end);
}

describe('the mood vocabulary the app and the api share', () => {
  it('has the same five face labels, in the same order', () => {
    const block = section('const List<MoodFaceStyle> kMoodFaces');
    const labels = [...block.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
    expect(labels).toEqual(MOOD_FACES.map((face) => face.label));
    expect(labels).toEqual(['Awful', 'Low', 'Okay', 'Good', 'Great']);
  });

  it('has the same 18 feeling words, in the same groups', () => {
    const block = section('const List<List<String>> kFeelingGroups');
    const words = [...block.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(words).toEqual([...FEELING_WORDS]);
    expect(words).toHaveLength(18);
    // The four groups, in the owner's order.
    expect(words.slice(0, 4)).toEqual(['anxious', 'angry', 'overwhelmed', 'restless']);
    expect(words.slice(4, 9)).toEqual(['sad', 'lonely', 'tired', 'numb', 'hopeless']);
    expect(words.slice(9, 13)).toEqual(['calm', 'relieved', 'content', 'grateful']);
    expect(words.slice(13)).toEqual(['happy', 'excited', 'hopeful', 'proud', 'motivated']);
  });

  it('shows the gentle card for the same two words on both sides', () => {
    const match = /kHeavyFeelingWords\s*=\s*\[([^\]]*)\]/.exec(dart);
    expect(match).not.toBeNull();
    const words = [...match![1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(words).toEqual([...HEAVY_FEELING_WORDS]);
    expect(words).toEqual(['hopeless', 'numb']);
  });

  it('carries the gentle card line verbatim, as one Dart literal', () => {
    const match = /kGentleCardLine\s*=\s*"([^"]+)";/.exec(dart);
    expect(match).not.toBeNull();
    expect(match![1]).toBe(GENTLE_CARD_LINE);
  });

  it('carries the three gentle card buttons verbatim', () => {
    const chat = /kGentleChatLabel\s*=\s*'([^']+)'/.exec(dart);
    const support = /kGentleSupportLabel\s*=\s*'([^']+)'/.exec(dart);
    const notNow = /kGentleNotNowLabel\s*=\s*'([^']+)'/.exec(dart);
    expect(chat?.[1]).toBe(GENTLE_CARD_BUTTONS.chat);
    expect(support?.[1]).toBe(GENTLE_CARD_BUTTONS.supportLines);
    expect(notNow?.[1]).toBe(GENTLE_CARD_BUTTONS.notNow);
  });

  it('keeps the strength scale at 1-5 in both', () => {
    expect(/kStrengthMin\s*=\s*1;/.test(dart)).toBe(true);
    expect(/kStrengthMax\s*=\s*5;/.test(dart)).toBe(true);
    expect(/kStrengthLowLabel\s*=\s*'a little'/.test(dart)).toBe(true);
    expect(/kStrengthHighLabel\s*=\s*'a lot'/.test(dart)).toBe(true);
    expect(/kStrengthQuestion\s*=\s*'How strong is this feeling\?'/.test(dart)).toBe(true);
  });
});
