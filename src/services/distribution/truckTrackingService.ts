import { Capacitor, registerPlugin } from '@capacitor/core';
import { apiFetch } from '@/lib/api';

/**
 * Rastreo del camión en segundo plano (Capacitor + @capacitor-community/background-geolocation).
 *
 * En Android nativo usa un servicio de sistema que sigue reportando la ubicación
 * AUNQUE la app esté cerrada o el teléfono bloqueado, y encola offline. En web
 * (navegador de la oficina o PWA) NO hace nada: isNativePlatform() === false.
 *
 * Uso:
 *   truckTracking.start(routeId)  → al abrir/entrar a una ruta activa.
 *   truckTracking.stop()          → al cerrar la ruta / salir.
 */

// Tipos mínimos del plugin (evita depender de sus typings).
interface BGLocation {
  latitude: number; longitude: number;
  accuracy?: number; altitude?: number | null;
  speed?: number | null; bearing?: number | null;
  time?: number | null;
}
interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;   // metros mínimos entre reportes
    },
    callback: (location?: BGLocation, error?: any) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

let watcherId: string | null = null;
let currentRouteId: string | null = null;
let lastSent = 0;

// No mandamos más de 1 posición cada MIN_INTERVAL_MS (además del filtro de distancia
// del plugin) para no cargar la red ni la BD. El plugin ya encola offline.
const MIN_INTERVAL_MS = 20_000;

const kmh = (mps?: number | null) => (mps != null && mps >= 0 ? Math.round(mps * 3.6) : null);
const deg = (b?: number | null) => (b != null && b >= 0 ? Math.round(b) : null);

async function sendPosition(loc: BGLocation) {
  const now = Date.now();
  if (now - lastSent < MIN_INTERVAL_MS) return;   // throttle temporal
  lastSent = now;
  try {
    await apiFetch('/routes/ping-location', {
      method: 'POST',
      body: JSON.stringify({
        route_id: currentRouteId ?? undefined,
        lat: loc.latitude, lng: loc.longitude,
        speed: kmh(loc.speed), heading: deg(loc.bearing),
        accuracy: loc.accuracy ?? null,
      }),
    });
  } catch { /* offline: el plugin reintenta con la próxima posición */ }
}

export const truckTracking = {
  /** ¿Corre dentro de la app nativa (donde el rastreo en background funciona)? */
  isSupported(): boolean {
    return Capacitor.isNativePlatform();
  },

  /** ¿Está rastreando ahora? */
  isTracking(): boolean {
    return watcherId != null;
  },

  /** Arranca el rastreo para una ruta. No-op en web. */
  async start(routeId: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;   // web: sin rastreo en background
    if (watcherId) {
      currentRouteId = routeId;   // ya activo: solo actualizar la ruta
      return;
    }
    currentRouteId = routeId;
    lastSent = 0;
    try {
      watcherId = await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: 'Ruta en curso — rastreando ubicación',
          backgroundTitle: 'ColónClick Distribución',
          requestPermissions: true,
          stale: false,
          distanceFilter: 50,   // reportar cada 50 m de movimiento
        },
        (location, error) => {
          if (error) { console.warn('[tracking]', error); return; }
          if (location) void sendPosition(location);
        },
      );
    } catch (e) {
      console.warn('[tracking] no se pudo iniciar', e);
      watcherId = null;
    }
  },

  /** Detiene el rastreo (al cerrar la ruta o salir). */
  async stop(): Promise<void> {
    currentRouteId = null;
    if (!watcherId) return;
    try { await BackgroundGeolocation.removeWatcher({ id: watcherId }); }
    catch { /* ignore */ }
    watcherId = null;
  },
};

export default truckTracking;
