import type { TestRunStatus } from '@okuvu/shared-types';

export interface RunStatusPresentation {
  label: string;
  /** Text + border color classes for badges/chips. */
  colorClass: string;
  /** Background color class for the small status dot. */
  dotClass: string;
  /**
   * Colorblind-safe glyph paired with the text label so status is never
   * conveyed by color/dot alone (WCAG 1.4.1). Rendered as visible text
   * (not decorative-only) by consumers such as RunStatusBadge.
   */
  icon: string;
}

/**
 * Centralized status → presentation mapping.
 *
 * Resolved sprint convention (overriding an inconsistency in the original
 * planning doc between "green=running" and "blue=running"):
 *   PASS = green, HALT = red, WARNING = amber, RUNNING = blue, ERROR = gray.
 *
 * Nothing outside this module should hardcode run-status colors. The `icon`
 * field is the single source of truth for the non-color status glyph too —
 * added in TH-S28 so every consumer (badges, dashboard chips) gets the fix
 * for free instead of re-deriving an icon per status locally.
 */
const RUN_STATUS_MAP: Record<TestRunStatus, RunStatusPresentation> = {
  pass: {
    label: 'Pass',
    colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    dotClass: 'bg-emerald-500',
    icon: '✓', // ✓
  },
  halt: {
    label: 'Halt',
    colorClass: 'text-red-700 bg-red-50 border-red-200',
    dotClass: 'bg-red-500',
    icon: '✕', // ✕
  },
  warning: {
    label: 'Warning',
    colorClass: 'text-amber-700 bg-amber-50 border-amber-200',
    dotClass: 'bg-amber-500',
    icon: '⚠', // ⚠
  },
  running: {
    label: 'Running',
    colorClass: 'text-blue-700 bg-blue-50 border-blue-200',
    dotClass: 'bg-blue-500',
    icon: '↻', // ↻
  },
  error: {
    label: 'Error',
    colorClass: 'text-gray-700 bg-gray-100 border-gray-300',
    dotClass: 'bg-gray-500',
    icon: '?',
  },
  // B1 (OKUVU — Plumbing Fixes & Rationale v1.0): a run where a pipeline
  // stage failed or no-oped. Amber/outline treatment — visually distinct
  // from both pass and halt, and excluded from scorecard aggregation.
  incomplete: {
    label: 'Incomplete',
    colorClass: 'text-amber-700 bg-amber-50 border-amber-300',
    dotClass: 'bg-amber-300',
    icon: '◌', // ◌ dashed circle — neither ✓ nor ✕: the run didn't finish honestly
  },
};

export function getRunStatusPresentation(status: TestRunStatus): RunStatusPresentation {
  return RUN_STATUS_MAP[status];
}
