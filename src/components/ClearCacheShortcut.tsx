import { useEffect, useState } from 'react';
import { clearAppCache } from '@/utils/clearAppCache';

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

  return null;
}
