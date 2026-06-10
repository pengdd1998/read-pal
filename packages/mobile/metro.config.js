const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  path.resolve(monorepoRoot, 'packages/shared'),
];

config.resolver.extraNodeModules = {
  '@read-pal/shared': path.resolve(monorepoRoot, 'packages/shared/src'),
};

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Normalize pnpm store paths to symlink paths to prevent duplicate module instances.
// In pnpm monorepos, Metro may resolve the same package through both:
//   node_modules/pkg (symlink) and
//   node_modules/.pnpm/pkg@ver/node_modules/pkg (real path in store)
// This creates duplicate module instances in the bundle, causing defineProperty errors
// on Hermes (non-configurable globals) and undefined exports.
const pnpmStorePrefix = path.normalize('node_modules/.pnpm/');
const monorepoNodeModules = path.resolve(monorepoRoot, 'node_modules');

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === './index') {
    return context.resolveRequest(context, 'expo-router/entry', platform);
  }
  if (moduleName.startsWith('@/')) {
    const target = path.resolve(projectRoot, 'src', moduleName.slice(2));
    return context.resolveRequest(context, target, platform);
  }

  const result = context.resolveRequest(context, moduleName, platform);

  if (result && result.type === 'sourceFile' && result.filePath) {
    const normalizedPath = path.normalize(result.filePath);
    const pnpmIdx = normalizedPath.indexOf(pnpmStorePrefix);
    if (pnpmIdx !== -1) {
      // Extract the package path after the pnpm store hash segment
      // e.g., "node_modules/.pnpm/expo@52.0.49_.../node_modules/expo/src/..."
      //        -> extract "expo/src/..."
      const afterStore = normalizedPath.substring(pnpmIdx + pnpmStorePrefix.length);
      // afterStore is like "expo@52.0.49_.../node_modules/expo/src/..."
      const secondNodeModulesIdx = afterStore.indexOf(path.normalize('node_modules/'));
      if (secondNodeModulesIdx !== -1) {
        const packagePath = afterStore.substring(secondNodeModulesIdx + path.normalize('node_modules/').length);
        const symlinkPath = path.resolve(monorepoNodeModules, packagePath);
        if (fs.existsSync(symlinkPath)) {
          return { type: 'sourceFile', filePath: symlinkPath };
        }
      }
    }
  }

  return result;
};

module.exports = config;
