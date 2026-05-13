const fs = require('fs');
const path = require('path');

// Patch 1: Remove react-native-worklets/plugin from react-native-css-interop/babel.js
try {
  const cssInteropBabelPath = require.resolve('react-native-css-interop/babel.js');
  let content = fs.readFileSync(cssInteropBabelPath, 'utf8');
  if (content.includes('react-native-worklets/plugin')) {
    content = content.replace(/\s*"react-native-worklets\/plugin",?/g, '');
    fs.writeFileSync(cssInteropBabelPath, content);
    console.log('Patched react-native-css-interop/babel.js - removed worklets plugin');
  } else {
    console.log('react-native-css-interop/babel.js already patched or no worklets plugin found');
  }
} catch (e) {
  console.log('Could not patch react-native-css-interop/babel.js:', e.message);
}

// Patch 2: Fix metro-config for cosmiconfig v9 compatibility
try {
  const metroConfigPath = require.resolve('metro-config/src/loadConfig.js');
  let content = fs.readFileSync(metroConfigPath, 'utf8');
  if (content.includes('const cosmiconfig = require("cosmiconfig")')) {
    content = content.replace(
      'const cosmiconfig = require("cosmiconfig")',
      'const { cosmiconfig, defaultLoaders } = require("cosmiconfig")'
    );
    content = content.replace(/cosmiconfig\.loadJson/g, 'defaultLoaders[".json"]');
    content = content.replace(/cosmiconfig\.loadYaml/g, 'defaultLoaders[".yaml"]');
    content = content.replace(/cosmiconfig\.loadJs/g, 'defaultLoaders[".js"]');
    fs.writeFileSync(metroConfigPath, content);
    console.log('Patched metro-config/src/loadConfig.js - fixed cosmiconfig v9 compatibility');
  } else {
    console.log('metro-config/src/loadConfig.js already patched or no fix needed');
  }
} catch (e) {
  console.log('Could not patch metro-config/src/loadConfig.js:', e.message);
}
