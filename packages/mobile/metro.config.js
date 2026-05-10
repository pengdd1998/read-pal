const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo: watch all packages
config.watchFolders = [monorepoRoot];

// Resolve @read-pal/shared from monorepo
config.resolver.extraNodeModules = {
  '@read-pal/shared': path.resolve(monorepoRoot, 'packages/shared/src'),
};

// Ensure we resolve node_modules from both project and monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Resolve @/* path alias (tsconfig paths not auto-detected by Metro)
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@/')) {
    const target = path.resolve(projectRoot, 'src', moduleName.slice(2));
    return context.resolveRequest(context, target, platform);
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
