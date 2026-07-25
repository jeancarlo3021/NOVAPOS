import { registerSW } from 'virtual:pwa-register';

export function setupPWA() {
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
