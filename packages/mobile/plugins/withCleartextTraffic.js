const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <!-- ICP cleared (2026-09-21): read.chishenma.top serves a real Let's
       Encrypt cert — system trust-anchors accept it with zero extra
       config. The IP entry remains as the documented fallback (its cert
       is self-signed and NOT trusted by the system store; the app no
       longer defaults to it). -->
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

function withCleartextTraffic(config) {
  // 1. Patch AndroidManifest.xml
  config = withAndroidManifest(config, (config) => {
    const mainApplication =
      AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);

    mainApplication.$['android:usesCleartextTraffic'] = 'true';
    mainApplication.$['android:networkSecurityConfig'] =
      '@xml/network_security_config';

    return config;
  });

  // 2. Write network_security_config.xml into res/xml/
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const resDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      fs.mkdirSync(resDir, { recursive: true });
      fs.writeFileSync(
        path.join(resDir, 'network_security_config.xml'),
        NETWORK_SECURITY_CONFIG,
      );
      return config;
    },
  ]);

  return config;
}

module.exports = withCleartextTraffic;
