/**
 * PLANES DE DEMO: cuáles no son planes de venta.
 *
 * Cada demo que se arma crea su propio plan —«Demo · Ferretería»— con los
 * módulos que pidió el vendedor. Son de usar y tirar: nacen con la demo y mueren
 * con ella. A la fecha ya hay ocho, y crecen con cada prueba que se manda.
 *
 * Mezclados con los planes reales en el selector de «crear negocio», el que da de
 * alta a un cliente tiene que ir esquivando plantillas de demos de otros para
 * encontrar el plan que de verdad le va a cobrar. Elegir una por error es peor:
 * el cliente nuevo queda con los módulos de la demo de otro negocio y con un
 * plan que el limpiador de demos puede borrar.
 *
 * Esta regla ya estaba escrita en dos lados con criterios distintos (la pantalla
 * de Planes y el backend de solicitudes de demo). Acá queda una sola.
 */

/** Plan creado PARA UNA demo puntual: «Demo · Ferretería». */
export function esPlanDeUnaDemo(nombre: unknown): boolean {
  return /^demo\s*[·:.\-]/i.test(String(nombre ?? '').trim());
}

/**
 * Cualquier plan de demostración, incluido el genérico «Demo».
 *
 * Un plan de ₡0 con «demo» en el nombre no se le cobra a nadie: no es algo que
 * se pueda elegir al dar de alta un cliente.
 */
export function esPlanDemo(plan: { name?: unknown; price?: unknown } | null | undefined): boolean {
  const nombre = String(plan?.name ?? '');
  return esPlanDeUnaDemo(nombre) || (Number(plan?.price ?? 0) === 0 && /demo/i.test(nombre));
}

/** Deja solo los planes que se le pueden asignar a un cliente de verdad. */
export function soloPlanesReales<T extends { name?: unknown; price?: unknown }>(planes: T[]): T[] {
  return (Array.isArray(planes) ? planes : []).filter(p => !esPlanDemo(p));
}
