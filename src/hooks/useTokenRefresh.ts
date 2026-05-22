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
        console.warn('⚠️ No hay sesión activa');
        return;
      }

      const expiresAt = sessionData.session.expires_at;
      const now = Math.floor(Date.now() / 1000);
      const secondsUntilExpiry = (expiresAt ?? 0) - now;

      // If token expires in less than 5 minutes, refresh it
      if (secondsUntilExpiry < 300) {
        console.log(`⚠️ Token expira en ${secondsUntilExpiry}s, refrescando...`);

        const { data, error } = await supabase.auth.refreshSession();

        if (error) {
          console.warn('⚠️ Error refrescando token:', error.message);
        } else if (data.session) {
          console.log('✅ Token refrescado exitosamente');
        }
      } else {
        console.log(`✅ Token válido por ${Math.round(secondsUntilExpiry / 60)} minutos`);
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
