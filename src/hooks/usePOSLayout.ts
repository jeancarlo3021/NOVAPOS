import { useCallback, useEffect, useState } from 'react';

export type POSLayout = 'grid' | 'list';

const STORAGE_KEY = 'novapos_pos_layout';
const EVENT_NAME  = 'pos-layout-changed';

function readLayout(): POSLayout {
  if (typeof window === 'undefined') return 'grid';
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'list' ? 'list' : 'grid';
}

/**
 * Layout del POS: cuadrícula (default) o lista (estilo "todos los productos
 * en filas con buscador grande"). Persistente por dispositivo.
 */
export function usePOSLayout() {
  const [layout, setLayoutState] = useState<POSLayout>(() => readLayout());

  useEffect(() => {
    const onSame  = () => setLayoutState(readLayout());
    const onCross = (e: StorageEvent) => { if (e.key === STORAGE_KEY) setLayoutState(readLayout()); };
    window.addEventListener(EVENT_NAME, onSame);
    window.addEventListener('storage', onCross);
    return () => {
      window.removeEventListener(EVENT_NAME, onSame);
      window.removeEventListener('storage', onCross);
    };
  }, []);

  const setLayout = useCallback((next: POSLayout) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    } catch { /* localStorage bloqueado */ }
  }, []);

  return { layout, setLayout };
}

export default usePOSLayout;
