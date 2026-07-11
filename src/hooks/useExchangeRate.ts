import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export interface ExchangeRate {
  date: string;
  venta: number;   // ₡ por $1 (tipo de cambio de venta BCCR)
  compra: number;
  source: string;
  stale?: boolean;
}

// Cache en memoria + localStorage (para offline) por fecha CR.
let mem: ExchangeRate | null = null;
const LS_KEY = 'exchange_rate_cr';

function todayCR(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
}

/** Tipo de cambio del dólar (BCCR). Devuelve `venta` = ₡ por $1. */
export function useExchangeRate(): { rate: ExchangeRate | null; loading: boolean } {
  const [rate, setRate] = useState<ExchangeRate | null>(() => {
    if (mem) return mem;
    try { const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); return s?.date === todayCR() ? s : null; }
    catch { return null; }
  });
  const [loading, setLoading] = useState(!rate);

  useEffect(() => {
    if (rate && rate.date === todayCR()) return;   // ya tenemos el de hoy
    let cancel = false;
    (async () => {
      try {
        const r = await apiFetch<ExchangeRate>('/exchange-rate');
        if (cancel) return;
        if (r?.venta) { mem = r; try { localStorage.setItem(LS_KEY, JSON.stringify(r)); } catch { /* noop */ } }
        setRate(r ?? null);
      } catch { /* mantenemos lo cacheado */ }
      finally { if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { rate, loading };
}
