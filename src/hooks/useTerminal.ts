import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'novapos_terminal';
const EVENT_NAME  = 'terminal-changed';

/**
 * Número de TERMINAL (caja) de ESTE equipo.
 *
 * Cuando varias computadoras facturan al mismo tiempo, todas compartían la misma
 * terminal y peleaban por el mismo consecutivo. Hacienda ya resuelve esto: el
 * consecutivo de 20 dígitos lleva la terminal adentro
 * (`sucursal(3) + terminal(5) + tipo(2) + número(10)`), así que dos equipos con
 * terminal distinta generan consecutivos distintos aunque el número interno
 * coincida — sin coordinación entre ellos y funcionando también sin internet.
 *
 * Es una preferencia POR EQUIPO (localStorage), como el layout del POS.
 */
export function readTerminal(): number {
  if (typeof window === 'undefined') return 1;
  const n = parseInt(localStorage.getItem(STORAGE_KEY) ?? '', 10);
  return Number.isFinite(n) && n >= 1 && n <= 99999 ? n : 1;
}

export function useTerminal() {
  const [terminal, setState] = useState<number>(() => readTerminal());

  useEffect(() => {
    const onSame  = () => setState(readTerminal());
    const onCross = (e: StorageEvent) => { if (e.key === STORAGE_KEY) setState(readTerminal()); };
    window.addEventListener(EVENT_NAME, onSame);
    window.addEventListener('storage', onCross);
    return () => {
      window.removeEventListener(EVENT_NAME, onSame);
      window.removeEventListener('storage', onCross);
    };
  }, []);

  const setTerminal = useCallback((n: number) => {
    const clean = Math.max(1, Math.min(99999, Math.floor(Number(n) || 1)));
    try {
      localStorage.setItem(STORAGE_KEY, String(clean));
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    } catch { /* localStorage bloqueado */ }
  }, []);

  return { terminal, setTerminal };
}

export default useTerminal;
