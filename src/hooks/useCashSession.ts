import { useState, useEffect, useCallback } from 'react';
import { CashSession } from '@/types/Types_POS';
import { apiFetch } from '@/lib/api';
import { useTenant } from './useTenant';
import { posOfflineService } from '@/services/pos/posOfflineService';

/**
 * "No abrir caja" (Configuración → Pagos).
 *
 * Hay negocios que no llevan control de efectivo: no cuentan fondo ni hacen
 * arqueo, y la pantalla de apertura solo les estorba. Con la opción activada el
 * sistema abre la sesión SOLO si no hay ninguna, en silencio y con fondo ₡0.
 *
 * Se abre una sesión real (no se vende "sin caja") a propósito: así facturas,
 * movimientos, cierre y reportes siguen funcionando igual, y el negocio que
 * después quiera arquear puede hacerlo sin migrar nada.
 */
const AUTO_OPEN_KEY = 'pos_auto_open_session';
let autoOpening: Promise<any> | null = null;

/** Lee la opción del servidor y la deja en localStorage para el arranque
 *  siguiente y para offline (donde no se puede consultar). */
async function shouldAutoOpen(): Promise<boolean> {
  const cached = localStorage.getItem(AUTO_OPEN_KEY) === '1';
  if (!navigator.onLine) return cached;
  try {
    const cfg = await apiFetch<any>('/settings/payments');
    const on = cfg?.skipCashSession === true;
    localStorage.setItem(AUTO_OPEN_KEY, on ? '1' : '0');
    return on;
  } catch { return cached; }
}

export function useCashSession() {
  const { tenantId } = useTenant();
  const [currentSession, setCurrentSession] = useState<CashSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const loadOpenSession = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // 1. Try API when online
    if (navigator.onLine) {
      try {
        let session = await apiFetch<CashSession | null>('/cash-sessions/active');

        // Sin sesión abierta y el negocio no lleva control de caja: se abre sola.
        if (!session && await shouldAutoOpen()) {
          try {
            // Una sola apertura aunque varios componentes usen el hook a la vez:
            // dos POST simultáneos dejarían dos sesiones abiertas.
            autoOpening ??= apiFetch<CashSession>('/cash-sessions', {
              method: 'POST',
              body: JSON.stringify({
                opening_amount: 0,
                notes: 'Apertura automática (sin control de caja)',
              }),
            });
            session = await autoOpening;
          } catch (e) {
            // 409 = otro dispositivo la abrió primero: se toma la que ya existe.
            console.warn('[useCashSession] No se pudo abrir la caja automáticamente', e);
            session = await apiFetch<CashSession | null>('/cash-sessions/active').catch(() => null);
          } finally { autoOpening = null; }
        }

        setCurrentSession(session);
        setFromCache(false);
        setError(null);

        // Cache for offline use
        if (session) {
          posOfflineService.cacheSession(session);
        }
        setLoading(false);
        return;
      } catch (err) {
      }
    }

    // 2. Fallback: cached session
    console.log('[useCashSession] Cargando desde cache (offline o API falló)...');
    const cached = posOfflineService.getCachedSession();
    setCurrentSession(cached);
    setFromCache(true);
    setError(null);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadOpenSession();
  }, [loadOpenSession]);

  return {
    currentSession,
    loading,
    error,
    fromCache,
    refetchSession: loadOpenSession,
  };
}
