import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'novapos_assisted_mode';
const EVENT_NAME  = 'assisted-mode-changed';

function read(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === '1';
}

/**
 * Modo Asistido: simplifica drásticamente la UI para usuarios con poco
 * conocimiento de computadoras o personas mayores.
 *   - Sidebar reducido a 4 botones grandes
 *   - Tipografía base más grande
 *   - Sin tabs internos cuando es posible
 *   - Confirmaciones solo en acciones destructivas
 *
 * Persistente por dispositivo, no por tenant: una misma cuenta puede tener
 * un cajero con modo asistido y otro con modo avanzado.
 */
export function useAssistedMode() {
  const [assisted, setAssistedState] = useState<boolean>(() => read());

  useEffect(() => {
    const onSame  = () => setAssistedState(read());
    const onCross = (e: StorageEvent) => { if (e.key === STORAGE_KEY) setAssistedState(read()); };
    window.addEventListener(EVENT_NAME, onSame);
    window.addEventListener('storage', onCross);
    return () => {
      window.removeEventListener(EVENT_NAME, onSame);
      window.removeEventListener('storage', onCross);
    };
  }, []);

  const setAssisted = useCallback((next: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    } catch { /* ignore */ }
  }, []);

  // Aplica/quita una clase global en <html> para que CSS pueda gatear vista.
  useEffect(() => {
    const root = document.documentElement;
    if (assisted) root.classList.add('assisted-mode');
    else root.classList.remove('assisted-mode');
  }, [assisted]);

  return { assisted, setAssisted };
}

export default useAssistedMode;
