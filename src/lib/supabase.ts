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

/**
 * El MOTIVO REAL de una Edge Function que respondió con error.
 *
 * `supabase.functions.invoke` tira un `FunctionsHttpError` cuyo mensaje es
 * siempre el mismo: «Edge Function returned a non-2xx status code». El motivo
 * de verdad viaja en el CUERPO de la respuesta —nuestras funciones responden
 * `{ error: "Auth error: A user with this email..." }`— y queda dentro de
 * `error.context`, que es la `Response` sin leer. Si nadie la abre, el que está
 * del otro lado ve una frase en inglés que no dice nada y no tiene forma de
 * saber si el correo ya existía, si faltó un campo o si se cayó la base.
 *
 * Devuelve el motivo en claro y, cuando lo reconoce, traducido.
 */
export const motivoDeFuncion = async (error: unknown): Promise<string> => {
  const err = error as any;
  const generico = typeof err?.message === 'string' ? err.message : 'Falló la función';
  let crudo = '';
  let estado: number | undefined;

  const res: Response | undefined = err?.context instanceof Response ? err.context : undefined;
  if (res) {
    estado = res.status;
    try {
      // `context` se puede leer una sola vez: se clona para no quemarla.
      const texto = await res.clone().text();
      try {
        const j = JSON.parse(texto);
        crudo = String(j?.error ?? j?.message ?? j?.msg ?? texto ?? '');
      } catch { crudo = texto; }
    } catch { /* el cuerpo ya se consumió o no se pudo leer */ }
  }

  const limpio = crudo.trim();
  const low = limpio.toLowerCase();

  // Los motivos que de verdad se repiten, dichos en español.
  if (low.includes('already been registered') || low.includes('already exists') || (low.includes('duplicate key') && low.includes('email')))
    return 'Ese correo ya tiene una cuenta. Usá otro correo, o buscá el negocio en la lista.';
  if (low.includes('password') && (low.includes('short') || low.includes('6 characters')))
    return 'La contraseña es muy corta: tiene que tener al menos 6 caracteres.';
  if (low.includes('invalid email') || low.includes('unable to validate email'))
    return 'El correo no es válido.';
  if (low.includes('no autorizado') || low.includes('bearer token') || low.includes('jwt')
    || low.includes('auth check error') || low.includes('session') || estado === 401)
    return 'Tu sesión venció. Volvé a entrar y probá de nuevo.';
  if (estado === 404)
    return 'La función no está publicada en Supabase (404). Hay que desplegarla.';
  if (estado === 546 || low.includes('worker_limit') || low.includes('memory limit'))
    return 'La función se quedó sin recursos a mitad del trabajo. Probá otra vez.';

  if (limpio) return limpio;
  return estado ? `${generico} (HTTP ${estado})` : generico;
};

export default supabase;