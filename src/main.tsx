import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.js';
import { setupPWA } from './pwa';
import { RootErrorBoundary } from './components/RootErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
);

// Dentro del APK el WebView dibuja DEBAJO de la barra de estado (el index.html
// usa viewport-fit=cover), así que lo que queda pegado arriba —encabezados,
// botones de cerrar de los modales— cae bajo el reloj y la hora y no se puede
// tocar. Marcamos el documento para que el CSS baje todo esa distancia, y SOLO
// acá: en la web y en el navegador del teléfono no hace falta.
try {
  if ((window as any).Capacitor?.isNativePlatform?.()) {
    document.documentElement.classList.add('is-native');
  }
} catch { /* ignore */ }

// React ya montó: se apaga el salvavidas de arranque de index.html, que si no
// mostraría la pantalla de recuperación encima de la app.
try { (window as any).__ccBooted?.(); } catch { /* ignore */ }

// Sentry FUERA de la ruta crítica: son ~240 kB que no hacen falta para pintar la
// primera pantalla, y en un celular lento eso se nota en el arranque. Se carga
// cuando el navegador queda desocupado; hasta entonces, RootErrorBoundary
// muestra el fallo igual (y se lo reenvía cuando Sentry ya esté listo).
const bootSentry = () => {
  import('./lib/sentry')
    .then(({ initSentry, Sentry }) => {
      initSentry();
      (window as any).__sentryCapture = (err: unknown, info?: unknown) =>
        Sentry.captureException(err, { extra: { info } } as any);
    })
    .catch(e => console.warn('[sentry] no se pudo iniciar:', e));
};
if ('requestIdleCallback' in window) {
  (window as any).requestIdleCallback(bootSentry, { timeout: 5000 });
} else {
  setTimeout(bootSentry, 2500);
}

// Registra el service worker para soporte PWA (offline + instalable).
// Si el registro falla (contexto sin SW, permisos), la app debe seguir andando.
try { setupPWA(); } catch (e) { console.warn('[pwa] no se pudo registrar el SW:', e); }
// Build timestamp: 1779418611
