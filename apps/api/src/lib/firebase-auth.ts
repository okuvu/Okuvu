import { applicationDefault, initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function getFirebaseApp() {
  if (getApps().length > 0) return getApps()[0];

  return initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

export async function verifyFirebaseToken(token: string): Promise<{ uid: string }> {
  const auth = getFirebaseAuth();
  const decoded = await auth.verifyIdToken(token);
  return { uid: decoded.uid };
}
