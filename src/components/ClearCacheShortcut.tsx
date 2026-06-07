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
