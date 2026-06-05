import { useCallback, useEffect, useState } from 'react';

export type POSViewPreference = 'auto' | 'touch' | 'desktop';
export type POSViewResolved   = 'touch' | 'desktop';

const STORAGE_KEY = 'novapos_pos_view_mode';
const EVENT_NAME  = 'pos-view-mode-changed';

// Detecta el modo apropiado cuando la preferencia es 'auto'. Usamos
// (pointer:coarse) que en la práctica funciona muy bien para distinguir
// touchscreens (Windows tactil, tablets, monitores de POS) de escritorios
// con mouse. Hacemos fallback a width < 1024 por si el media query no aplica.
function detectAuto(): POSViewResolved {
  if (typeof window === 'undefined') return 'desktop';
  try {
    if (window.matchMedia?.('(pointer: coarse)').matches) return 'touch';
  } catch { /* navegadores muy viejos */ }
  return window.innerWidth < 1024 ? 'touch' : 'desktop';
}

function readPreference(): POSViewPreference {
  if (typeof window === 'undefined') return 'auto';
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'touch' || v === 'desktop' || v === 'auto' ? v : 'auto';
}

/**
 * Hook que devuelve el modo de vista del POS:
 *   - `preference`  → lo elegido por el usuario en Settings (auto/touch/desktop)
 *   - `mode`        → el modo efectivo aplicado tras resolver 'auto'
 *   - `setPreference(p)` → cambia y persiste
 *
 * El cambio se propaga entre tabs y componentes vía un CustomEvent.
 */
export function usePOSViewMode() {
  const [preference, setPreferenceState] = useState<POSViewPreference>(() => readPreference());
  const [autoResolved, setAutoResolved]  = useState<POSViewResolved>(() => detectAuto());

  // Re-resolve si el media query cambia (rotar tablet, conectar mouse, etc.)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(pointer: coarse)');
    const update = () => setAutoResolved(detectAuto());
    mql.addEventListener?.('change', update);
    window.addEventListener('resize', update);
    return () => {
      mql.removeEventListener?.('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  // Escucha cambios desde otros componentes / pestañas.
  useEffect(() => {
    const onSame  = () => setPreferenceState(readPreference());
    const onCross = (e: StorageEvent) => { if (e.key === STORAGE_KEY) setPreferenceState(readPreference()); };
    window.addEventListener(EVENT_NAME, onSame);
    window.addEventListener('storage', onCross);
    return () => {
      window.removeEventListener(EVENT_NAME, onSame);
      window.removeEventListener('storage', onCross);
    };
  }, []);

  const setPreference = useCallback((next: POSViewPreference) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    } catch { /* localStorage bloqueado */ }
  }, []);

  const mode: POSViewResolved = preference === 'auto' ? autoResolved : preference;

  return { preference, mode, setPreference };
}

export default usePOSViewMode;
