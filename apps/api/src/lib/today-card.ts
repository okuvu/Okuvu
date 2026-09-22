import { prisma } from './prisma.js';
import { getQuoteOfDay } from './quote-of-day.js';
import { markClientActivatedIfNeeded } from './client-activation.js';
import { getActiveHomework } from './homework.js';
import { toView as toAppointmentView } from './appointments.js';
import type { TodayCard } from '@okuvu/shared-types';

export type GetTodayCardResult =
  | { status: 'ok'; card: TodayCard }
  | { status: 'user_not_found' };

// §D Today-card — pull-based homework + active reminders. Push/scheduler
// delivery is a separate, out-of-scope-this-pass workstream; this is what
// the mobile Home screen polls when the app is open.
export async function getTodayCard(firebaseUid: string): Promise<GetTodayCardResult> {
  const user = await prisma.user.findUnique({
    where: { firebase_uid: firebaseUid },
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
          granted: therapistRelationship.chat_access_granted,
        }
      : null,
    nextAppointment: nextAppointment ? toAppointmentView(nextAppointment) : null,
    assignedExercises,
    defaultBoxBreathingPacePreset: pacePresetByToolId.get('box_breathing') ?? 'standard',
    careEnded: endedRelationship !== null,
    careEndedByTherapistName: endedRelationship?.therapist.name ?? null,
    displayAbbreviation: user.clinical_config?.display_abbreviation ?? null,
  };

  return { status: 'ok', card };
}
