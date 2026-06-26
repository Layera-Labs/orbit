const path = require('path');

const workspacePackageAliases = {
  '@orbit/agentic': path.resolve(__dirname, '../../packages/agentic/src/index.ts'),
  '@orbit/assets': path.resolve(__dirname, '../../packages/assets/src/index.ts'),
  '@orbit/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
  '@orbit/effects': path.resolve(__dirname, '../../packages/effects/src/index.ts'),
  '@orbit/next': path.resolve(__dirname, '../../packages/next/src/index.ts'),
  '@orbit/react': path.resolve(__dirname, '../../packages/react/src/index.ts'),
  '@orbit/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
  '@orbit/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...workspacePackageAliases,
    };

    return config;
  },
};

module.exports = nextConfig;
