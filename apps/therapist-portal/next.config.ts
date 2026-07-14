import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@evia/prisma', '@evia/shared-types'],
  env: {
    LOCAL_DEV_BYPASS_AUTH: process.env.LOCAL_DEV_BYPASS_AUTH,
    NEXT_PUBLIC_LOCAL_DEV_BYPASS_AUTH: process.env.LOCAL_DEV_BYPASS_AUTH,
  },
};

export default nextConfig;
