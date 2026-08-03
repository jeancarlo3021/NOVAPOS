import { useCallback, useEffect, useRef, useState } from 'react';
import { syncOfflineDay, pendingDayCount, type DaySyncResult } from '@/services/offlineDaySync';
import { backendReachable } from '@/services/connectivity/connectivityService';


/**
 * Mantiene la jornada offline sincronizándose sola.
 *
 * Sondea el BACKEND de verdad (no `navigator.onLine`, que da "en línea" con solo
 * estar pegado al WiFi): mientras haya algo pendiente reintenta cada 30 s, y si no
 * hay nada, cada 5 min por si alguien dejó operaciones en otra pestaña. Así una
 * jornada entera sin internet sube sola en cuanto vuelve, sin que nadie apriete nada.
 */
export function useOfflineDaySync(
  tenantId: string | null | undefined,
  syncInvoices?: () => Promise<number | void>,
) {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<DaySyncResult | null>(null);
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const syncRef = useRef(syncInvoices);
  syncRef.current = syncInvoices;

  const refreshPending = useCallback(async () => {
    try { setPending(await pendingDayCount(tenantId)); } catch { /* ignore */ }
  }, [tenantId]);

  const runSync = useCallback(async (): Promise<DaySyncResult | null> => {
    if (syncing) return null;
    const count = await pendingDayCount(tenantId).catch(() => 0);
    setPending(count);
    if (count === 0) return null;
    setSyncing(true);
    try {
      const r = await syncOfflineDay(tenantId, { syncInvoices: syncRef.current });
      setLastResult(r);
      await refreshPending();
      return r;
    } finally { setSyncing(false); }
  }, [tenantId, syncing, refreshPending]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (!alive) return;
      const reachable = await backendReachable().catch(() => false);
      if (alive) setOnline(reachable);
      let left = 0;
      try { left = await pendingDayCount(tenantId); } catch { /* ignore */ }
      if (alive) setPending(left);
      if (reachable && left > 0) await runSync();
      if (!alive) return;
      // Con pendientes se reintenta seguido; sin pendientes, espaciado.
      timer = setTimeout(tick, left > 0 ? 30_000 : 5 * 60_000);
    };

    // Primer intento apenas monta (cubre el caso "se abrió la app ya con internet").
    timer = setTimeout(tick, 1_500);

    // El evento `online` del navegador es una señal MÁS, no la única.
    const onOnline = () => { void tick(); };
    window.addEventListener('online', onOnline);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [tenantId, runSync]);

  return { pending, syncing, online, lastResult, sync: runSync, refreshPending };
}

export default useOfflineDaySync;
