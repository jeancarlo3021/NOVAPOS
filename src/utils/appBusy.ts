/**
 * ¿Hay algo en curso que NO se puede interrumpir?
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * La app se actualiza sola: cuando detecta una versión nueva, borra el caché y
 * recarga. Eso está bien a las 6 de la mañana y es un desastre a las 2 de la
 * tarde: si el cajero tiene una venta armada —quince líneas, el cliente
 * esperando— la recarga se lleva el carrito y hay que empezar de cero. Y pasa
 * justo en el peor momento, porque el chequeo corre cada vez que la pestaña
 * vuelve al frente: o sea, cuando el cajero VUELVE a trabajar.
 *
 * Acá se marca lo que no se puede cortar (una venta armada, un cobro en
 * proceso). Quien quiera recargar pregunta primero, y si hay algo en curso,
 * espera a que termine.
 */

const razones = new Set<string>();
const oyentes = new Set<() => void>();

/** Marca algo en curso. Devuelve la función que lo desmarca. */
export function marcarOcupado(razon: string): () => void {
  razones.add(razon);
  return () => {
    razones.delete(razon);
    if (razones.size === 0) oyentes.forEach(fn => { try { fn(); } catch { /* ignore */ } });
  };
}

/** ¿Se puede interrumpir al usuario ahora mismo? */
export function appOcupada(): boolean {
  return razones.size > 0;
}

/** Avisa cuando ya no queda nada en curso (para aplicar lo que estaba en espera). */
export function alQuedarLibre(fn: () => void): () => void {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
