import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  transpilePackages: ['@okuvu/prisma', '@okuvu/shared-types', '@okuvu/api'],
  // apps/api/src/prompts/index.ts and apps/test-harness/src/lib/prompt-hash.ts
  // both `readFileSync` prompt .txt files using a runtime-constructed path.
  // This app's Vercel "Root Directory" is apps/test-harness (needed so
  // Vercel finds this app's package.json/vercel.json in the monorepo), and
  // — despite the *build* having the whole repo on disk, and despite
  // outputFileTracingIncludes/outputFileTracingRoot both resolving these
  // files correctly in a local `next build` — the deployed function still
  // ENOENTs on them live. Confirmed via runtime logs across 4 separate
  // fixes/redeploys. Left both settings in place below since they're
  // correct per Next's docs and still help prompt-hash.ts's runtime reads
  // (the /config Model Registry page), but they don't fully solve the
  // crash-on-every-procedure problem, so see the webpack alias below for
  // the actual fix to the orchestrator import path.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  outputFileTracingIncludes: {
    '/api/trpc/[trpc]': ['../api/src/prompts/**/*', '../worker/src/prompts/**/*'],
  },
  // apps/api's source uses ESM `.js`-suffixed relative imports (its
  // production build compiles via `tsc` to a `dist/` tree where the
  // sibling `.js` files really exist) — but apps/test-harness's routers
  // direct-import several apps/api modules (TH-S09/S10/S18/S27), so this
  // bundler needs to resolve those `.js` specifiers to the real `.ts`
  // source files instead. Turbopack does not support this (no
  // `extensionAlias` equivalent — see https://github.com/vercel/next.js/issues/82945,
  // open as of Next 16.2), so this app runs dev/build under classic
  // webpack (`next dev --webpack` / `next build --webpack`) until that
  // lands, with the standard webpack fix below.
  webpack: (config, { isServer, webpack }) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    // The actual fix for the ENOENT above: apps/api/src/agents/a2/prompts.ts
    // imports A2_PROMPT/A2_ONBOARDING_PROMPT from
    // apps/api/src/prompts/index.ts, which reads them from disk at module
    // load — meaning EVERY procedure that transitively imports the
    // orchestrator crashes on Vercel, not just ones that use A2 directly.
    // Redirect that one specific import to a generated shim
    // (scripts/generate-prompt-shim.mjs, run before every dev/build) that
    // inlines the same content as plain string literals — no runtime file
    // access at all, so Vercel's packaging boundary can't drop it. Scoped
    // tightly (exact request string + importing directory) so nothing else
    // is affected, and apps/api's own separate Docker/tsc build for GCP is
    // completely untouched by this test-harness-only webpack config.
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^\.\.\/\.\.\/prompts\/index\.js$/,
        (resource: { context: string; request: string }) => {
          if (resource.context.replace(/\\/g, '/').endsWith('/agents/a2')) {
            resource.request = path.resolve(__dirname, '.generated/prompt-shim.ts');
          }
        },
      ),
    );
    // GCP client libraries (@google-cloud/tasks, @google-cloud/aiplatform's
    // google-gax dependency) dynamically `require()` JSON proto/client
    // config files at runtime in a way webpack can't statically bundle
    // (surfaces as "Cannot find module '...cloud_tasks_client_config.json'"
    // — a well-known incompatibility between these libraries and static
    // bundlers). They only need to work server-side (API routes run in a
    // real Node.js process), so mark them external there instead of
    // bundling them — Node's own require() resolves them correctly.
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push('@google-cloud/tasks', '@google-cloud/aiplatform', 'google-gax', 'next-auth', 'next-auth/next');
    }
    return config;
  },
};

export default nextConfig;
