import * as Sentry from '@sentry/react';

/**
 * Inicializa Sentry para captura de errores y performance monitoring.
 *
 * Activación: requiere `VITE_SENTRY_DSN` en .env.local (o en Vercel).
 * Si no hay DSN, no hace nada — la app funciona normal en local sin tracking.
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    console.info('[Sentry] DSN no configurado — tracking deshabilitado.');
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE, // 'development' | 'production'
    release: import.meta.env.VITE_APP_VERSION || undefined,

    // Sampleo: 10% de transacciones en producción, 100% en dev.
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

    // Session Replay: 10% sesiones normales, 100% cuando hay error.
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Privacidad: enmascarar inputs y texto sensible.
        maskAllText: false,
        maskAllInputs: true,
        blockAllMedia: false,
      }),
    ],

    // Ignorar errores ruidosos / esperados.
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      'ChunkLoadError',  // recarga de bundle post-deploy
      'NetworkError when attempting to fetch resource',
      'Failed to fetch',
      // Modo solo-lectura por morosidad (lo lanzamos a propósito)
      'Cuenta en modo solo lectura',
    ],

    // Solo enviar errores que vengan de nuestro código, no de extensiones de navegador.
    beforeSend(event, hint) {
      const error = hint.originalException;
      const msg = error instanceof Error ? error.message : String(error || '');
      if (msg.includes('extension://') || msg.includes('chrome-extension://')) {
        return null;
      }
      return event;
    },
  });
}

/**
 * Asocia los errores futuros a un usuario específico (después del login).
 * Llamar desde AuthContext cuando se confirma la sesión.
 */
export function identifySentryUser(user: {
  id: string;
  email?: string;
  full_name?: string;
  tenant_id?: string;
}) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.full_name,
  });
  if (user.tenant_id) {
    Sentry.setTag('tenant_id', user.tenant_id);
  }
}

/** Limpia la identidad al cerrar sesión. */
export function clearSentryUser() {
  Sentry.setUser(null);
}

export { Sentry };
