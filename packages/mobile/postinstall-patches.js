const fs = require('fs');
const path = require('path');

// Patch: Remove react-native-worklets/plugin from react-native-css-interop/babel.js
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

// Patch: Wrap @expo/metro-runtime fetch polyfill in try-catch
// The module can be duplicated by pnpm symlinks, causing "property is not writable" on second defineProperty call
try {
  const metroRuntimePaths = [
    require.resolve('@expo/metro-runtime/src/location/install.native.ts'),
    path.resolve(__dirname, '../../node_modules/.pnpm/@expo+metro-runtime@4.0.1_react-native@0.76.9/node_modules/@expo/metro-runtime/src/location/install.native.ts'),
  ];
  for (const filePath of metroRuntimePaths) {
    if (!fs.existsSync(filePath)) continue;
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes("Object.defineProperty(global, 'fetch'") && !content.includes("global.fetch = fetch")) {
      content = content.replace(
        /Object\.defineProperty\(global, 'fetch', \{\s*\n\s*\/\/ value: fetch,\s*\n\s*value: wrapFetchWithWindowLocation\(fetch\),\s*\n\s*\}\);/g,
        "try {\n    Object.defineProperty(global, 'fetch', {\n      // value: fetch,\n      value: wrapFetchWithWindowLocation(fetch),\n    });\n  } catch {\n    global.fetch = wrapFetchWithWindowLocation(fetch);\n  }"
      );
      content = content.replace(
        /Object\.defineProperty\(global, 'fetch', \{\s*\n\s*value: fetch\s*\n\s*\}\);/g,
        "try {\n    Object.defineProperty(global, 'fetch', {\n      value: fetch,\n    });\n  } catch {\n    global.fetch = fetch;\n  }"
      );
      fs.writeFileSync(filePath, content);
      console.log('Patched', filePath, '- wrapped fetch polyfill in try-catch');
    } else if (content.includes("global.fetch = fetch")) {
      console.log('Already patched:', filePath);
    }
  }
} catch (e) {
  console.log('Could not patch @expo/metro-runtime install.native.ts:', e.message);
}
