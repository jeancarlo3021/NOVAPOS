import { apiFetch } from '@/lib/api';

/**
 * Compartir la ubicación con el equipo, de forma PERSISTENTE.
 *
 * Antes el envío vivía dentro de la pantalla del mapa: apenas el usuario se iba
 * a otra pantalla dejaba de reportar, y en la oficina parecía que se había
 * desconectado. Acá el estado vive en el servicio y sobrevive a la navegación y
 * a recargar la app; solo se apaga cuando la persona lo apaga.
 */
const KEY = 'share_location_on';
const PING_MS = 20_000;

type Listener = (on: boolean) => void;

let watchId: number | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let lastSent = 0;
const listeners = new Set<Listener>();

const notify = (on: boolean) => listeners.forEach(l => { try { l(on); } catch { /* ignore */ } });

function push(pos: GeolocationPosition, forzado = false) {
  const now = Date.now();
  if (!forzado && now - lastSent < PING_MS) return;   // no saturar el servidor
  lastSent = now;
  void apiFetch('/routes/ping-location', {
    method: 'POST',
    body: JSON.stringify({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      speed: pos.coords.speed != null ? pos.coords.speed * 3.6 : null,
      heading: pos.coords.heading ?? null,
      accuracy: pos.coords.accuracy ?? null,
    }),
  }).catch(() => { /* sin conexión: el próximo punto reintenta */ });
}

/**
 * Latido: manda la posición actual aunque la persona no se haya movido.
 *
 * `watchPosition` solo avisa cuando hay movimiento. Sin esto, quien se queda
 * parado en un cliente deja de reportar y a los pocos minutos se cae de la
 * ventana de tiempo del mapa: en la oficina desaparece del mapa como si hubiera
 * apagado el GPS. Es el mismo latido que usa el rastreo de camiones.
 */
function pushActual() {
  if (!shareLocation.isSupported()) return;
  navigator.geolocation.getCurrentPosition(
    pos => push(pos, true),
    () => { /* sin señal en este intento: el próximo latido reintenta */ },
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
  );
}

export const shareLocation = {
  /** ¿Este dispositivo puede compartir ubicación? */
  isSupported: () => typeof navigator !== 'undefined' && !!navigator.geolocation,

  /** ¿Está compartiendo ahora? */
  isOn: () => watchId != null,

  /** Lo que el usuario dejó configurado (sobrevive a recargar). */
  wasOn: () => {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  },

  /** Enciende el envío. Devuelve el error legible si no se pudo. */
  start(): Promise<string | null> {
    return new Promise(resolve => {
      if (!shareLocation.isSupported()) { resolve('Este dispositivo no permite usar la ubicación.'); return; }
      if (watchId != null) { resolve(null); return; }

      let resuelto = false;
      watchId = navigator.geolocation.watchPosition(
        pos => {
          push(pos);
          if (!resuelto) { resuelto = true; resolve(null); }
        },
        err => {
          // El primer error decide si se pudo arrancar; los siguientes solo
          // apagan el envío (se perdió la señal, se revocó el permiso).
          shareLocation.stop();
          const msg = err.code === err.PERMISSION_DENIED
            ? 'Permiso denegado: activá la ubicación para este sitio y volvé a intentar.'
            : 'Se perdió la señal del GPS.';
          if (!resuelto) { resuelto = true; resolve(msg); }
        },
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
      );

      lastSent = 0;      // el primer punto sale ya, sin esperar el intervalo
      if (heartbeat == null) heartbeat = setInterval(pushActual, PING_MS);
      pushActual();      // y no se espera al primer movimiento para aparecer

      try { localStorage.setItem(KEY, '1'); } catch { /* sin storage */ }
      notify(true);
    });
  },

  /** Apaga el envío. */
  stop() {
    if (heartbeat != null) { clearInterval(heartbeat); heartbeat = null; }
    if (watchId != null) {
      try { navigator.geolocation.clearWatch(watchId); } catch { /* ignore */ }
      watchId = null;
    }
    try { localStorage.setItem(KEY, '0'); } catch { /* sin storage */ }
    notify(false);
  },

  /** Al abrir la app: si quedó encendido, se retoma sin preguntar de nuevo. */
  resumeIfWasOn() {
    if (shareLocation.wasOn() && watchId == null) void shareLocation.start();
  },

  /** Avisa cuando se enciende o se apaga (para pintar el indicador). */
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export default shareLocation;
