import { useEffect, useState } from 'react';
import { clearAppCache } from '@/utils/clearAppCache';
import { enableServiceWorker, swDisabled } from '@/pwa';

/**
 * Listener global del atajo de teclado para limpiar caché.
 *
 * Atajos:
 *  - Ctrl + Shift + K   →  Limpia caché y recarga (sin tocar sesión).
 *  - Ctrl + Alt + K     →  Limpia caché + sesión (logout) y recarga.
 *
 * Se usa "K" porque Ctrl+J abre Descargas en Edge/Chrome, Ctrl+R recarga,
 * y Ctrl+Shift+R hace hard reload pero no limpia IndexedDB ni localStorage.
 */
export function ClearCacheShortcut() {
  const [working, setWorking] = useState(false);
  // El modo recuperación apaga el service worker; sin él no hay modo offline, así
  // que hay que decirlo y dar la vuelta atrás. Si no, el negocio se queda sin
  // offline para siempre sin enterarse.
  const [noSw, setNoSw] = useState(false);
  useEffect(() => { setNoSw(swDisabled()); }, []);

  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (inInput) return;

      const isClearOnly = e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k';
      const isClearAuth = e.ctrlKey && e.altKey  && !e.shiftKey && e.key.toLowerCase() === 'k';
      if (!isClearOnly && !isClearAuth) return;

      e.preventDefault();
      if (working) return;

      // ⚠️ Si hay ventas/operaciones SIN SINCRONIZAR, limpiar el cache las BORRA
      // para siempre. Avisamos explícitamente y pedimos doble confirmación.
      let pending = 0;
      try {
        const { posOfflineService } = await import('@/services/pos/posOfflineService');
        const { cashSessionOfflineService } = await import('@/services/cashManagement/cashSessionOfflineService');
        const [inv, voids, sessions] = await Promise.all([
          posOfflineService.getPendingCount().catch(() => 0),
          posOfflineService.getPendingVoidCount().catch(() => 0),
          cashSessionOfflineService.getPendingCount().catch(() => 0),
        ]);
        pending = (inv ?? 0) + (voids ?? 0) + (sessions ?? 0);
      } catch { /* si falla el conteo, seguimos con el aviso normal */ }

      if (pending > 0) {
        if (!confirm(
          `⚠️ Hay ${pending} venta(s)/operación(es) SIN SINCRONIZAR.\n\n` +
          'Si limpiás el cache ahora, esas ventas se BORRAN de forma permanente ' +
          '(no se van a subir al servidor).\n\n' +
          'Conectate a internet y esperá a que se sincronicen antes de limpiar.\n\n' +
          '¿Aun así querés limpiar y PERDER esas ventas?'
        )) return;
      }

      const msg = isClearAuth
        ? '¿Limpiar TODA la caché Y cerrar sesión? (datos locales + login)'
        : '¿Limpiar caché local de la app y recargar? (datos guardados, no cierra sesión)';
      if (!confirm(msg)) return;

      setWorking(true);
      try {
        await clearAppCache({ clearAuth: isClearAuth, reload: true });
      } finally {
        setWorking(false);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [working]);

  if (!noSw) return null;

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 max-w-[92vw]">
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-3 py-2 shadow-lg text-xs">
        <span className="font-bold">Modo recuperación: sin funcionamiento offline.</span>
        <button
          onClick={() => {
            enableServiceWorker();
            const url = new URL(location.href);
            url.searchParams.delete('nosw');
            url.searchParams.delete('r');
            location.replace(url.toString());
          }}
          className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-black"
        >
          Reactivar
        </button>
      </div>
    </div>
  );
}
