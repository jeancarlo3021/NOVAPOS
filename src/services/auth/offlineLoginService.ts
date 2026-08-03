/**
 * Login SIN internet.
 *
 * En cada login online exitoso guardamos, por dispositivo:
 *  - un VERIFICADOR de la contraseña (PBKDF2-SHA256 con salt aleatorio, 150k
 *    iteraciones, vía WebCrypto) — nunca la contraseña en claro; y
 *  - un SNAPSHOT del estado de auth (usuario, tenant(s), plan) que se refresca
 *    cada vez que se escribe el auth-cache normal.
 *
 * Si al iniciar sesión no hay internet, se verifica la contraseña contra el
 * verificador local y, si coincide, se restaura el snapshot: el POS queda
 * operable con los datos pre-cacheados y la cola offline (ventas, apertura de
 * caja). Al volver el internet, el próximo login online renueva todo.
 *
 * Seguridad:
 *  - Solo funciona en un dispositivo donde esa cuenta YA inició sesión online.
 *  - 5 intentos fallidos seguidos borran el verificador (obliga a login online).
 *  - Expira a los 7 días del último login online.
 */

const CRED_KEY = 'novapos_offline_login';
const SNAPSHOT_KEY = 'novapos_offline_snapshot';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;   // 7 días
const MAX_ATTEMPTS = 5;
const ITERATIONS = 150_000;

interface OfflineCred {
  emailNorm: string;
  userId: string;
  saltB64: string;
  hashB64: string;
  iterations: number;
  updatedAt: number;
  failedAttempts: number;
}

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, key, 256);
  return b64(bits);
}

function readCred(): OfflineCred | null {
  try {
    const raw = localStorage.getItem(CRED_KEY);
    if (!raw) return null;
    const c: OfflineCred = JSON.parse(raw);
    if (Date.now() - c.updatedAt > MAX_AGE_MS) { localStorage.removeItem(CRED_KEY); return null; }
    return c;
  } catch { return null; }
}

/** Guarda/renueva el verificador tras un login ONLINE exitoso. Fire-and-forget. */
export async function saveOfflineCredential(email: string, password: string, userId: string): Promise<void> {
  try {
    if (!crypto?.subtle) return;   // contexto no seguro (http sin localhost)
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hashB64 = await pbkdf2(password, salt, ITERATIONS);
    const cred: OfflineCred = {
      emailNorm: email.trim().toLowerCase(),
      userId,
      saltB64: b64(salt.buffer),
      hashB64,
      iterations: ITERATIONS,
      updatedAt: Date.now(),
      failedAttempts: 0,
    };
    localStorage.setItem(CRED_KEY, JSON.stringify(cred));
  } catch { /* nunca bloquear el login online por esto */ }
}

/** Snapshot del estado de auth para restaurar sin red. Lo escribe AuthContext
 *  junto con su cache normal; sobrevive al logout y a la expiración por edad. */
export function saveOfflineSnapshot(snapshot: unknown): void {
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ data: snapshot, savedAt: Date.now() })); }
  catch { /* sin espacio */ }
}

export function readOfflineSnapshot<T = any>(): T | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const { data, savedAt } = JSON.parse(raw);
    if (Date.now() - savedAt > MAX_AGE_MS) { localStorage.removeItem(SNAPSHOT_KEY); return null; }
    return data as T;
  } catch { return null; }
}

/**
 * Verifica email+contraseña contra el verificador local.
 * Devuelve el userId si coincide; null si no hay verificador, no coincide,
 * o se agotaron los intentos (en ese caso se borra el verificador).
 */
export async function verifyOfflineCredential(email: string, password: string): Promise<string | null> {
  const cred = readCred();
  if (!cred || !crypto?.subtle) return null;
  if (cred.emailNorm !== email.trim().toLowerCase()) return null;
  try {
    const hash = await pbkdf2(password, unb64(cred.saltB64), cred.iterations);
    if (hash === cred.hashB64) {
      cred.failedAttempts = 0;
      localStorage.setItem(CRED_KEY, JSON.stringify(cred));
      return cred.userId;
    }
    cred.failedAttempts = (cred.failedAttempts ?? 0) + 1;
    if (cred.failedAttempts >= MAX_ATTEMPTS) localStorage.removeItem(CRED_KEY);
    else localStorage.setItem(CRED_KEY, JSON.stringify(cred));
    return null;
  } catch { return null; }
}

export function clearOfflineLogin(): void {
  try { localStorage.removeItem(CRED_KEY); localStorage.removeItem(SNAPSHOT_KEY); } catch { /* ignore */ }
}
