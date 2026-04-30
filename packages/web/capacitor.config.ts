import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.readpal.app',
  appName: 'read-pal',
  webDir: 'out',
  server: {
    // Override with CAPACITOR_SERVER_URL for dev testing with live server.
    // Default: undefined = load from bundled static assets.
    url: process.env.CAPACITOR_SERVER_URL || undefined,
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
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
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
