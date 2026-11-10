/**
 * The feeling vocabulary, once.
 *
 * Two worksheets use a feelings picker (2 and 5), and a third will. Keeping the
 * families and their finer words in one list means a client meets the same
 * words in the same order everywhere, and there is one place to change when the
 * clinical lead approves finer words for the remaining families.
 *
 * What is here is exactly what the approved document gives: seven families, and
 * the finer words it names under "scared". No other family has finer words yet
 * — those would be new clinical copy, not a translation.
 */
import type { WorksheetFeeling } from '@okuvu/shared-types/worksheet';

export const FEELINGS_EN: WorksheetFeeling[] = [
  { id: 'sad', label: 'sad' },
  { id: 'scared', label: 'scared' },
  { id: 'angry', label: 'angry' },
  { id: 'ashamed', label: 'ashamed' },
  { id: 'happy', label: 'happy' },
  { id: 'calm', label: 'calm' },
  { id: 'numb', label: 'numb' },
  { id: 'worried', label: 'worried', parent: 'scared' },
  { id: 'panicky', label: 'panicky', parent: 'scared' },
  { id: 'unsafe', label: 'unsafe', parent: 'scared' },
  { id: 'on_edge', label: 'on edge', parent: 'scared' },
];

export const FEELINGS_HI: WorksheetFeeling[] = [
  { id: 'sad', label: 'udaas' },
  { id: 'scared', label: 'dara hua' },
  { id: 'angry', label: 'gussa' },
  { id: 'ashamed', label: 'sharminda' },
  { id: 'happy', label: 'khush' },
  { id: 'calm', label: 'shaant' },
  { id: 'numb', label: 'sunn' },
  { id: 'worried', label: 'pareshan', parent: 'scared' },
  { id: 'panicky', label: 'ghabrahat', parent: 'scared' },
  { id: 'unsafe', label: 'unsafe lag raha', parent: 'scared' },
  { id: 'on_edge', label: 'chidchida / edge par', parent: 'scared' },
];
