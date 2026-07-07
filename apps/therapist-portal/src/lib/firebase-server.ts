import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

let adminAuth: Auth | null = null;

export function getFirebaseAdminAuth(): Auth {
  if (adminAuth) return adminAuth;

  if (getApps().length === 0) {
    const projectId =
      process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId) {
      throw new Error(
        'FIREBASE_ADMIN_PROJECT_ID or NEXT_PUBLIC_FIREBASE_PROJECT_ID must be set',
      );
    }

    if (clientEmail && privateKey) {
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    } else if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      initializeApp({ projectId });
    } else {
      throw new Error(
        'Firebase Admin credentials missing. Set FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY, or run the auth emulator with FIREBASE_AUTH_EMULATOR_HOST.',
      );
    }
  }

  adminAuth = getAuth();

  return adminAuth;
}