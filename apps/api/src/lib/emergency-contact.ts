import { prisma } from './prisma.js';
import { encrypt, decrypt, getEncryptionKey } from '../crypto/emergency-contact-encryption.js';

export type LogFn = (obj: Record<string, unknown>, msg: string) => void;

// Ten digits, no country code (beta scope, round 2 — the owner asked for
// "simply 10 digit number for now" after every E.164 save failed). Spaces,
// dashes, dots and brackets are stripped first, so "98765 43210" saves as
// "9876543210"; the stripped value is the one encrypted and stored.
const PHONE_REGEX = /^\d{10}$/;
export const PHONE_HINT = 'Enter a 10-digit phone number (e.g. 9876543210)';
export const MAX_NAME_LENGTH = 200;

/** Strip formatting only — never invent digits, never add a country code. */
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, '');
}


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
  authSubject: string,
  log?: { info: LogFn; error: LogFn },
): Promise<GetEmergencyContactResult> {
  const user = await prisma.user.findUnique({
    where: { auth_subject: authSubject },
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
  authSubject: string,
  body: EmergencyContactPatchBody | undefined,
  log?: { info: LogFn; error: LogFn },
): Promise<SaveEmergencyContactResult> {
  const user = await prisma.user.findUnique({
    where: { auth_subject: authSubject },
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

    const phone = normalizePhone(body.phone.trim());

    if (phone.length > 0 && !PHONE_REGEX.test(phone)) {
      return { status: 'invalid_phone_format' };
    }

    if (body.name.length > MAX_NAME_LENGTH) {
      return { status: 'name_too_long' };
    }

    try {
      const key = await getEncryptionKey();
      const encrypted_name = encrypt(body.name.trim(), key);
      const encrypted_phone = encrypt(phone, key);

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
