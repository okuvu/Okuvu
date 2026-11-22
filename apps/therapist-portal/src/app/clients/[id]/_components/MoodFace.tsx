/**
 * The five mood faces, drawn as SVG in the OKUVU brand colours.
 *
 * This is the same drawing as the client app's `MoodFacePainter` — identical
 * 48-unit geometry, identical colours — so the therapist sees the face the
 * client tapped rather than a different emoji on a different platform. Flutter
 * cannot share a widget with React, so this file mirrors the Dart painter; the
 * words themselves come from `@okuvu/shared-types/mood` on both sides.
 *
 * No emoji anywhere: a system emoji font cannot take the brand palette and
 * renders differently on every device.
 */
import { MOOD_FACES, type MoodFaceKey } from '@okuvu/shared-types/mood';

const FACE_PAINT: Record<MoodFaceKey, { stroke: string; fill: string }> = {
  awful: { stroke: '#5E2E91', fill: '#EDE9FE' }, // royalPurple / lavenderTint
  low: { stroke: '#6E62B4', fill: '#EFE9FC' }, // indigoViolet / orchidWash
  okay: { stroke: '#6E658A', fill: '#F7F3FD' }, // inkSoft / oat
  good: { stroke: '#4E7564', fill: '#E4EFE9' }, // sageDeep / sageTint
  great: { stroke: '#D68F24', fill: '#FBF0DC' }, // honeyDeep / honeyTint
};

const MOUTHS: Record<MoodFaceKey, string> = {
  awful: 'M15 32 Q24 22.5 33 32',
  low: 'M16 31 Q24 25.5 32 31',
  okay: 'M16 30 Q24 30 32 30',
  good: 'M16 29 Q24 34.5 32 29',
  great: 'M15 28 Q24 38 33 28',
};

export function moodFaceValueKey(value: number): MoodFaceKey | null {
  return MOOD_FACES.find((face) => face.value === value)?.key ?? null;
}

export function moodFaceLabel(value: number): string {
  return MOOD_FACES.find((face) => face.value === value)?.label ?? '';
}

export function MoodFace({
  value,
  size = 32,
}: {
  value: number;
  size?: number;
}) {
  const key = moodFaceValueKey(value);
  if (!key) return null;
  const paint = FACE_PAINT[key];
  const hasBrows = key === 'awful' || key === 'low';
  const inner = key === 'awful' ? 18.4 : 18;
  const outer = key === 'awful' ? 14.6 : 15.2;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={moodFaceLabel(value)}
      className="shrink-0"
    >
      <circle cx="24" cy="24" r="20" fill={paint.fill} stroke={paint.stroke} strokeWidth="2" />
      <circle cx="17" cy="20" r="2.2" fill={paint.stroke} />
      <circle cx="31" cy="20" r="2.2" fill={paint.stroke} />
      {hasBrows && (
        <>
          <line x1="13" y1={outer} x2="20" y2={inner} stroke={paint.stroke} strokeWidth="2" strokeLinecap="round" />
          <line x1="35" y1={outer} x2="28" y2={inner} stroke={paint.stroke} strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      <path d={MOUTHS[key]} fill="none" stroke={paint.stroke} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
