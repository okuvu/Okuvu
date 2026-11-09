import { prisma } from './prisma.js';
import { getQuoteOfDay } from './quote-of-day.js';
import { markClientActivatedIfNeeded } from './client-activation.js';
import { getActiveHomework } from './homework.js';
import { toView as toAppointmentView } from './appointments.js';
import type { TodayCard, TodayNextItem } from '@okuvu/shared-types';
import { chatAccessWindow } from '@okuvu/shared-types';

export type GetTodayCardResult =
  | { status: 'ok'; card: TodayCard }
  | { status: 'user_not_found' };

/**
 * The one item the Today card shows (owner's Step 5 rule).
 *
 * Assigned first: the soonest due assignment that is still active, with its
 * length from the catalogue. A row with no `due_at` is still a candidate — the
 * therapist assigned it and it is not done — but a dated one wins, and ties
 * break on the older assignment so the list cannot reshuffle between two
 * refreshes and look like a different ask.
 *
 * Otherwise one light exercise from the catalogue. Deterministic on purpose
 * (the first approved, open, light exercise by sort order): an exercise that
 * changes every time the card refreshes reads as a notification the client has
 * to keep up with.
 */
async function resolveNextItem(userId: string): Promise<TodayNextItem | null> {
  try {
    return await chooseNextItem(userId);
  } catch (err) {
    // The card is one line on the home screen; a catalogue read that fails must
    // not take the greeting, the appointment and the rest of the payload down
    // with it. No item is a worse card, not a broken home screen.
    console.error('[today-card] could not choose the one item for today', {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function chooseNextItem(userId: string): Promise<TodayNextItem | null> {
  const assigned = await prisma.homework.findMany({
    where: {
      client_user_id: userId,
      status: 'active',
      tool_id: { not: null },
      tool: { status: 'approved' },
    },
    select: {
      id: true,
      tool_id: true,
      due_at: true,
      assigned_at: true,
      tool: { select: { label: true, est_minutes: true, load_level: true } },
    },
  });

  if (assigned.length > 0) {
    const soonest = [...assigned].sort((a, b) => {
      const aDue = a.due_at ? a.due_at.getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.due_at ? b.due_at.getTime() : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      return a.assigned_at.getTime() - b.assigned_at.getTime();
    })[0];

    return {
      source: 'assigned',
      toolId: soonest.tool_id,
      homeworkId: soonest.id,
      label: soonest.tool?.label ?? 'An exercise from your therapist',
      estMinutes: soonest.tool?.est_minutes ?? null,
      dueAt: soonest.due_at ? soonest.due_at.toISOString() : null,
      loadLevel: soonest.tool?.load_level ?? null,
    };
  }

  // An exercise first (the thing "a light exercise" means to the client), then a
  // light self-serve worksheet if the catalogue has no exercise row left.
  const suggestion =
    (await prisma.toolRegistryEntry.findFirst({
      where: {
        status: 'approved',
        kind: 'exercise',
        access_mode: 'open',
        load_level: 'light',
        library_group: null,
      },
      orderBy: [{ sort_order: 'asc' }, { tool_id: 'asc' }],
      select: { tool_id: true, label: true, est_minutes: true, load_level: true },
    })) ??
    (await prisma.toolRegistryEntry.findFirst({
      where: {
        status: 'approved',
        kind: 'worksheet',
        access_mode: 'open',
        load_level: 'light',
      },
      orderBy: [{ sort_order: 'asc' }, { tool_id: 'asc' }],
      select: { tool_id: true, label: true, est_minutes: true, load_level: true },
    }));

  if (!suggestion) return null;

  return {
    source: 'suggested',
    toolId: suggestion.tool_id,
    homeworkId: null,
    label: suggestion.label,
    estMinutes: suggestion.est_minutes ?? null,
    dueAt: null,
    loadLevel: suggestion.load_level ?? null,
  };
}

// §D Today-card — pull-based homework + active reminders. Push/scheduler
// delivery is a separate, out-of-scope-this-pass workstream; this is what
// the mobile Home screen polls when the app is open.
export async function getTodayCard(authSubject: string): Promise<GetTodayCardResult> {
  const user = await prisma.user.findUnique({
    where: { auth_subject: authSubject },
    select: {
      id: true,
      quote_of_day_enabled: true,
      clinical_config: { select: { care_plan_id: true, display_abbreviation: true } },
    },
  });

  if (!user) {
    return { status: 'user_not_found' };
  }

  await markClientActivatedIfNeeded(user.id);

  // Decisions doc round, 15 Sep 2026 §4 — real playable exercises (active
  // Homework rows with a tool_id link), plus the client's own pace
  // preferences (their default box breathing, and any assigned exercise) —
  // UserToolPreference covers both under one query.
  const [assignedHomework, toolPreferences, activeHomework] = await Promise.all([
    prisma.homework.findMany({
      where: { client_user_id: user.id, status: 'active', tool_id: { not: null } },
      select: { tool: { select: { tool_id: true, label: true, text: true } } },
    }),
    prisma.userToolPreference.findMany({
      where: { user_id: user.id },
      select: { tool_id: true, pace_preset: true },
    }),
    getActiveHomework(user.id),
  ]);

  const pacePresetByToolId = new Map(toolPreferences.map((p) => [p.tool_id, p.pace_preset]));

  const assignedExercises = assignedHomework
    .filter((h) => h.tool !== null)
    .map((h) => ({
      toolId: h.tool!.tool_id,
      label: h.tool!.label,
      text: h.tool!.text,
      pacePreset: pacePresetByToolId.get(h.tool!.tool_id) ?? 'standard',
    }));

  const reminders = await prisma.reminder.findMany({
    where: { user_id: user.id, active: true },
    include: { tool: { select: { label: true } } },
    orderBy: { created_at: 'desc' },
  });

  // Therapist-portal wireframes — the client's current (non-ended) therapist
  // relationship, if any. Powers both the "Request chat access" Grant/Not-now
  // banner (pendingChatAccessRequest, only when there's an unanswered
  // request) and the app wireframes' T3 Settings revoke toggle
  // (therapistChatAccess, always present when assigned) — one query serving
  // both, rather than a second lookup for the latter.
  const therapistRelationship = await prisma.therapistClient.findFirst({
    where: { client_user_id: user.id, ended_at: null },
    orderBy: { created_at: 'desc' },
    select: {
      therapist_id: true,
      chat_access_granted: true,
      chat_access_requested_at: true,
      chat_access_granted_at: true,
      chat_access_closed_at: true,
      therapist: { select: { name: true } },
    },
  });

  const pendingRequest =
    therapistRelationship &&
    !therapistRelationship.chat_access_granted &&
    therapistRelationship.chat_access_requested_at
      ? therapistRelationship
      : null;

  // Decisions doc round, 15 Sep 2026 §11 — "care relationship ended." Only
  // looked up when there's no active relationship, since a client can be
  // re-provisioned to a new therapist later (a fresh, non-ended row) without
  // this stale close screen re-appearing.
  const endedRelationship = therapistRelationship
    ? null
    : await prisma.therapistClient.findFirst({
        where: { client_user_id: user.id, ended_at: { not: null } },
        orderBy: { ended_at: 'desc' },
        select: { therapist: { select: { name: true } } },
      });

  // App wireframes A1 — Home's "next session" card. Same split logic as
  // GET /users/me/appointments' upcoming list (lib/appointments.ts), just
  // limited to the single soonest row.
  const nextAppointment = await prisma.appointment.findFirst({
    where: { client_user_id: user.id, scheduled_at: { gte: new Date() }, cancelled_at: null },
    orderBy: { scheduled_at: 'asc' },
    include: { therapist: { select: { name: true } } },
  });

  const next = await resolveNextItem(user.id);

  const card: TodayCard = {
    homeworkId: activeHomework?.id ?? null,
    homework: activeHomework?.description ?? null,
    reminders: reminders.map((r) => ({
      id: r.id,
      scheduleNote: r.schedule_note,
      toolLabel: r.tool?.label ?? null,
    })),
    // okuvu-remaining-changes.md O6: placeholder content, care-plan-aware,
    // opt-in — see apps/api/src/lib/quote-of-day.ts.
    quote: user.quote_of_day_enabled && user.clinical_config
      ? getQuoteOfDay(user.clinical_config.care_plan_id)
      : null,
    pendingChatAccessRequest: pendingRequest
      ? { therapistId: pendingRequest.therapist_id, therapistName: pendingRequest.therapist.name }
      : null,
    therapistChatAccess: therapistRelationship
      ? {
          therapistId: therapistRelationship.therapist_id,
          therapistName: therapistRelationship.therapist.name,
          // Not the bare boolean: the client's Settings switch renders this as
          // "Shared with your therapist", and the portal only opens the
          // transcript while `chat_access_granted_at` is inside the 30-day
          // window and nothing closed it. Reading the boolean alone let the app
          // claim "Shared" on a grant the portal refused — a client who never
          // re-approved, or a window that expired, showed as still shared.
          granted: chatAccessWindow(therapistRelationship) !== null,
        }
      : null,
    nextAppointment: nextAppointment ? toAppointmentView(nextAppointment) : null,
    assignedExercises,
    defaultBoxBreathingPacePreset: pacePresetByToolId.get('box_breathing') ?? 'standard',
    // Owner round 2 (3 Nov 2026) — the Breathe screen now offers every
    // approved exercise, not just the box-breathing default, so each one
    // needs its own saved pace back on the next launch.
    toolPacePresets: Object.fromEntries(pacePresetByToolId),
    careEnded: endedRelationship !== null,
    careEndedByTherapistName: endedRelationship?.therapist.name ?? null,
    displayAbbreviation: user.clinical_config?.display_abbreviation ?? null,
    next,
  };

  return { status: 'ok', card };
}
