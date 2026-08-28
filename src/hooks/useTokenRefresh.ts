/**
 * Hook to automatically refresh Supabase session token
 * Runs periodically to prevent token expiration errors
 */

import { useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

export function useTokenRefresh() {
  const { user } = useAuth();

  const refreshToken = useCallback(async () => {
    if (!user) return;

    try {
      // Check if session is about to expire
      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session) {
        return;
      }

      const expiresAt = sessionData.session.expires_at;
      const now = Math.floor(Date.now() / 1000);
      const secondsUntilExpiry = (expiresAt ?? 0) - now;

      // Solo si de verdad está por vencer y `autoRefreshToken` todavía no actuó.
      //
      // Renovar antes de tiempo no es gratis: cada renovación invalida el token
      // de refresco anterior, y dos renovaciones simultáneas (dos pestañas, la
      // caja y el teléfono) dejan a una con un token muerto y cierran la sesión
      // sin que nadie haya tocado nada.
      if (secondsUntilExpiry < 120) {
        await supabase.auth.refreshSession();
      }
    } catch (err) {
      // Silently ignore errors - token refresh is non-critical
      console.debug('Token refresh check (no crítico):', err);
    }
  }, [user]);

  // Refresh token every 10 minutes (tokens expire in 1 hour)
  // Reduce frequency to avoid unnecessary overhead
  useEffect(() => {
    if (!user) return;

    // Check token on mount after a short delay to let auth settle
    const timeout = setTimeout(() => {
      refreshToken();
    }, 2000);

    const interval = setInterval(refreshToken, 10 * 60 * 1000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [user, refreshToken]);

  return { refreshToken };
}
