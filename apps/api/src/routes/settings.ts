import { FastifyInstance } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import {
  getEmergencyContact,
  saveOrClearEmergencyContact,
  MAX_NAME_LENGTH,
  type EmergencyContactPatchBody,
} from '../lib/emergency-contact.js';

const MAX_FULL_NAME_LENGTH = 200;
const MAX_GENDER_LENGTH = 100;

type PatchBody = EmergencyContactPatchBody;

export async function settingsRoute(app: FastifyInstance): Promise<void> {
  app.get('/settings/emergency-contact', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const result = await getEmergencyContact(uid, request.log);

      switch (result.status) {
        case 'user_not_found':
          return reply.status(401).send({
            error: { code: 'UNAUTHORIZED', message: 'User not found' },
          });
        case 'decryption_failed':
          return reply.status(500).send({
            error: {
              code: 'DECRYPTION_FAILED',
              message: 'Failed to decrypt emergency contact data',
            },
          });
        case 'ok':
          return reply.send({ name: result.name, phone: result.phone });
      }
    },
  });

  app.patch<{ Body: PatchBody }>('/settings/emergency-contact', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const result = await saveOrClearEmergencyContact(uid, request.body, request.log);

      switch (result.status) {
        case 'user_not_found':
          return reply.status(401).send({
            error: { code: 'UNAUTHORIZED', message: 'User not found' },
          });
        case 'empty_contact':
          return reply.status(400).send({
            error: {
              code: 'EMPTY_CONTACT',
              message: 'Name and phone cannot both be empty',
            },
          });
        case 'invalid_phone_format':
          return reply.status(400).send({
            error: {
              code: 'INVALID_PHONE_FORMAT',
              message: 'Phone must be in E.164 format (e.g. +1234567890)',
            },
          });
        case 'name_too_long':
          return reply.status(400).send({
            error: {
              code: 'NAME_TOO_LONG',
              message: `name must be at most ${MAX_NAME_LENGTH} characters`,
            },
          });
        case 'encryption_failed':
          return reply.status(500).send({
            error: {
              code: 'ENCRYPTION_FAILED',
              message: 'Failed to encrypt emergency contact data',
            },
          });
        case 'invalid_body':
          return reply.status(400).send({
            error: {
              code: 'INVALID_BODY',
              message: 'Request body must be { name, phone } or { clear: true }',
            },
          });
        case 'ok':
          return reply.send({ success: true });
      }
    },
  });

  interface VoiceModeBody {
    voice_enabled: boolean
  }

  app.get('/settings/voice', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      const profile = await prisma.engagementProfile.findUnique({
        where: { user_id: user.id },
        select: { voice_mode_enabled: true },
      });

      request.log.info(
        { event: 'voice_settings_read', user_id: user.id },
        'Voice settings read',
      );

      return reply.send({ voice_enabled: profile?.voice_mode_enabled ?? false });
    },
  });

  app.patch<{ Body: VoiceModeBody }>('/settings/voice', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = request.body;

      if (typeof body.voice_enabled !== 'boolean') {
        return reply.status(400).send({
          error: {
            code: 'INVALID_BODY',
            message: 'voice_enabled must be a boolean',
          },
        });
      }

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
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
          voice_mode_enabled: body.voice_enabled,
        },
        update: {
          voice_mode_enabled: body.voice_enabled,
        },
      });

      request.log.info(
        { event: 'voice_settings_updated', user_id: user.id, voice_enabled: body.voice_enabled },
        'Voice settings updated',
      );

      return reply.send({ success: true });
    },
  });

  // OKUVU v2.0: English | Mirror (adaptive Hinglish) — drives A2's/A9-post's
  // ${language_mode}. Defaults to 'english' (User.language_mode's own DB
  // default) until the user opts in; see docs/okuvu-v2.0/00-doc-map-and-
  // parity-resolutions.md B.1.
  type LanguageMode = 'english' | 'mirror';
  const VALID_LANGUAGE_MODES: ReadonlySet<string> = new Set(['english', 'mirror']);

  interface LanguageModeBody {
    language_mode: LanguageMode
  }

  app.get('/settings/language', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { language_mode: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      request.log.info(
        { event: 'language_settings_read', language_mode: user.language_mode },
        'Language settings read',
      );

      return reply.send({ language_mode: user.language_mode });
    },
  });

  app.patch<{ Body: LanguageModeBody }>('/settings/language', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = request.body;

      if (typeof body.language_mode !== 'string' || !VALID_LANGUAGE_MODES.has(body.language_mode)) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_BODY',
            message: "language_mode must be 'english' or 'mirror'",
          },
        });
      }

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { language_mode: body.language_mode },
      });

      request.log.info(
        { event: 'language_settings_updated', user_id: user.id, language_mode: body.language_mode },
        'Language settings updated',
      );

      return reply.send({ success: true });
    },
  });

  // okuvu-remaining-changes.md O6: quote-of-day, opt-in. Content is a
  // placeholder list (apps/api/src/lib/quote-of-day.ts) — the mechanism is
  // real, the source isn't decided yet.
  interface QuoteOfDayBody {
    enabled: boolean
  }

  app.get('/settings/quote-of-day', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { quote_of_day_enabled: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      return reply.send({ enabled: user.quote_of_day_enabled });
    },
  });

  app.patch<{ Body: QuoteOfDayBody }>('/settings/quote-of-day', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = request.body;

      if (typeof body.enabled !== 'boolean') {
        return reply.status(400).send({
          error: { code: 'INVALID_BODY', message: 'enabled must be a boolean' },
        });
      }

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { quote_of_day_enabled: body.enabled },
      });

      request.log.info(
        { event: 'quote_of_day_settings_updated', user_id: user.id, enabled: body.enabled },
        'Quote-of-day settings updated',
      );

      return reply.send({ success: true });
    },
  });

  // Settings > Profile — full_name/date_of_birth/gender only; email is
  // display-only (tied to the invite/auth flow, not client-editable here).
  interface ProfileBody {
    full_name?: string | null
    date_of_birth?: string | null
    gender?: string | null
  }

  app.get('/settings/profile', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { full_name: true, email: true, date_of_birth: true, gender: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      return reply.send({
        full_name: user.full_name,
        email: user.email,
        date_of_birth: user.date_of_birth ? user.date_of_birth.toISOString() : null,
        gender: user.gender,
      });
    },
  });

  app.patch<{ Body: ProfileBody }>('/settings/profile', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = request.body ?? {};

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      if (body.full_name !== undefined && body.full_name !== null) {
        if (typeof body.full_name !== 'string') {
          return reply.status(400).send({
            error: { code: 'INVALID_FULL_NAME', message: 'full_name must be a string' },
          });
        }
        if (body.full_name.length > MAX_FULL_NAME_LENGTH) {
          return reply.status(400).send({
            error: { code: 'FULL_NAME_TOO_LONG', message: `full_name must be at most ${MAX_FULL_NAME_LENGTH} characters` },
          });
        }
      }

      if (body.gender !== undefined && body.gender !== null) {
        if (typeof body.gender !== 'string') {
          return reply.status(400).send({
            error: { code: 'INVALID_GENDER', message: 'gender must be a string' },
          });
        }
        if (body.gender.length > MAX_GENDER_LENGTH) {
          return reply.status(400).send({
            error: { code: 'GENDER_TOO_LONG', message: `gender must be at most ${MAX_GENDER_LENGTH} characters` },
          });
        }
      }

      let parsedDob: Date | null | undefined;
      if (body.date_of_birth !== undefined) {
        if (body.date_of_birth === null) {
          parsedDob = null;
        } else {
          const parsed = new Date(body.date_of_birth);
          if (Number.isNaN(parsed.getTime())) {
            return reply.status(400).send({
              error: { code: 'INVALID_DATE', message: 'date_of_birth must be a valid date' },
            });
          }
          parsedDob = parsed;
        }
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(body.full_name !== undefined ? { full_name: body.full_name } : {}),
          ...(parsedDob !== undefined ? { date_of_birth: parsedDob } : {}),
          ...(body.gender !== undefined ? { gender: body.gender } : {}),
        },
      });

      request.log.info(
        { event: 'profile_settings_updated', user_id: user.id },
        'Profile settings updated',
      );

      return reply.send({ success: true });
    },
  });

  // Settings > Notifications — inert preference toggles, no push/FCM
  // delivery exists yet (see okuvu-remaining-changes.md).
  interface NotificationPreferencesBody {
    appointment_reminders_enabled?: boolean
    chat_nudges_enabled?: boolean
  }

  app.get('/settings/notifications', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { appointment_reminders_enabled: true, chat_nudges_enabled: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      return reply.send({
        appointment_reminders_enabled: user.appointment_reminders_enabled,
        chat_nudges_enabled: user.chat_nudges_enabled,
      });
    },
  });

  app.patch<{ Body: NotificationPreferencesBody }>('/settings/notifications', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = request.body ?? {};

      if (
        body.appointment_reminders_enabled === undefined &&
        body.chat_nudges_enabled === undefined
      ) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_BODY',
            message: 'At least one of appointment_reminders_enabled/chat_nudges_enabled is required',
          },
        });
      }

      if (
        (body.appointment_reminders_enabled !== undefined && typeof body.appointment_reminders_enabled !== 'boolean') ||
        (body.chat_nudges_enabled !== undefined && typeof body.chat_nudges_enabled !== 'boolean')
      ) {
        return reply.status(400).send({
          error: { code: 'INVALID_BODY', message: 'Preference values must be booleans' },
        });
      }

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(body.appointment_reminders_enabled !== undefined
            ? { appointment_reminders_enabled: body.appointment_reminders_enabled }
            : {}),
          ...(body.chat_nudges_enabled !== undefined
            ? { chat_nudges_enabled: body.chat_nudges_enabled }
            : {}),
        },
      });

      request.log.info(
        { event: 'notification_settings_updated', user_id: user.id },
        'Notification settings updated',
      );

      return reply.send({ success: true });
    },
  });
}
