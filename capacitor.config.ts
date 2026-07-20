import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cr.colonclick.pos',
  appName: 'ColónClick',
  webDir: 'dist',
  // La app carga la web DESPLEGADA (colonclick.com), así el repartidor siempre ve
  // la última versión sin reinstalar. Los assets locales (dist) quedan de respaldo.
  server: {
    url: 'https://colonclick.com',
    cleartext: false,
  },
  plugins: {
    // El plugin de geolocalización en segundo plano se configura desde el código
    // (BackgroundGeolocation.addWatcher). Ver src/services/distribution/truckTrackingService.ts
  },
};

export default config;
