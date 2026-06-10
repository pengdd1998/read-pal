const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PRODUCTION_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">175.178.66.207</domain>
  </domain-config>
</network-security-config>
`;

const DEV_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">175.178.66.207</domain>
    <domain includeSubdomains="true">10.0.2.2</domain>
    <domain includeSubdomains="true">localhost</domain>
  </domain-config>
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

      // Use restrictive config for production only; dev/debug builds always get permissive config
      const isDev = process.env.EXPO_ENV === 'development' ||
                    process.env.EAS_BUILD_PROFILE === 'development' ||
                    process.env.NODE_ENV !== 'production';
      const content = isDev ? DEV_SECURITY_CONFIG : PRODUCTION_SECURITY_CONFIG;

      fs.writeFileSync(
        path.join(resDir, 'network_security_config.xml'),
        content,
      );
      return config;
    },
  ]);

  return config;
}

module.exports = withCleartextTraffic;
