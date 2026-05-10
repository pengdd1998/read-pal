const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo: watch all packages
config.watchFolders = [monorepoRoot];

// Resolve @read-pal/shared and @/* alias from monorepo
config.resolver.extraNodeModules = {
  '@': path.resolve(projectRoot, 'src'),
  '@read-pal/shared': path.resolve(monorepoRoot, 'packages/shared/src'),
};

// Ensure we resolve node_modules from both project and monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
