/**
 * Limpia toda la caché local de la app (localStorage, IndexedDB, Service Worker
 * caches, sessionStorage). Útil cuando un navegador como Edge se queda con
 * datos viejos después de un deploy o cambio de schema.
 *
 * Lo que NO toca:
 *  - La sesión de Supabase (sb-*) por defecto. Pasar `clearAuth: true` para
 *    forzar logout y limpiar también esos tokens.
 */
export interface ClearAppCacheOptions {
  /** Si true, también borra la sesión de Supabase (forzará re-login). */
  clearAuth?: boolean;
  /** Si true, recarga la página al terminar. Default true. */
  reload?: boolean;
}

export async function clearAppCache(opts: ClearAppCacheOptions = {}): Promise<void> {
  const { clearAuth = false, reload = true } = opts;

  // Keys que MANTIENEN la sesión iniciada. Solo se borran si clearAuth === true.
  // Incluye el token de Supabase (sb-*) y el cache de auth de la app (que empieza
  // con novapos_, así que hay que excluirlo explícitamente del barrido de app).
  const AUTH_KEYS = new Set(['novapos_auth_cache', 'novapos_session_login_ts']);
  const isAuthKey = (k: string) => k.startsWith('sb-') || AUTH_KEYS.has(k);

  // 1) localStorage — todas las keys de la app, PRESERVANDO la sesión.
  try {
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (isAuthKey(k)) {
        if (clearAuth) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
        continue;   // sin clearAuth → preservar (no desloguear)
      }
      const isAppKey =
        k.startsWith('novapos_') ||
        k.startsWith('receipt_cfg_') ||
        k.startsWith('tables_') ||
        k.startsWith('billing_');
      if (isAppKey) {
        try { localStorage.removeItem(k); } catch { /* ignore */ }
      }
    }
  } catch { /* SSR / privacidad */ }

  // 2) sessionStorage — preservando cualquier token de auth (sb-*).
  try {
    const skeys = Object.keys(sessionStorage);
    for (const k of skeys) {
      if (!clearAuth && isAuthKey(k)) continue;
      try { sessionStorage.removeItem(k); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  // 3) IndexedDB — todos los stores conocidos de la app
  try {
    const dbs = await (indexedDB as any).databases?.() ?? [];
    for (const db of dbs) {
      if (!db?.name) continue;
      if (
        db.name.startsWith('novapos') ||
        db.name === 'pos-cache' ||
        db.name === 'pos-offline'
      ) {
        try { indexedDB.deleteDatabase(db.name); } catch { /* ignore */ }
      }
    }
  } catch { /* navegador sin .databases() */ }

  // 4) Service Worker caches (workbox / PWA)
  try {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map(n => caches.delete(n).catch(() => false)));
    }
  } catch { /* ignore */ }

  // 5) Desregistrar Service Workers (forzar bundle nuevo en próximo load)
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister().catch(() => false)));
    }
  } catch { /* ignore */ }

  if (reload) {
    // Pequeña espera para que las operaciones async terminen antes de recargar.
    setTimeout(() => window.location.reload(), 100);
  }
}
