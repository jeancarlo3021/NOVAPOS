import { useEffect, useRef } from 'react';

/**
 * setInterval que SOLO corre cuando la pestaña está visible.
 *
 * Pausa al ocultarse (document.hidden) y, al volver, refresca de inmediato y
 * reanuda. Así los dashboards que la oficina/admins dejan abiertos en segundo
 * plano no siguen pegándole al backend — reduce Edge Requests / Function
 * Invocations / Fluid CPU en Vercel.
 *
 * @param cb        callback a ejecutar en cada tick (usa el último closure sin re-armar el timer)
 * @param intervalMs intervalo en ms (<=0 desactiva)
 * @param enabled   si es false, no arma nada
 */
export function useVisiblePolling(cb: () => void, intervalMs: number, enabled: boolean = true): void {
  const cbRef = useRef(cb);
  cbRef.current = cb;

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    if (typeof document === 'undefined') return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => cbRef.current();

    const start = () => { if (timer == null) timer = setInterval(tick, intervalMs); };
    const stop  = () => { if (timer != null) { clearInterval(timer); timer = null; } };

    const onVisibility = () => {
      if (document.hidden) stop();
      else { tick(); start(); }   // al volver: refresca ya + reanuda
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [intervalMs, enabled]);
}

export default useVisiblePolling;
