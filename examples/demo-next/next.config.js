const path = require('path');

const workspacePackageAliases = {
  '@layera-labs/agentic': path.resolve(__dirname, '../../packages/agentic/src/index.ts'),
  '@layera-labs/assets': path.resolve(__dirname, '../../packages/assets/src/index.ts'),
  '@layera-labs/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
  '@layera-labs/effects': path.resolve(__dirname, '../../packages/effects/src/index.ts'),
  '@layera-labs/next': path.resolve(__dirname, '../../packages/next/src/index.ts'),
  '@layera-labs/react': path.resolve(__dirname, '../../packages/react/src/index.ts'),
  '@layera-labs/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
  '@layera-labs/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
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
