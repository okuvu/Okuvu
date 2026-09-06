import type { NextConfig } from 'next';

// F-01 (docs/audit/evia-therapist-portal-audit.md): LOCAL_DEV_BYPASS_AUTH is
// read server-side via plain `process.env.LOCAL_DEV_BYPASS_AUTH` wherever
// it's needed (proxy.ts, server/trpc.ts) — Next.js does not require it to be
// listed in `env` for that. It used to be listed here anyway, which baked
// its value (and a NEXT_PUBLIC_ mirror of it, unused anywhere in the app)
// into the client-side JS bundle for every deploy. Do not re-add it.
const nextConfig: NextConfig = {
  transpilePackages: ['@evia/prisma', '@evia/shared-types'],
};

export default nextConfig;
