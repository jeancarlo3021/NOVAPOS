import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export const useSupabase = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Obtener usuario actual
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription?.unsubscribe();
  }, []);

  return { user, loading, supabase };
};
