import { lazy, type ComponentType } from 'react';

/**
 * `lazy()` que sobrevive a un despliegue nuevo.
 *
 * Los chunks llevan el hash del contenido en el nombre. Cuando se despliega una
 * versión, los archivos viejos desaparecen del servidor — y el navegador que
 * tenía la app abierta (o el index.html cacheado por el service worker) sigue
 * pidiendo `CreateOwner-Bic8hwBy.js`, que ya no existe. React muestra entonces
 * "Failed to fetch dynamically imported module" y la pantalla queda muerta.
 *
 * Acá se reintenta una vez —por si fue un corte de red— y, si vuelve a fallar,
 * se recarga la app: es un despliegue nuevo, y con el index.html fresco los
 * nombres de los chunks vuelven a cuadrar. La recarga se hace UNA sola vez por
 * sesión para no caer en un bucle si el problema fuera otro.
 */
const RELOAD_KEY = 'chunk_reload_at';
const RELOAD_COOLDOWN_MS = 60_000;

function esErrorDeChunk(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? '');
  return /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(msg);
}

async function recargarUnaVez(): Promise<never> {
  let ultimo = 0;
  try { ultimo = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0); } catch { /* sin storage */ }

  if (Date.now() - ultimo < RELOAD_COOLDOWN_MS) {
    // Ya se recargó hace nada: si se recarga otra vez entramos en bucle. Se deja
    // que el error suba y lo muestre el límite de errores, con su botón.
    throw new Error(
      'No se pudo cargar esta pantalla. Hay una versión nueva del sistema: '
      + 'recargá con Ctrl+Shift+K para limpiar la caché.',
    );
  }

  try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* sin storage */ }

  // El service worker guarda el index.html viejo, que es el que apunta a los
  // chunks que ya no existen: sin limpiarlo, recargar traería lo mismo.
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((regs ?? []).map(r => r.update().catch(() => {})));
    const keys = await caches?.keys?.();
    await Promise.all((keys ?? []).filter(k => /html|precache/i.test(k)).map(k => caches.delete(k)));
  } catch { /* si no se puede limpiar, igual se recarga */ }

  window.location.reload();
  // La recarga corta la ejecución; esto es solo para que TypeScript quede tranquilo.
  return new Promise<never>(() => {});
}

/** Igual que `lazy()`, pero tolerante a chunks viejos. */
export function lazyPage<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await loader();
    } catch (err) {
      if (!esErrorDeChunk(err)) throw err;
      // Un reintento: cubre el corte de red momentáneo sin recargar la app.
      try {
        return await loader();
      } catch {
        return recargarUnaVez();
      }
    }
  });
}

export default lazyPage;
