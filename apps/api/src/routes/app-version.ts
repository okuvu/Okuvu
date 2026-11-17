import { FastifyInstance } from 'fastify';

/**
 * The minimum-version gate.
 *
 * Android has no force-update switch, and Play reviews a release on Google's
 * clock, so a clinician can be left on a build for days after a safety fix
 * ships. This route is the server half of the answer: the app asks what build
 * it must be on, and refuses to continue below `minimumSupportedVersionCode`.
 *
 * Public on purpose — no `verifyCognitoJWT`. The app calls this before it has
 * a session (first launch after install) and after a token has expired, and a
 * 401 there would read to the client as "Okuvu is broken" rather than "you are
 * out of date". The payload carries no user data and no clinically sensitive
 * text, so there is nothing here to authenticate.
 *
 * Values are read from the environment per request, not once at module load, so
 * raising the floor is a task-definition change plus a rolling restart — never
 * an app release. Failure to parse falls back to the shipped default, and the
 * default floor is deliberately the *lowest* build that has ever been on Play:
 * a typo in an env var must not lock the whole fleet out of the product.
 */

export interface VersionPolicy {
  minimumSupportedVersionCode: number;
  latestVersionCode: number;
  latestVersionName: string;
  storeUrl: string;
}

/** The launch build (1.0.13 / versionCode 14). Nothing below it ever shipped. */
const DEFAULT_MIN_VERSION_CODE = 14;
/** The build this image was released beside (1.0.21 / versionCode 22). */
const DEFAULT_LATEST_VERSION_CODE = 22;
const DEFAULT_LATEST_VERSION_NAME = '1.0.21';
const DEFAULT_STORE_URL =
  'https://play.google.com/store/apps/details?id=ai.okuvu.app';

function readInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function readString(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  return raw && raw.length > 0 ? raw : fallback;
}

export function resolveVersionPolicy(): VersionPolicy {
  const latest = readInt('OKUVU_LATEST_VERSION_CODE', DEFAULT_LATEST_VERSION_CODE);
  const configuredMin = readInt(
    'OKUVU_MIN_VERSION_CODE',
    DEFAULT_MIN_VERSION_CODE,
  );

  // A floor above the newest build would block every user on the newest build,
  // including the one that just shipped — clamp rather than trust the config.
  const minimum = Math.min(configuredMin, latest);

  return {
    minimumSupportedVersionCode: minimum,
    latestVersionCode: latest,
    latestVersionName: readString(
      'OKUVU_LATEST_VERSION_NAME',
      DEFAULT_LATEST_VERSION_NAME,
    ),
    storeUrl: readString('OKUVU_STORE_URL', DEFAULT_STORE_URL),
  };
}

export async function appVersionRoute(app: FastifyInstance): Promise<void> {
  app.get('/app/version', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            minimumSupportedVersionCode: { type: 'integer' },
            latestVersionCode: { type: 'integer' },
            latestVersionName: { type: 'string' },
            storeUrl: { type: 'string' },
          },
        },
      },
    },
    handler: async (_request, reply) => {
      reply.header('cache-control', 'public, max-age=300');
      reply.send(resolveVersionPolicy());
    },
  });
}
