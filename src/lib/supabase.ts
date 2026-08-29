import { createClient } from '@supabase/supabase-js';
import { authStorage } from './authStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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

/**
 * NO existe un cliente con llave de servicio en el navegador. A propósito.
 *
 * Acá había uno que se activaba si estaba definida `VITE_SUPABASE_SERVICE_KEY`.
 * Todo lo que empieza con VITE_ se COMPILA DENTRO del paquete que descarga el
 * navegador: cualquiera podía leerla con ver el código fuente de la página, y
 * esa llave saltea toda la seguridad de la base —lee y borra los datos de todos
 * los negocios—. Nadie la usaba; bastaba con que alguien la definiera en el
 * panel de despliegue para regalar la base entera sin enterarse.
 *
 * Lo que necesita esa llave vive en el backend, que sí la guarda en secreto.
 */

export default supabase;