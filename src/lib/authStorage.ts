// Custom Supabase auth storage with 12-hour guaranteed session duration.
// Uses localStorage for persistence with timestamp-based expiration.
//
// Sessions persist across:
// - Page reloads
// - New tabs
// - Browser restarts (within 12h window)
// - Until explicit logout or 12h timeout

const REMEMBER_KEY      = 'novapos_remember';
const PERSIST_PREFIX    = 'novapos_p_';
const SESSION_START_KEY = 'novapos_session_start';
const SESSION_MAX_MS    = 12 * 60 * 60 * 1000; // 12 hours

function isSessionExpired(): boolean {
  const startStr = localStorage.getItem(SESSION_START_KEY);
  if (!startStr) return false;
  const start = parseInt(startStr, 10);
  if (isNaN(start)) return false;
  return Date.now() - start > SESSION_MAX_MS;
}

function clearAllAuthData(): void {
  // Clear sessionStorage
  const sessionKeys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k?.startsWith('sb-') || k?.startsWith(PERSIST_PREFIX)) sessionKeys.push(k);
  }
  sessionKeys.forEach(k => sessionStorage.removeItem(k));

  // Clear localStorage persisted tokens
  const localKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PERSIST_PREFIX) || k?.startsWith('sb-')) localKeys.push(k);
  }
  localKeys.forEach(k => localStorage.removeItem(k));

  localStorage.removeItem(SESSION_START_KEY);
}

export const authStorage = {
  getItem(key: string): string | null {
    // Check 12-hour session timeout first
    if (isSessionExpired()) {
      clearAllAuthData();
      return null;
    }

    // 1. Check current tab's sessionStorage first
    const sessionVal = sessionStorage.getItem(key);
    if (sessionVal !== null) return sessionVal;

    // 2. Always restore from localStorage (default = remember for 12h)
    const persisted = localStorage.getItem(PERSIST_PREFIX + key);
    if (persisted !== null) {
      sessionStorage.setItem(key, persisted);
      return persisted;
    }

    return null;
  },

  setItem(key: string, value: string): void {
    sessionStorage.setItem(key, value);
    // Always mirror to localStorage (12h persistence)
    localStorage.setItem(PERSIST_PREFIX + key, value);
    // Track when session started to enforce 12h max
    if (!localStorage.getItem(SESSION_START_KEY)) {
      localStorage.setItem(SESSION_START_KEY, String(Date.now()));
    }
  },

  removeItem(key: string): void {
    sessionStorage.removeItem(key);
    localStorage.removeItem(PERSIST_PREFIX + key);
  },
};

// Call this BEFORE supabase.auth.signInWithPassword to track session start time.
export function setRememberMe(remember: boolean): void {
  if (remember) {
    localStorage.setItem(REMEMBER_KEY, '1');
  } else {
    localStorage.removeItem(REMEMBER_KEY);
  }
  // Reset session timer on new login
  localStorage.setItem(SESSION_START_KEY, String(Date.now()));
}

export function isRememberMeEnabled(): boolean {
  return localStorage.getItem(REMEMBER_KEY) === '1';
}

export function getSessionRemainingMs(): number {
  const startStr = localStorage.getItem(SESSION_START_KEY);
  if (!startStr) return SESSION_MAX_MS;
  const start = parseInt(startStr, 10);
  if (isNaN(start)) return SESSION_MAX_MS;
  return Math.max(0, SESSION_MAX_MS - (Date.now() - start));
}

export function clearSession(): void {
  // Clear all auth-related data
  const allKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PERSIST_PREFIX) || k?.startsWith('sb-') || k === SESSION_START_KEY || k === REMEMBER_KEY) {
      allKeys.push(k);
    }
  }
  allKeys.forEach(k => localStorage.removeItem(k));

  const sessKeys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(PERSIST_PREFIX) || k?.startsWith('sb-')) sessKeys.push(k);
  }
  sessKeys.forEach(k => sessionStorage.removeItem(k));
}
