import { createClient } from '@supabase/supabase-js';
import { authStorage } from './authStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Session duration: 12 hours guaranteed
// access_token refreshes automatically every ~1h via autoRefreshToken
// refresh_token stays valid up to 12h via SESSION_MAX_DURATION_MS check
export const SESSION_MAX_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

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