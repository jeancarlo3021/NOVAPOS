import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.js';
import { setupPWA } from './pwa';
import { initSentry, Sentry } from './lib/sentry';

// Inicializar Sentry antes que React monte. Si no hay DSN configurado,
// se salta silenciosamente y la app corre sin tracking.
initSentry();

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

// Registra el service worker para soporte PWA (offline + instalable).
setupPWA();
// Build timestamp: 1779418611
