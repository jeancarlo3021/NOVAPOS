import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.js';
import { setupPWA } from './pwa';
import { initSentry, Sentry } from './lib/sentry';

// Inicializar Sentry antes que React monte. Si no hay DSN configurado,
// se salta silenciosamente y la app corre sin tracking.
//
// Va en try/catch porque esto corre ANTES de que exista el ErrorBoundary: si
// Sentry reventara (bloqueado por el navegador, sin storage, etc.), la app
// entera se quedaría en blanco por culpa del tracking.
try { initSentry(); } catch (e) { console.warn('[sentry] no se pudo iniciar:', e); }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center mb-4">
              <span className="text-3xl">⚠️</span>
            </div>
            <h1 className="text-xl font-black text-gray-900 mb-2">Algo salió mal</h1>
            <p className="text-sm text-gray-600 mb-4">
              Se reportó automáticamente el error al equipo. Probá recargar la página.
            </p>
            <p className="text-xs text-gray-400 font-mono mb-4 bg-gray-50 p-2 rounded break-all">
              {error instanceof Error ? error.message : String(error)}
            </p>
            <button
              onClick={() => { resetError(); window.location.reload(); }}
              className="w-full px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition"
            >
              Recargar
            </button>
          </div>
        </div>
      )}
    >
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
);

// React ya montó: se apaga el salvavidas de arranque de index.html, que si no
// mostraría la pantalla de recuperación encima de la app.
try { (window as any).__ccBooted?.(); } catch { /* ignore */ }

// Registra el service worker para soporte PWA (offline + instalable).
// Si el registro falla (contexto sin SW, permisos), la app debe seguir andando.
try { setupPWA(); } catch (e) { console.warn('[pwa] no se pudo registrar el SW:', e); }
// Build timestamp: 1779418611
