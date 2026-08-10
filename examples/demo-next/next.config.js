const path = require('path');

const workspacePackageAliases = {
  '@layera-labs/orbit-agentic': path.resolve(__dirname, '../../packages/agentic/src/index.ts'),
  '@layera-labs/orbit-assets': path.resolve(__dirname, '../../packages/assets/src/index.ts'),
  '@layera-labs/orbit-core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
  '@layera-labs/orbit-effects': path.resolve(__dirname, '../../packages/effects/src/index.ts'),
  '@layera-labs/orbit-next': path.resolve(__dirname, '../../packages/next/src/index.ts'),
  '@layera-labs/orbit-react': path.resolve(__dirname, '../../packages/react/src/index.ts'),
  '@layera-labs/orbit-shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
  '@layera-labs/orbit-ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
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
