/**
 * Conectividad REAL: `navigator.onLine` solo dice si hay interfaz de red (WiFi),
 * NO si el backend responde. Con WiFi conectado pero sin internet real, el POS
 * creía estar "online" y fallaba al cobrar/imprimir. Acá centralizamos:
 *  - `isNetworkError(err)`: ¿el error de un apiFetch fue por red (backend caído/
 *    timeout) y no una validación real del servidor?
 *  - `backendReachable()`: ping corto a /api/health (con cache breve).
 *  - `getIsOnline()`: navegador online Y (si se chequeó) backend alcanzable.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

// Cache del último ping para no golpear /health en cada operación.
let lastCheck = 0;
let lastReachable = true;
const CHECK_TTL_MS = 8000;

/** ¿El error de un fetch/apiFetch es por RED (no una validación del backend)? */
export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const name = (err as any)?.name ?? '';
  const msg = String((err as any)?.message ?? err).toLowerCase();
  // fetch() lanza TypeError "Failed to fetch"; el timeout aborta con AbortError.
  if (name === 'TypeError' || name === 'AbortError') return true;
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('load failed') ||         // Safari
    msg.includes('the operation was aborted') ||
    msg.includes('aborted') ||
    msg.includes('sin conexión') ||        // apiFetch cache-miss offline
    msg.includes('err_') ||                // ERR_CONNECTION_*, ERR_NETWORK
    msg.includes('timeout')
  );
}

/** Ping corto a /api/health. Devuelve true/false. Cachea el resultado CHECK_TTL_MS. */
export async function backendReachable(force = false): Promise<boolean> {
  if (!navigator.onLine) { lastReachable = false; return false; }
  const now = Date.now();
  if (!force && now - lastCheck < CHECK_TTL_MS) return lastReachable;
  lastCheck = now;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(`${API_URL}/api/health`, { method: 'GET', signal: ctrl.signal, cache: 'no-store' })
      .finally(() => clearTimeout(t));
    lastReachable = res.ok;
  } catch {
    lastReachable = false;
  }
  return lastReachable;
}

/** Estado combinado: navegador online. Para chequeo real usar backendReachable(). */
export function getIsOnline(): boolean {
  return navigator.onLine && lastReachable;
}

/** Marca el backend como caído (lo llama el flujo de cobro al detectar error de red)
 *  para que las próximas decisiones ya sepan que estamos "offline de verdad". */
export function markBackendDown(): void {
  lastReachable = false;
  lastCheck = Date.now();
}

export const connectivity = { isNetworkError, backendReachable, getIsOnline, markBackendDown };
export default connectivity;
