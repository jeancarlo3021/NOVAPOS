// Custom Supabase auth storage that uses sessionStorage by default.
// This isolates each browser tab: tabs can have different logged-in users
// and logging out one tab does NOT affect others.
//
// "Remember Me" — when enabled, the session is also mirrored to localStorage
// so a new tab (or page reload) can restore it automatically.

const REMEMBER_KEY   = 'novapos_remember';
const PERSIST_PREFIX = 'novapos_p_'; // prefix for persisted keys in localStorage

export const authStorage = {
  getItem(key: string): string | null {
    // 1. Check current tab's sessionStorage first
    const sessionVal = sessionStorage.getItem(key);
    if (sessionVal !== null) return sessionVal;

    // 2. If "Remember Me" is on, restore from localStorage into this tab
    if (localStorage.getItem(REMEMBER_KEY) === '1') {
      const persisted = localStorage.getItem(PERSIST_PREFIX + key);
      if (persisted !== null) {
        // Seed sessionStorage so future reads are fast
        sessionStorage.setItem(key, persisted);
        return persisted;
      }
    }

    return null;
  },

  setItem(key: string, value: string): void {
    sessionStorage.setItem(key, value);
    // Mirror to localStorage only when "Remember Me" is active
    if (localStorage.getItem(REMEMBER_KEY) === '1') {
      localStorage.setItem(PERSIST_PREFIX + key, value);
    }
  },

  removeItem(key: string): void {
    sessionStorage.removeItem(key);
    localStorage.removeItem(PERSIST_PREFIX + key);
  },
};

// Call this BEFORE supabase.auth.signInWithPassword so the storage adapter
// knows whether to mirror tokens to localStorage.
export function setRememberMe(remember: boolean): void {
  if (remember) {
    localStorage.setItem(REMEMBER_KEY, '1');
  } else {
    localStorage.removeItem(REMEMBER_KEY);
    // Also wipe any previously persisted tokens
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PERSIST_PREFIX)) toDelete.push(k);
    }
    toDelete.forEach(k => localStorage.removeItem(k));
  }
}

export function isRememberMeEnabled(): boolean {
  return localStorage.getItem(REMEMBER_KEY) === '1';
}
