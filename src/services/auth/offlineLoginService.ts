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
// El respaldo en JS puro es ~100× más lento: con 150k tardaría minutos en una tablet.
const ITERATIONS_FALLBACK = 20_000;

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

/** ¿Hay WebCrypto? Solo existe en contexto seguro (https o localhost). Un POS
 *  servido por http://192.168.x.x —lo habitual en tablets de local— NO lo tiene. */
export function hasWebCrypto(): boolean {
  return typeof crypto !== 'undefined' && !!(crypto as any).subtle;
}

// ── SHA-256 en JS puro (respaldo para contexto NO seguro) ───────────────────
// Sin esto, en http:// el login offline nunca llegaba a guardar el verificador y
// fallaba en silencio. Es más lento que WebCrypto, por eso el respaldo usa menos
// iteraciones (ver ITERATIONS_FALLBACK).
const K = [
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
];
function sha256Bytes(msg: Uint8Array): Uint8Array {
  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const l = msg.length;
  const withPad = new Uint8Array((((l + 8) >> 6) + 1) * 64);
  withPad.set(msg);
  withPad[l] = 0x80;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 4, l * 8, false);
  const w = new Uint32Array(64);
  const rr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < withPad.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rr(w[t-15],7) ^ rr(w[t-15],18) ^ (w[t-15] >>> 3);
      const s1 = rr(w[t-2],17) ^ rr(w[t-2],19) ^ (w[t-2] >>> 10);
      w[t] = (w[t-16] + s0 + w[t-7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  H.forEach((v, i) => odv.setUint32(i * 4, v, false));
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  if (hasWebCrypto()) {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, key, 256);
    return b64(bits);
  }
  // Respaldo: SHA-256 iterado sobre salt+password. No es PBKDF2, pero cumple lo
  // necesario acá: no guardar la contraseña y encarecer un ataque por fuerza bruta
  // sobre un dispositivo que además ya requiere haber iniciado sesión online antes.
  const pw = new TextEncoder().encode(password);
  const seed = new Uint8Array(salt.length + pw.length);
  seed.set(salt); seed.set(pw, salt.length);
  let acc: Uint8Array = seed;
  for (let i = 0; i < iterations; i++) acc = sha256Bytes(acc);
  const outBuf = new ArrayBuffer(acc.length);
  new Uint8Array(outBuf).set(acc);
  return b64(outBuf);
}

/**
 * Verificadores de TODOS los usuarios que iniciaron sesión en este dispositivo,
 * indexados por correo normalizado.
 *
 * Antes se guardaba UNO solo: si entraba el admin y después un cajero, el segundo
 * pisaba al primero y solo el último podía entrar sin internet. En un POS pasan
 * varios usuarios por la misma máquina, así que cada uno tiene el suyo.
 */
type CredMap = Record<string, OfflineCred>;

function readCredMap(): CredMap {
  try {
    const raw = localStorage.getItem(CRED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Compatibilidad: si venía el formato viejo (un solo objeto), se migra al mapa.
    if (parsed && typeof parsed === 'object' && typeof parsed.emailNorm === 'string') {
      const map: CredMap = { [parsed.emailNorm]: parsed as OfflineCred };
      localStorage.setItem(CRED_KEY, JSON.stringify(map));
      return map;
    }
    return (parsed ?? {}) as CredMap;
  } catch { return {}; }
}

function writeCredMap(map: CredMap): void {
  try { localStorage.setItem(CRED_KEY, JSON.stringify(map)); } catch { /* sin espacio */ }
}

/** Guarda/renueva el verificador tras un login ONLINE exitoso. Fire-and-forget. */
export async function saveOfflineCredential(email: string, password: string, userId: string): Promise<void> {
  try {
    const iterations = hasWebCrypto() ? ITERATIONS : ITERATIONS_FALLBACK;
    // getRandomValues SÍ existe fuera de contexto seguro; solo `subtle` no.
    const salt = (typeof crypto !== 'undefined' && crypto.getRandomValues)
      ? crypto.getRandomValues(new Uint8Array(16))
      : Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
    const hashB64 = await pbkdf2(password, salt, iterations);
    const cred: OfflineCred = {
      emailNorm: email.trim().toLowerCase(),
      userId,
      saltB64: (() => { const bb = new ArrayBuffer(salt.length); new Uint8Array(bb).set(salt); return b64(bb); })(),
      hashB64,
      iterations,
      updatedAt: Date.now(),
      failedAttempts: 0,
    };
    const map = readCredMap();
    map[cred.emailNorm] = cred;
    writeCredMap(map);
  } catch (e) { console.warn('[offline-login] no se pudo guardar el verificador:', e); }
}

/** Snapshot del estado de auth para restaurar sin red. Lo escribe AuthContext
 *  junto con su cache normal; sobrevive al logout y a la expiración por edad. */
export function saveOfflineSnapshot(snapshot: unknown): void {
  try {
    const userId = String((snapshot as any)?.userId ?? '');
    if (!userId) return;
    // Un snapshot POR USUARIO: con uno solo, el último en entrar borraba el del
    // anterior y ese usuario ya no podía restaurar su sesión sin internet.
    const all = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '{}');
    const map = (all && typeof all === 'object' && !all.data) ? all : {};
    map[userId] = { data: snapshot, savedAt: Date.now() };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(map));
  } catch { /* sin espacio */ }
}

/** Snapshot de un usuario. Sin `userId` devuelve el más reciente (compatibilidad). */
export function readOfflineSnapshot<T = any>(userId?: string): T | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Formato viejo: { data, savedAt } suelto.
    if (parsed?.data) {
      if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
      return parsed.data as T;
    }
    const entries = Object.entries(parsed ?? {}) as Array<[string, any]>;
    const hit = userId
      ? entries.find(([k]) => k === userId)?.[1]
      : entries.sort((a, b) => (b[1]?.savedAt ?? 0) - (a[1]?.savedAt ?? 0))[0]?.[1];
    if (!hit) return null;
    if (Date.now() - hit.savedAt > MAX_AGE_MS) return null;
    return hit.data as T;
  } catch { return null; }
}

/**
 * Verifica email+contraseña contra el verificador local.
 * Devuelve el userId si coincide; null si no hay verificador, no coincide,
 * o se agotaron los intentos (en ese caso se borra el verificador).
 */
export async function verifyOfflineCredential(email: string, password: string): Promise<string | null> {
  const emailNorm = email.trim().toLowerCase();
  const map = readCredMap();
  const cred = map[emailNorm];
  if (!cred) return null;
  if (Date.now() - cred.updatedAt > MAX_AGE_MS) { delete map[emailNorm]; writeCredMap(map); return null; }
  try {
    const hash = await pbkdf2(password, unb64(cred.saltB64), cred.iterations);
    if (hash === cred.hashB64) {
      cred.failedAttempts = 0;
      map[emailNorm] = cred;
      writeCredMap(map);
      return cred.userId;
    }
    // Los intentos fallidos se cuentan SOLO para ese usuario: que un cajero se
    // equivoque de contraseña no debe dejar afuera a los demás.
    cred.failedAttempts = (cred.failedAttempts ?? 0) + 1;
    if (cred.failedAttempts >= MAX_ATTEMPTS) delete map[emailNorm];
    else map[emailNorm] = cred;
    writeCredMap(map);
    return null;
  } catch { return null; }
}

/** Estado del login offline en ESTE dispositivo. Para diagnosticar sin adivinar:
 *  en la consola del navegador → `window.novaposOfflineLogin()`. */
export function offlineLoginStatus(): Record<string, any> {
  const map = readCredMap();
  const usuarios = Object.values(map).map(c => {
    const snap = readOfflineSnapshot<any>(c.userId);
    const dias = Math.floor((Date.now() - c.updatedAt) / 86400000);
    return {
      usuario: c.emailNorm,
      listo: !!snap && !!c && dias <= 7,
      snapshot_guardado: !!snap,
      intentos_fallidos: c.failedAttempts ?? 0,
      dias_desde_el_ultimo_login_online: dias,
      nota: !snap
        ? 'Tiene verificador pero NO snapshot: que inicie sesión online una vez más.'
        : dias > 7 ? 'Vencido: pasaron más de 7 días del último login online.'
        : 'Listo para entrar sin internet.',
    };
  });
  return {
    usuarios,
    total_usuarios: usuarios.length,
    alguno_listo: usuarios.some(u => u.listo),
    sesion_offline_activa: isOfflineSessionActive(),
    webcrypto: hasWebCrypto(),
    contexto_seguro: typeof window !== 'undefined' ? (window as any).isSecureContext ?? null : null,
    nota: usuarios.length === 0
      ? 'Ningún usuario inició sesión ONLINE en este dispositivo con la app ya actualizada. '
        + 'Cada persona que vaya a entrar sin internet tiene que hacerlo UNA vez con conexión.'
      : `${usuarios.filter(u => u.listo).length} de ${usuarios.length} usuario(s) pueden entrar sin internet.`,
  };
}

if (typeof window !== 'undefined') {
  (window as any).novaposOfflineLogin = offlineLoginStatus;
}

const ACTIVE_KEY = 'novapos_offline_session_active';

// ── Contraseña EN MEMORIA para reautenticar al volver el internet ───────────
// NO se persiste NUNCA (ni localStorage ni IndexedDB): vive solo mientras la
// pestaña esté abierta. Con esto, si el internet vuelve durante la jornada, la
// sesión se convierte en una real sin molestar al cajero. Si la app se recargó,
// la memoria se perdió y hay que pedir la contraseña una vez.
let pendingCredential: { email: string; password: string } | null = null;

export function holdCredentialForReauth(email: string, password: string): void {
  pendingCredential = { email, password };
}
export function takeCredentialForReauth(): { email: string; password: string } | null {
  return pendingCredential;
}
export function forgetCredentialForReauth(): void {
  pendingCredential = null;
}

/** Marca que la sesión actual se abrió SIN internet (no hay token de Supabase).
 *  Se usa al recargar para restaurar el snapshot en vez de mandar al login. */
export function setOfflineSessionActive(active: boolean): void {
  try {
    if (active) localStorage.setItem(ACTIVE_KEY, '1');
    else        { localStorage.removeItem(ACTIVE_KEY); forgetCredentialForReauth(); }
  } catch { /* ignore */ }
}

export function isOfflineSessionActive(): boolean {
  try { return localStorage.getItem(ACTIVE_KEY) === '1'; } catch { return false; }
}

export function clearOfflineLogin(): void {
  try {
    localStorage.removeItem(CRED_KEY);
    localStorage.removeItem(SNAPSHOT_KEY);
    localStorage.removeItem(ACTIVE_KEY);
  } catch { /* ignore */ }
}
