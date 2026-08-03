import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'novapos_simple_cash_count';
const EVENT_NAME  = 'simple-cash-count-changed';

function read(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === '1';
}

/**
 * Conteo de caja SIMPLE: la apertura y el cierre piden un único campo con el
 * monto de efectivo, en vez de la cuadrícula de denominaciones (billetes y
 * monedas). El resto del cierre (tarjeta, SINPE, notas, resumen, diferencia)
 * queda exactamente igual. Persistente por dispositivo, como el resto de las
 * preferencias del POS.
 */
export function useSimpleCashCount() {
  const [simpleCash, setState] = useState<boolean>(() => read());

  useEffect(() => {
    const onSame  = () => setState(read());
    const onCross = (e: StorageEvent) => { if (e.key === STORAGE_KEY) setState(read()); };
    window.addEventListener(EVENT_NAME, onSame);
    window.addEventListener('storage', onCross);
    return () => {
      window.removeEventListener(EVENT_NAME, onSame);
      window.removeEventListener('storage', onCross);
    };
  }, []);

  const setSimpleCash = useCallback((next: boolean) => {
    try {
      if (next) localStorage.setItem(STORAGE_KEY, '1');
      else      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    } catch { /* localStorage bloqueado */ }
  }, []);

  return { simpleCash, setSimpleCash };
}

export default useSimpleCashCount;
