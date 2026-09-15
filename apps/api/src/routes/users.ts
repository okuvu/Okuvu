import { FastifyInstance } from 'fastify';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { getAgentContextBundle } from '../lib/agent-context.js';
import { getQuoteOfDay } from '../lib/quote-of-day.js';
import { markClientActivatedIfNeeded } from '../lib/client-activation.js';
import { toView as toAppointmentView } from './appointments.js';
import type { UserConsent, CarePlanId, AssignmentState, TodayCard } from '@okuvu/shared-types';

interface CarePlanBody {
  care_plan_id: CarePlanId;
  assignment_state: AssignmentState;
  confidence_at_last_eval: number;
  turns_evaluated: number;
  reasoning_note: string;
}

interface ChatAccessBody {
  therapist_id: string;
  granted: boolean;
}

interface WelcomeAbbreviationBody {
  display_abbreviation: string;
}

const VALID_CARE_PLANS: CarePlanId[] = ['CP1', 'CP2', 'CP3'];
const VALID_ASSIGNMENT_STATES: AssignmentState[] = ['provisional', 'confirmed'];

export async function userRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: UserConsent }>('/users/me/consent', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = request.body;

      if (body.safety_monitoring !== true) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_CONSENT',
            message: 'safety_monitoring must be true',
          },
        });
      }

      const user = await prisma.user.findUnique({
        where: { firebase_uid: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      await prisma.engagementProfile.upsert({
        where: { user_id: user.id },
        create: {
          user_id: user.id,
          consent_1: body.safety_monitoring,
          consent_2: body.mood_inference,
          consent_3: body.assessment,
          consent_4: body.emergency_contact,
        },
        update: {
          consent_1: body.safety_monitoring,
          consent_2: body.mood_inference,
          consent_3: body.assessment,
          consent_4: body.emergency_contact,
        },
      });

      request.log.info(
        { event: 'consent_updated', user_id: user.id, changes: body },
        'Consent preferences updated',
      );

      reply.send({ success: true });
    },
  });

  app.get('/users/me/context', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const bundle = await getAgentContextBundle(uid);
      return reply.send(bundle);
    },
  });

  // §D Today-card — pull-based homework + active reminders. Push/scheduler
  // delivery is a separate, out-of-scope-this-pass workstream; this route
  // is what the mobile Home screen polls when the app is open.
  app.get('/users/me/today', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await prisma.user.findUnique({
        where: { firebase_uid: uid },
        select: {
          id: true,
          quote_of_day_enabled: true,
          homeworks: {
            where: { status: 'active' },
            take: 1,
            orderBy: { assigned_at: 'desc' },
            select: { id: true, description: true },
          },
          clinical_config: { select: { care_plan_id: true } },
        },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      await markClientActivatedIfNeeded(user.id);

      const reminders = await prisma.reminder.findMany({
        where: { user_id: user.id, active: true },
        include: { tool: { select: { label: true } } },
        orderBy: { created_at: 'desc' },
      });

      // Therapist-portal wireframes — the client's current (non-ended)
      // therapist relationship, if any. Powers both the "Request chat
      // access" Grant/Not-now banner (pendingChatAccessRequest, only when
      // there's an unanswered request) and the app wireframes' T3 Settings
      // revoke toggle (therapistChatAccess, always present when assigned) —
      // one query serving both, rather than a second lookup for the latter.
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

      // App wireframes A1 — Home's "next session" card. Same split logic as
      // GET /users/me/appointments' upcoming list (appointments.ts), just
      // limited to the single soonest row.
      const nextAppointment = await prisma.appointment.findFirst({
        where: { client_user_id: user.id, scheduled_at: { gte: new Date() }, cancelled_at: null },
        orderBy: { scheduled_at: 'asc' },
        include: { therapist: { select: { name: true } } },
      });

      const body: TodayCard = {
        homeworkId: user.homeworks[0]?.id ?? null,
        homework: user.homeworks[0]?.description ?? null,
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
      };

      reply.send(body);
    },
  });

  // Therapist-portal wireframes — the first-ever CLIENT-facing write path
  // for chat_access_granted. Previously this field was portal-attestation-
  // only (set once at Add-Client time by the therapist/admin). This lets
  // the client actually grant or deny a therapist's "Request chat access"
  // themselves, closing the consent-model gap flagged earlier this session.
  app.patch<{ Body: ChatAccessBody }>('/users/me/chat-access', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = request.body;

      if (typeof body?.therapist_id !== 'string' || typeof body?.granted !== 'boolean') {
        return reply.status(400).send({
          error: { code: 'INVALID_BODY', message: 'therapist_id (string) and granted (boolean) are required' },
        });
      }

      const user = await prisma.user.findUnique({
        where: { firebase_uid: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      const assignment = await prisma.therapistClient.findUnique({
        where: {
          therapist_id_client_user_id: {
            therapist_id: body.therapist_id,
            client_user_id: user.id,
          },
        },
        select: { id: true },
      });

      if (!assignment) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'No such therapist relationship' },
        });
      }

      await prisma.therapistClient.update({
        where: { id: assignment.id },
        data: { chat_access_granted: body.granted, chat_access_requested_at: null },
      });

      request.log.info(
        { event: 'chat_access_updated', user_id: user.id, therapist_id: body.therapist_id, granted: body.granted },
        'Client updated chat_access_granted',
      );

      reply.send({ success: true });
    },
  });

  // §D user-confirmed homework completion. Product spec requires
  // completion be BOTH user-confirmed (this route) and chat-reported
  // (Worker 05's homework_progress) — therapist-side markCompleted
  // (therapist-portal homework.ts) remains the separate therapist path.
  app.post<{ Params: { id: string } }>('/users/me/homework/:id/complete', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { id } = request.params;

      const user = await prisma.user.findUnique({
        where: { firebase_uid: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      const homework = await prisma.homework.findUnique({
        where: { id },
        select: { client_user_id: true },
      });

      if (!homework || homework.client_user_id !== user.id) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Homework not found' },
        });
      }

      const updated = await prisma.homework.update({
        where: { id },
        data: { status: 'completed' },
      });

      reply.send({ success: true, status: updated.status });
    },
  });

  app.patch<{ Params: { id: string }; Body: CarePlanBody }>('/users/:id/care-plan', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { id } = request.params;
      const body = request.body;

      if (!VALID_CARE_PLANS.includes(body.care_plan_id)) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_CARE_PLAN_ID',
            message: 'care_plan_id must be one of CP1, CP2, CP3',
          },
        });
      }

      if (!VALID_ASSIGNMENT_STATES.includes(body.assignment_state)) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_ASSIGNMENT_STATE',
            message: 'assignment_state must be one of provisional, confirmed',
          },
        });
      }

      const user = await prisma.user.findUnique({
        where: { firebase_uid: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      if (user.id !== id) {
        return reply.status(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Cannot update another user\'s care plan',
          },
        });
      }

      const existing = await prisma.clinicalConfig.findUnique({
        where: { user_id: user.id },
        select: { turns_evaluated: true, assignment_state: true },
      });

      if (existing && body.turns_evaluated < existing.turns_evaluated) {
        return reply.status(400).send({
          error: {
            code: 'STALE_TURNS_EVALUATED',
            message: `turns_evaluated (${body.turns_evaluated}) is lower than current stored value (${existing.turns_evaluated})`,
          },
        });
      }

      const result = await prisma.clinicalConfig.upsert({
        where: { user_id: user.id },
        create: {
          user_id: user.id,
          care_plan_id: body.care_plan_id,
          assignment_state: body.assignment_state,
          confidence_at_last_eval: body.confidence_at_last_eval,
          turns_evaluated: body.turns_evaluated,
          reasoning_note: body.reasoning_note,
        },
        update: {
          care_plan_id: body.care_plan_id,
          assignment_state: body.assignment_state,
          confidence_at_last_eval: body.confidence_at_last_eval,
          turns_evaluated: body.turns_evaluated,
          reasoning_note: body.reasoning_note,
        },
      });

      if (existing && existing.assignment_state !== body.assignment_state) {
        request.log.info(
          {
            event: 'assignment_state_transition',
            user_id: user.id,
            from: existing.assignment_state,
            to: body.assignment_state,
          },
          `Assignment state changed from ${existing.assignment_state} to ${body.assignment_state}`,
        );
      }

      reply.send({
        success: true,
        care_plan_id: result.care_plan_id,
        assignment_state: result.assignment_state,
      });
    },
  });

  // Therapist-portal wireframes C-04/C-06 — the mobile app's new welcome
  // screen (first run, right after OTP verification for a wizard-invited
  // client) reads the therapist's welcome note here, and the client's
  // editable display_abbreviation. Both live on ClinicalConfig.
  app.get('/users/me/welcome', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await prisma.user.findUnique({
        where: { firebase_uid: uid },
        select: { clinical_config: { select: { welcome_note: true, display_abbreviation: true } } },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      reply.send({
        welcomeNote: user.clinical_config?.welcome_note ?? null,
        displayAbbreviation: user.clinical_config?.display_abbreviation ?? null,
      });
    },
  });

  // Client edits the abbreviation "at first run" per the wireframe — the
  // one and only client-facing write to ClinicalConfig; every other field
  // on it is therapist/portal/worker-authored.
  app.patch<{ Body: WelcomeAbbreviationBody }>('/users/me/welcome', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = request.body;

      if (typeof body?.display_abbreviation !== 'string' || body.display_abbreviation.trim().length === 0) {
        return reply.status(400).send({
          error: { code: 'INVALID_BODY', message: 'display_abbreviation must be a non-empty string' },
        });
      }

      const user = await prisma.user.findUnique({
        where: { firebase_uid: uid },
        select: { id: true, clinical_config: { select: { id: true } } },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }
      if (!user.clinical_config) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'No care plan assigned yet' },
        });
      }

      await prisma.clinicalConfig.update({
        where: { user_id: user.id },
        data: { display_abbreviation: body.display_abbreviation.trim() },
      });

      reply.send({ success: true });
    },
  });
}
