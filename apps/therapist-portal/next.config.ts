import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@evia/prisma', '@evia/shared-types'],
};

export default nextConfig;
