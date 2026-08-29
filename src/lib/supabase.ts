import { createClient } from '@supabase/supabase-js';
import { authStorage } from './authStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// La sesión dura una jornada de trabajo: manda el corte de las 4 a. m. que
// aplica AuthContext, con este tope de 24 h como red de seguridad.
// El access_token se renueva solo (autoRefreshToken); no hay que forzarlo.
export const SESSION_MAX_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: authStorage,
    flowType: 'pkce',
  },
});

// ✅ Cliente con service key (SOLO para operaciones del servidor)
// ⚠️ NUNCA expongas esto al cliente en producción
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

export default supabase;