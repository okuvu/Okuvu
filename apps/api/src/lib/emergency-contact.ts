import { prisma } from './prisma.js';
import { encrypt, decrypt, getEncryptionKey } from '../crypto/emergency-contact-encryption.js';

export type LogFn = (obj: Record<string, unknown>, msg: string) => void;

const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;
export const MAX_NAME_LENGTH = 200;

export interface SaveEmergencyContactBody {
  name: string;
  phone: string;
}

export interface ClearEmergencyContactBody {
  clear: true;
}

export type EmergencyContactPatchBody = SaveEmergencyContactBody | ClearEmergencyContactBody;

function isClearBody(body?: EmergencyContactPatchBody): body is ClearEmergencyContactBody {
  return body !== undefined && 'clear' in body && body.clear === true;
}

function isSaveBody(body?: EmergencyContactPatchBody): body is SaveEmergencyContactBody {
  return (
    body !== undefined &&
    !('clear' in body) &&
    typeof (body as SaveEmergencyContactBody).name === 'string' &&
    typeof (body as SaveEmergencyContactBody).phone === 'string'
  );
}

export type GetEmergencyContactResult =
  | { status: 'ok'; name: string | null; phone: string | null }
  | { status: 'user_not_found' }
  | { status: 'decryption_failed' };

export async function getEmergencyContact(
  firebaseUid: string,
  log?: { info: LogFn; error: LogFn },
): Promise<GetEmergencyContactResult> {
  const user = await prisma.user.findUnique({
    where: { firebase_uid: firebaseUid },
    select: { id: true },
  });

  if (!user) {
    return { status: 'user_not_found' };
  }

  const record = await prisma.emergencyContact.findUnique({
    where: { user_id: user.id },
  });

  if (!record) {
    return { status: 'ok', name: null, phone: null };
  }

  try {
    const key = await getEncryptionKey();
    const name = decrypt(record.encrypted_name, key);
    const phone = decrypt(record.encrypted_phone, key);

    if (log) {
      log.info(
        { event: 'emergency_contact_read', user_id: user.id, has_contact: true },
        'Emergency contact read',
      );
    }

    return { status: 'ok', name, phone };
  } catch (err) {
    if (log) {
      log.error(
        { event: 'emergency_contact_decryption_failed', user_id: user.id, err },
        'Failed to decrypt emergency contact',
      );
    }
    return { status: 'decryption_failed' };
  }
}

export type SaveEmergencyContactResult =
  | { status: 'ok' }
  | { status: 'user_not_found' }
  | { status: 'empty_contact' }
  | { status: 'invalid_phone_format' }
  | { status: 'name_too_long' }
  | { status: 'encryption_failed' }
  | { status: 'invalid_body' };

export async function saveOrClearEmergencyContact(
  firebaseUid: string,
  body: EmergencyContactPatchBody | undefined,
  log?: { info: LogFn; error: LogFn },
): Promise<SaveEmergencyContactResult> {
  const user = await prisma.user.findUnique({
    where: { firebase_uid: firebaseUid },
    select: { id: true },
  });

  if (!user) {
    return { status: 'user_not_found' };
  }

  if (isClearBody(body)) {
    await prisma.emergencyContact.deleteMany({
      where: { user_id: user.id },
    });

    if (log) {
      log.info(
        { event: 'emergency_contact_cleared', user_id: user.id },
        'Emergency contact cleared',
      );
    }

    return { status: 'ok' };
  }

  if (isSaveBody(body)) {
    if (body.name.trim().length === 0 && body.phone.trim().length === 0) {
      return { status: 'empty_contact' };
    }

    if (body.phone.trim().length > 0 && !PHONE_REGEX.test(body.phone.trim())) {
      return { status: 'invalid_phone_format' };
    }

    if (body.name.length > MAX_NAME_LENGTH) {
      return { status: 'name_too_long' };
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

      if (log) {
        log.info(
          { event: 'emergency_contact_saved', user_id: user.id },
          'Emergency contact saved',
        );
      }

      return { status: 'ok' };
    } catch (err) {
      if (log) {
        log.error(
          { event: 'emergency_contact_encryption_failed', user_id: user.id, err },
          'Failed to encrypt emergency contact',
        );
      }
      return { status: 'encryption_failed' };
    }
  }

  return { status: 'invalid_body' };
}
