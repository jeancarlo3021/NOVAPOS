/**
 * Identificación del usuario en Sentry, SIN traer el SDK a la ruta crítica.
 *
 * `AuthContext` corre en el arranque; si importara `@/lib/sentry` de forma
 * estática, los ~240 kB del SDK volverían al bundle inicial aunque el resto de
 * la app ya lo cargue en segundo plano. Acá se importa solo cuando hace falta,
 * y si falla no pasa nada: el tracking no puede estorbar el login.
 */
export function identifySentryUser(user: {
  id: string;
  email?: string;
  full_name?: string;
  tenant_id?: string;
}) {
  void import('./sentry')
    .then(m => m.identifySentryUser(user))
    .catch(() => { /* sin tracking */ });
}

export function clearSentryUser() {
  void import('./sentry')
    .then(m => m.clearSentryUser())
    .catch(() => { /* sin tracking */ });
}
