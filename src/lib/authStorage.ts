// Almacenamiento de la sesión de Supabase. Dura una jornada completa.
// Uses localStorage for persistence with timestamp-based expiration.
//
// Sessions persist across:
// - Page reloads
// - New tabs
// - Browser restarts (dentro de la ventana de 24 h)
// - Hasta cerrar sesión a mano, el corte de las 4 a. m., o las 24 h de tope
//
// ── Por qué todo pasa por `safeLocal` / `safeSession` ──────────────────────
// `localStorage` no siempre responde. En una PWA instalada, con "bloquear datos
// de sitios" activado, en navegación privada o con el teléfono sin espacio,
// cualquier acceso LANZA (SecurityError / QuotaExceededError). Como Supabase
// llama a este storage mientras se crea el cliente —o sea, al importar el
// módulo— una excepción acá tumbaba el arranque entero: React nunca montaba y
// el usuario veía una PANTALLA EN BLANCO, sin error y sin que limpiar el caché
// sirviera de nada.
//
// Con el respaldo en memoria la sesión no sobrevive a cerrar la app en esos
// dispositivos, pero al menos se puede entrar y trabajar.

const REMEMBER_KEY      = 'novapos_remember';
const PERSIST_PREFIX    = 'novapos_p_';
const SESSION_START_KEY = 'novapos_session_start';
/**
 * Techo del almacenamiento: UN DÍA.
 *
 * No es la regla que manda —esa es el corte de las 4 a. m. en AuthContext, que
 * dura una jornada de trabajo—, sino un tope de seguridad por si esa marca se
 * perdiera.
 *
 * Antes eran 12 horas y ESE era el problema: quien entraba a las 7 de la mañana
 * quedaba fuera a las 7 de la tarde, en plena venta, con la caja abierta y sin
 * ningún aviso. Doce horas no cubren un día de comercio. Con 24 el que decide
 * es siempre el corte de madrugada, que es el que se pensó para esto.
 */
const SESSION_MAX_MS    = 24 * 60 * 60 * 1000; // 24 horas

/** Respaldo cuando el navegador no deja usar su almacenamiento. */
const memoryLocal   = new Map<string, string>();
const memorySession = new Map<string, string>();

function makeSafeStore(pick: () => Storage, fallback: Map<string, string>) {
  let usable: boolean | null = null;

  const available = (): boolean => {
    if (usable !== null) return usable;
    try {
      const s = pick();
      const probe = '__novapos_probe__';
      s.setItem(probe, '1');
      s.removeItem(probe);
      usable = true;
    } catch {
      usable = false;
      console.warn('[auth] El navegador bloquea el almacenamiento: la sesión se guarda solo en memoria.');
    }
    return usable;
  };

  return {
    getItem(key: string): string | null {
      if (!available()) return fallback.get(key) ?? null;
      try { return pick().getItem(key); } catch { return fallback.get(key) ?? null; }
    },
    setItem(key: string, value: string): void {
      fallback.set(key, value);
      if (!available()) return;
      // Si el disco se llenó, el valor ya quedó en memoria: no se pierde la
      // sesión en curso ni se rompe el login.
      try { pick().setItem(key, value); } catch { /* quota / bloqueado */ }
    },
    removeItem(key: string): void {
      fallback.delete(key);
      if (!available()) return;
      try { pick().removeItem(key); } catch { /* ignore */ }
    },
    /** Claves presentes, para los barridos por prefijo. */
    keys(): string[] {
      const out = new Set<string>(fallback.keys());
      if (available()) {
        try {
          const s = pick();
          for (let i = 0; i < s.length; i++) {
            const k = s.key(i);
            if (k) out.add(k);
          }
        } catch { /* ignore */ }
      }
      return [...out];
    },
  };
}

const safeLocal   = makeSafeStore(() => window.localStorage, memoryLocal);
const safeSession = makeSafeStore(() => window.sessionStorage, memorySession);

function isSessionExpired(): boolean {
  const startStr = safeLocal.getItem(SESSION_START_KEY);
  if (!startStr) return false;
  const start = parseInt(startStr, 10);
  if (isNaN(start)) return false;
  return Date.now() - start > SESSION_MAX_MS;
}

function clearAllAuthData(): void {
  for (const k of safeSession.keys()) {
    if (k.startsWith('sb-') || k.startsWith(PERSIST_PREFIX)) safeSession.removeItem(k);
  }
  for (const k of safeLocal.keys()) {
    if (k.startsWith(PERSIST_PREFIX) || k.startsWith('sb-')) safeLocal.removeItem(k);
  }
  safeLocal.removeItem(SESSION_START_KEY);
}

export const authStorage = {
  getItem(key: string): string | null {
    // Check 12-hour session timeout first
    if (isSessionExpired()) {
      clearAllAuthData();
      return null;
    }

    // 1. Check current tab's sessionStorage first
    const sessionVal = safeSession.getItem(key);
    if (sessionVal !== null) return sessionVal;

    // 2. Always restore from localStorage (default = remember for 12h)
    const persisted = safeLocal.getItem(PERSIST_PREFIX + key);
    if (persisted !== null) {
      safeSession.setItem(key, persisted);
      return persisted;
    }

    return null;
  },

  setItem(key: string, value: string): void {
    safeSession.setItem(key, value);
    // Always mirror to localStorage (12h persistence)
    safeLocal.setItem(PERSIST_PREFIX + key, value);
    // Track when session started to enforce 12h max
    if (!safeLocal.getItem(SESSION_START_KEY)) {
      safeLocal.setItem(SESSION_START_KEY, String(Date.now()));
    }
  },

  removeItem(key: string): void {
    safeSession.removeItem(key);
    safeLocal.removeItem(PERSIST_PREFIX + key);
  },
};

// Call this BEFORE supabase.auth.signInWithPassword to track session start time.
export function setRememberMe(remember: boolean): void {
  if (remember) {
    safeLocal.setItem(REMEMBER_KEY, '1');
  } else {
    safeLocal.removeItem(REMEMBER_KEY);
  }
  // Reset session timer on new login
  safeLocal.setItem(SESSION_START_KEY, String(Date.now()));
}

export function isRememberMeEnabled(): boolean {
  return safeLocal.getItem(REMEMBER_KEY) === '1';
}

export function getSessionRemainingMs(): number {
  const startStr = safeLocal.getItem(SESSION_START_KEY);
  if (!startStr) return SESSION_MAX_MS;
  const start = parseInt(startStr, 10);
  if (isNaN(start)) return SESSION_MAX_MS;
  return Math.max(0, SESSION_MAX_MS - (Date.now() - start));
}

export function clearSession(): void {
  for (const k of safeLocal.keys()) {
    if (k.startsWith(PERSIST_PREFIX) || k.startsWith('sb-') || k === SESSION_START_KEY || k === REMEMBER_KEY) {
      safeLocal.removeItem(k);
    }
  }
  for (const k of safeSession.keys()) {
    if (k.startsWith(PERSIST_PREFIX) || k.startsWith('sb-')) safeSession.removeItem(k);
  }
}

/** ¿El navegador está dejando guardar la sesión en disco? (diagnóstico) */
export function storageIsPersistent(): boolean {
  try {
    window.localStorage.setItem('__novapos_probe__', '1');
    window.localStorage.removeItem('__novapos_probe__');
    return true;
  } catch { return false; }
}
