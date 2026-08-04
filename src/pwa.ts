import { registerSW } from 'virtual:pwa-register';

/** Marca para arrancar SIN service worker (queda hasta que se quite a mano). */
const NO_SW_KEY = 'novapos_no_sw';

/**
 * Desactiva el service worker y borra sus caches.
 *
 * Un SW roto secuestra la app entera: sirve una versión vieja o falla al
 * responder y la pantalla queda en blanco, sin importar cuántas veces se
 * recargue ni se limpie el caché desde el navegador. Este es el botón de
 * emergencia. Con `?nosw=1` en la URL la app arranca directo de la red.
 */
export async function disableServiceWorker(): Promise<void> {
  try { localStorage.setItem(NO_SW_KEY, '1'); } catch { /* ignore */ }
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch { /* ignore */ }
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch { /* ignore */ }
}

/** Vuelve a permitir el service worker (offline otra vez disponible). */
export function enableServiceWorker(): void {
  try { localStorage.removeItem(NO_SW_KEY); } catch { /* ignore */ }
}

export function swDisabled(): boolean {
  try {
    if (new URLSearchParams(location.search).has('nosw')) return true;
    return localStorage.getItem(NO_SW_KEY) === '1';
  } catch { return false; }
}

export function setupPWA() {
  // ── MODO SIN SERVICE WORKER ─────────────────────────────────────────────
  // Se entra acá desde la pantalla de recuperación (`?nosw=1`). Es la única
  // forma de romper el círculo cuando el SW quedó en mal estado: mientras siga
  // registrado vuelve a tomar el control en cada recarga.
  if (swDisabled()) {
    void disableServiceWorker();
    console.warn('[pwa] Service worker DESACTIVADO en este dispositivo (modo recuperación).');
    return;
  }

  // ── DESARROLLO: sin service worker ──────────────────────────────────────
  // En `npm run dev` no debe haber SW. Si quedó uno registrado de un build o
  // `preview` anterior, sigue interceptando y sirviendo CACHE VIEJO en
  // localhost (F5 no trae los cambios). Lo desregistramos y borramos sus caches
  // para que un F5 siempre cargue lo último. (Puede requerir un segundo F5 la
  // primera vez, ya que el SW controla la página hasta la próxima recarga.)
  if (import.meta.env.DEV) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then(regs => regs.forEach(r => r.unregister()))
        .catch(() => {});
    }
    if (typeof caches !== 'undefined') {
      caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
    }
    return;
  }

  const updateSW = registerSW({
    immediate: true,
    async onNeedRefresh() {
      // Versión nueva detectada (ocurre al cargar / dar F5). Reiniciamos el cache
      // por completo y recargamos con lo nuevo, sin depender de que el usuario
      // toque nada. Así un F5 SIEMPRE trae los cambios (íconos, bundles, todo).
      try {
        if (typeof caches !== 'undefined') {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
      } catch { /* si falla el borrado, igual aplicamos el update abajo */ }
      updateSW(true).catch(() => location.reload());
    },
    onOfflineReady() {
      // Listo para usar sin conexión — silencioso, no interrumpe al cajero.
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Chequea si hay versión nueva en CADA carga (F5) y cuando la pestaña
      // vuelve al foco. Si la hay → onNeedRefresh limpia el cache y recarga.
      const check = () => { registration.update().catch(() => {}); };
      check();
      window.addEventListener('focus', check);
    },
  });
}
