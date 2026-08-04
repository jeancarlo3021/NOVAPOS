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
  /** Abre los ajustes de la app: es la ÚNICA vía para conceder "Permitir todo el
   *  tiempo" en Android 11+, porque el sistema ya no lo ofrece en un diálogo. */
  openSettings(): Promise<void>;
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

/** Estado del permiso de ubicación en segundo plano. 'denied' = el usuario dio
 *  solo "Mientras se usa la app": el rastreo se corta al minimizar. */
export type BgPermission = 'unknown' | 'granted' | 'denied';
let bgPermission: BgPermission = 'unknown';
const permissionListeners = new Set<(p: BgPermission) => void>();
function setBgPermission(p: BgPermission) {
  if (bgPermission === p) return;
  bgPermission = p;
  permissionListeners.forEach(fn => { try { fn(p); } catch { /* ignore */ } });
}

let watcherId: string | null = null;
let webWatchId: number | null = null;   // geolocalización del navegador (web, primer plano)
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;  // latido periódico
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

// Manda la posición ACTUAL una vez (para el punto inicial y el latido).
function pushCurrentPosition() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => void sendPosition({
      latitude: pos.coords.latitude, longitude: pos.coords.longitude,
      speed: pos.coords.speed, bearing: pos.coords.heading, accuracy: pos.coords.accuracy,
    }),
    () => { /* sin permiso / sin señal: ignorar */ },
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
  );
}

// Geolocalización web (primer plano): watch por movimiento + latido periódico
// para que el punto aparezca al instante y no caiga fuera de la ventana de /live
// aunque el camión esté quieto.
function startWebWatch() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return;
  if (webWatchId == null) {
    webWatchId = navigator.geolocation.watchPosition(
      (pos) => void sendPosition({
        latitude: pos.coords.latitude, longitude: pos.coords.longitude,
        speed: pos.coords.speed, bearing: pos.coords.heading, accuracy: pos.coords.accuracy,
      }),
      (err) => console.warn('[tracking web]', err?.message ?? err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }
  pushCurrentPosition();   // punto inicial inmediato
  if (heartbeatTimer == null) heartbeatTimer = setInterval(pushCurrentPosition, MIN_INTERVAL_MS);
}

function stopWebWatch() {
  if (webWatchId != null) { try { navigator.geolocation.clearWatch(webWatchId); } catch { /* ignore */ } webWatchId = null; }
  if (heartbeatTimer != null) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

export const truckTracking = {
  /** ¿Se puede rastrear? Nativo (background) o web con geolocalización (primer plano). */
  isSupported(): boolean {
    return Capacitor.isNativePlatform() || (typeof navigator !== 'undefined' && !!navigator.geolocation);
  },

  /** ¿Está rastreando ahora? */
  isTracking(): boolean {
    return watcherId != null || webWatchId != null;
  },

  /** Arranca el rastreo para una ruta.
   *  - Geolocalización WEB SIEMPRE: da el punto inicial al instante y updates
   *    frecuentes mientras la app está abierta (nativa o web) → la oficina ve
   *    aparecer y moverse el camión aunque esté (casi) quieto.
   *  - En nativo, ADEMÁS el watcher en segundo plano (sigue con app cerrada). */
  async start(routeId: string): Promise<void> {
    currentRouteId = routeId;
    lastSent = 0;

    // Web (primer plano) — arranca ya, en cualquier plataforma.
    startWebWatch();

    // Nativo — watcher en segundo plano (además del web).
    if (Capacitor.isNativePlatform() && watcherId == null) {
      try {
        watcherId = await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage: 'Ruta en curso — rastreando ubicación',
            backgroundTitle: 'ColónClick Distribución',
            requestPermissions: true,
            stale: false,
            distanceFilter: 20,   // reportar cada 20 m de movimiento
          },
          (location, error) => {
            if (error) {
              console.warn('[tracking]', error);
              // NOT_AUTHORIZED = falta "Permitir todo el tiempo". Android 10+ NO lo
              // pide en el diálogo inicial: hay que mandarlo a los ajustes. Sin esto
              // el rastreo funcionaba solo con la app abierta y nadie sabía por qué.
              if (String(error?.code ?? '') === 'NOT_AUTHORIZED') setBgPermission('denied');
              return;
            }
            if (location) { setBgPermission('granted'); void sendPosition(location); }
          },
        );
      } catch (e) {
        console.warn('[tracking] watcher nativo no disponible (sigue el web)', e);
        watcherId = null;
      }
    }
  },

  /** Estado del permiso de ubicación en segundo plano. */
  getBgPermission(): BgPermission { return bgPermission; },

  /** Avisa cuando cambia (para mostrar/ocultar el aviso en la UI). */
  onBgPermissionChange(fn: (p: BgPermission) => void): () => void {
    permissionListeners.add(fn);
    return () => permissionListeners.delete(fn);
  },

  /** Abre los ajustes de la app para poner la ubicación en "Permitir todo el
   *  tiempo". Es el único camino en Android 11+: el sistema ya no lo ofrece en un
   *  diálogo, hay que entrar a Ajustes → Permisos → Ubicación. */
  async openLocationSettings(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try { await BackgroundGeolocation.openSettings(); }
    catch (e) { console.warn('[tracking] no se pudieron abrir los ajustes', e); }
  },

  /** Detiene el rastreo (al cerrar la ruta o salir). */
  async stop(): Promise<void> {
    currentRouteId = null;
    if (watcherId) {
      try { await BackgroundGeolocation.removeWatcher({ id: watcherId }); } catch { /* ignore */ }
      watcherId = null;
    }
    stopWebWatch();
  },
};

export default truckTracking;
