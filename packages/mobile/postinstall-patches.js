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
