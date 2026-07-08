import { FastifyInstance } from 'fastify';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { encrypt, decrypt, getEncryptionKey } from '../crypto/emergency-contact-encryption.js';

const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

interface SaveEmergencyContactBody {
  name: string
  phone: string
}

interface ClearEmergencyContactBody {
  clear: true
}

type PatchBody = SaveEmergencyContactBody | ClearEmergencyContactBody;

function isClearBody(body?: PatchBody): body is ClearEmergencyContactBody {
  return body !== undefined && 'clear' in body && body.clear === true;
}

function isSaveBody(body?: PatchBody): body is SaveEmergencyContactBody {
  return (
    body !== undefined &&
    !('clear' in body) &&
    typeof (body as SaveEmergencyContactBody).name === 'string' &&
    typeof (body as SaveEmergencyContactBody).phone === 'string'
  );
}

export async function settingsRoute(app: FastifyInstance): Promise<void> {
  app.get('/settings/emergency-contact', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await prisma.user.findUnique({
        where: { firebase_uid: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      const record = await prisma.emergencyContact.findUnique({
        where: { user_id: user.id },
      });

      if (!record) {
        return reply.send({ name: null, phone: null });
      }

      try {
        const key = await getEncryptionKey();
        const name = decrypt(record.encrypted_name, key);
        const phone = decrypt(record.encrypted_phone, key);

        request.log.info(
          { event: 'emergency_contact_read', user_id: user.id, has_contact: true },
          'Emergency contact read',
        );

        return reply.send({ name, phone });
      } catch (err) {
        request.log.error(
          { event: 'emergency_contact_decryption_failed', user_id: user.id, err },
          'Failed to decrypt emergency contact',
        );
        return reply.status(500).send({
          error: {
            code: 'DECRYPTION_FAILED',
            message: 'Failed to decrypt emergency contact data',
          },
        });
      }
    },
  });

  app.patch<{ Body: PatchBody }>('/settings/emergency-contact', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = request.body;

      const user = await prisma.user.findUnique({
        where: { firebase_uid: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      if (isClearBody(body)) {
        await prisma.emergencyContact.deleteMany({
          where: { user_id: user.id },
        });

        request.log.info(
          { event: 'emergency_contact_cleared', user_id: user.id },
          'Emergency contact cleared',
        );

        return reply.send({ success: true });
      }

      if (isSaveBody(body)) {
        if (body.name.trim().length === 0 && body.phone.trim().length === 0) {
          return reply.status(400).send({
            error: {
              code: 'EMPTY_CONTACT',
              message:
                'Name and phone cannot both be empty',
            },
          });
        }

        if (body.phone.trim().length > 0 && !PHONE_REGEX.test(body.phone.trim())) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_PHONE_FORMAT',
              message:
                'Phone must be in E.164 format (e.g. +1234567890)',
            },
          });
        }

        try {
          const key = await getEncryptionKey();
          const encrypted_name = encrypt(body.name.trim(), key);
          const encrypted_phone = encrypt(body.phone.trim(), key);

          await prisma.emergencyContact.upsert({
            where: { user_id: user.id },
            create: {
              user_id: user.id,
              encrypted_name,
              encrypted_phone,
            },
            update: {
              encrypted_name,
              encrypted_phone,
            },
          });

          request.log.info(
            { event: 'emergency_contact_saved', user_id: user.id },
            'Emergency contact saved',
          );

          return reply.send({ success: true });
        } catch (err) {
          request.log.error(
            { event: 'emergency_contact_encryption_failed', user_id: user.id, err },
            'Failed to encrypt emergency contact',
          );
          return reply.status(500).send({
            error: {
              code: 'ENCRYPTION_FAILED',
              message: 'Failed to encrypt emergency contact data',
            },
          });
        }
      }

      return reply.status(400).send({
        error: {
          code: 'INVALID_BODY',
          message:
            'Request body must be { name, phone } or { clear: true }',
        },
      });
    },
  });
}
