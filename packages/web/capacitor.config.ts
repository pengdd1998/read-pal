import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.readpal.app',
  appName: 'read-pal',
  webDir: 'www',
  server: {
    // Load from live server — avoids static export limitations with dynamic routes.
    // Comment out 'url' for local development with bundled assets.
    url: process.env.CAPACITOR_SERVER_URL || undefined,
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#fefdfb',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#fefdfb',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
