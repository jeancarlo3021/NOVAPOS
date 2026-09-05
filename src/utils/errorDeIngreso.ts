/**
 * Traduce los fallos de ingreso a algo accionable.
 *
 * Supabase contesta en inglés y con textos pensados para quien programa
 * («Invalid login credentials», «Failed to fetch»). En la pantalla de un
 * comercio eso no dice qué hacer: el cajero no sabe si escribió mal el usuario,
 * si se le acabaron los datos del celular o si el sistema está caído — y termina
 * llamando al soporte por las tres cosas.
 *
 * Cada mensaje dice QUÉ pasó y QUÉ hacer, en ese orden.
 */
export interface ErrorDeIngreso {
  mensaje: string;
  /** `credenciales` deja el foco en la contraseña; `red` invita a reintentar. */
  tipo: 'credenciales' | 'red' | 'bloqueado' | 'cuenta' | 'servidor';
}

/** ¿El usuario escribió un correo o un nombre de usuario interno? */
function esCorreo(entrada: string): boolean {
  return String(entrada ?? '').includes('@');
}

export function traducirErrorDeIngreso(err: any, entrada = ''): ErrorDeIngreso {
  const crudo = String(err?.message ?? err ?? '').trim();
  const texto = crudo.toLowerCase();
  const conCorreo = esCorreo(entrada);
  const como = conCorreo ? 'el correo' : 'el usuario';

  // Sin internet. Se mira el estado del navegador ANTES que el texto: cuando no
  // hay red, el mensaje de la librería es genérico y confunde con un fallo real.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      tipo: 'red',
      mensaje: 'Sin conexión a internet. Revisá el wifi o los datos del celular y volvé a intentar.',
    };
  }
  if (/failed to fetch|networkerror|network request failed|load failed|ecconnrefused|err_internet/i.test(texto)) {
    return {
      tipo: 'red',
      mensaje: 'No se pudo conectar con el servidor. Puede ser tu conexión: revisala y volvé a intentar.',
    };
  }
  if (/timeout|tiempo de espera|aborted/i.test(texto)) {
    return {
      tipo: 'red',
      mensaje: 'El servidor está tardando en responder. Esperá unos segundos y volvé a intentar.',
    };
  }

  // Demasiados intentos: Supabase bloquea por un rato. Decirlo evita que el
  // usuario siga probando y alargue el bloqueo.
  if (/too many requests|rate limit|for security purposes/i.test(texto)) {
    return {
      tipo: 'bloqueado',
      mensaje: 'Demasiados intentos seguidos. Esperá un minuto antes de volver a probar.',
    };
  }

  // Credenciales. Supabase NO distingue usuario inexistente de contraseña mala
  // —lo hace a propósito, para que nadie averigüe qué cuentas existen—, así que
  // el mensaje cubre las dos y sugiere qué revisar primero.
  if (/invalid login credentials|invalid credentials|invalid email or password/i.test(texto)) {
    return {
      tipo: 'credenciales',
      mensaje: conCorreo
        ? 'Correo o contraseña incorrectos. Revisá que el correo esté bien escrito y que no tenga espacios.'
        : 'Usuario o contraseña incorrectos. Ojo con las mayúsculas: la contraseña las distingue.',
    };
  }
  if (/email not confirmed|not confirmed/i.test(texto)) {
    return {
      tipo: 'cuenta',
      mensaje: `Esta cuenta todavía no está confirmada. Escribinos para activarla.`,
    };
  }
  if (/user not found|no user data|user not found in database/i.test(texto)) {
    return {
      tipo: 'cuenta',
      mensaje: `${como.charAt(0).toUpperCase()}${como.slice(1)} existe, pero no está vinculado a ningún negocio. Escribinos para conectarlo.`,
    };
  }
  if (/user is banned|banned|disabled/i.test(texto)) {
    return {
      tipo: 'cuenta',
      mensaje: 'Esta cuenta está desactivada. Escribinos para reactivarla.',
    };
  }

  // Fallo del servidor: no es culpa de lo que escribió, y reintentar sirve.
  if (/^5\d\d/.test(crudo) || /internal server error|service unavailable|bad gateway/i.test(texto)) {
    return {
      tipo: 'servidor',
      mensaje: 'El sistema no está respondiendo en este momento. Probá de nuevo en un minuto.',
    };
  }

  // Desconocido: se muestra el texto original en vez de esconderlo, porque es lo
  // único que le sirve a quien tenga que ayudar.
  return {
    tipo: 'servidor',
    mensaje: crudo ? `No se pudo iniciar sesión: ${crudo}` : 'No se pudo iniciar sesión. Probá de nuevo.',
  };
}
