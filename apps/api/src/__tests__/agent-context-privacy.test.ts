/**
 * HARD PRIVACY RULE (portal redesign, Page 1/2 brief):
 *
 *   The therapist's label for a client, the therapist's Clinical Reasoning,
 *   and Session Notes must NEVER reach an AI agent's context or prompt.
 *
 * This is a guard, not a fix: getAgentContextBundle maps ClinicalConfig down
 * to id / care_plan_id / assignment_state and takes only the therapist's NAME
 * from the assignment, so nothing leaks today. But `clinical_config: true` in
 * the include clause fetches the WHOLE row — including `reasoning_note` — and
 * the only thing standing between that object and a prompt is the hand-written
 * mapping below it. A later field added to the mapping, or a refactor that
 * spreads the row instead of picking from it, is exactly the change this test
 * exists to fail.
 *
 * Three assertions, because they fail for different reasons:
 *   1. the QUERY never asks for the label, the reasoning note or a note row;
 *   2. the BUNDLE carries none of them, even when the row is full of them;
 *   3. the ASSEMBLED PROMPT carries none of them, built the way the
 *      orchestrator builds it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildConversationalPrompt } from '../agents/a2/prompts.js';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    turn: { findMany: vi.fn().mockResolvedValue([]) },
    homework: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

/**
 * Strings that cannot occur by accident: if one appears anywhere in the
 * bundle or the prompt, something passed it through.
 */
const LABEL = 'ZZ-LABEL-OnlyTherapistSees-7f3a';
const REASONING = 'ZZ-REASONING-PrivateClinicalNote-91bd';
const NOTE = 'ZZ-SESSIONNOTE-NeverShowTheAgent-4e2c';

const AUTH_SUBJECT = 'privacy-test-subject';

function fullUserRow() {
  return {
    id: 'user-privacy',
    auth_subject: AUTH_SUBJECT,
    phone_number: '+910000000000',
    email: 'client@example.test',
    full_name: 'Client Legal Name',
    language_mode: 'english' as const,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-06-29'),
    safety_state: {
      id: 'ss-1',
      user_id: 'user-privacy',
      safety_state_current: 'S1' as const,
      safety_state_at_last_session_end: 'S1' as const,
      updated_at: new Date('2026-06-29'),
    },
    clinical_config: {
      id: 'cc-1',
      user_id: 'user-privacy',
      care_plan_id: 'CP1' as const,
      assignment_state: 'confirmed' as const,
      // The two fields the portal shows and the agent must never read.
      reasoning_note: REASONING,
      care_plan_focus: 'sleep and morning routine',
      confidence_at_last_eval: 0.8,
      turns_evaluated: 12,
    },
    engagement_profile: {
      current_streak: 3,
      longest_streak: 9,
      voice_mode_enabled: false,
      consent_1: true,
      consent_2: false,
      consent_3: false,
      consent_4: false,
    },
    session_logs: [
      {
        id: 'sess-1',
        user_id: 'user-privacy',
        session_started_at: new Date('2026-06-28T14:00:00Z'),
        session_ended_at: new Date('2026-06-28T14:30:00Z'),
        turn_count: 8,
        session_feedback_score: 4,
        summaries: [{ summary_text: 'Talked about sleep.', status: 'COMPLETED' }],
      },
    ],
    session_summaries: [
      { summary_text: 'Talked about sleep.', created_at: new Date('2026-06-28T15:00:00Z') },
    ],
    user_memory: null,
    // The therapist's private label lives on the assignment row. The query
    // selects only `therapist.name`, so this must not survive the mapping.
    assigned_therapists: [
      {
        client_label: LABEL,
        therapist: { name: 'Dr Rao' },
      },
    ],
    // Session notes are a separate table the context query does not touch.
    notes_received: [{ content: NOTE }],
  };
}

async function loadMocks() {
  const { prisma } = await import('../lib/prisma.js');
  const { getAgentContextBundle } = await import('../lib/agent-context.js');
  return { prisma, getAgentContextBundle };
}

describe('agent context privacy — therapist label, clinical reasoning, session notes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never asks the database for the label, the reasoning note or a note row', async () => {
    const { prisma, getAgentContextBundle } = await loadMocks();
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(fullUserRow());

    await getAgentContextBundle(AUTH_SUBJECT);

    const query = JSON.stringify((prisma.user.findUnique as ReturnType<typeof vi.fn>).mock.calls);
    expect(query).not.toContain('reasoning_note');
    expect(query).not.toContain('client_label');
    expect(query).not.toContain('notes_received');
    expect(query).not.toContain('TherapistNote');
  });

  it('builds a bundle that carries none of the three, even from a full row', async () => {
    const { prisma, getAgentContextBundle } = await loadMocks();
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(fullUserRow());

    const bundle = await getAgentContextBundle(AUTH_SUBJECT);

    // Sanity: the bundle is not empty, so the assertions below are meaningful.
    expect(bundle.therapist_name).toBe('Dr Rao');
    expect(bundle.care_plan?.care_plan_id).toBe('CP1');

    const serialised = JSON.stringify(bundle);
    expect(serialised).not.toContain(LABEL);
    expect(serialised).not.toContain(REASONING);
    expect(serialised).not.toContain(NOTE);
  });

  it('assembles a prompt that carries none of the three', async () => {
    const { prisma, getAgentContextBundle } = await loadMocks();
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(fullUserRow());

    const bundle = await getAgentContextBundle(AUTH_SUBJECT);

    // Same extraction the orchestrator performs (pipeline/orchestrator.ts):
    // only whitelisted bundle fields reach the prompt builder.
    const prompt = buildConversationalPrompt({
      safetyState: bundle.safety_state ?? 'S0',
      sessionHistorySummary: bundle.session_summary,
      perceivedIntensity: null,
      userMemoryContext: null,
      retrievedContext: null,
      therapistName: bundle.therapist_name,
      carePlanFocus: bundle.care_plan_focus,
      homework: bundle.homework,
      toolkit: [],
      languageMode: bundle.language_mode,
    });

    expect(prompt).toContain('Dr Rao');
    expect(prompt).not.toContain(LABEL);
    expect(prompt).not.toContain(REASONING);
    expect(prompt).not.toContain(NOTE);
  });
});
