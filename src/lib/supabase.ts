import { createClient } from '@supabase/supabase-js';
import { authStorage } from './authStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Uses sessionStorage via authStorage so each browser tab is isolated.
// "Remember Me" mode additionally mirrors tokens to localStorage so new
// tabs can restore the session automatically.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: authStorage,
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