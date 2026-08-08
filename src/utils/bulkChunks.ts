/**
 * Carga masiva por lotes.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * Tanto la importación por Excel como la conciliación de un XML de proveedor
 * creaban TODOS los productos dentro de una sola llamada HTTP, y cada producto
 * es una ida y vuelta a la base. Con 20 líneas no se nota; con 250 la petición
 * pasa del minuto y el proxy la corta antes de que el servidor conteste. El
 * cliente ve «error» aunque la mitad de los productos ya se habían creado —lo
 * peor de los dos mundos: falla y además deja basura a medias—.
 *
 * La solución no es subir el tiempo de espera (siempre va a haber un archivo más
 * grande), sino partir el trabajo: muchas peticiones cortas en vez de una
 * eterna. Cada lote termina en segundos, se puede mostrar avance real, y si uno
 * falla se sabe exactamente cuál.
 *
 * 50 es un tamaño deliberado: suficiente para que 250 productos sean 5 viajes y
 * no 250, y suficientemente chico para que un lote nunca se acerque al límite
 * de tiempo del servidor.
 */

/** Tamaño de lote para cualquier carga masiva de productos. */
export const BULK_CHUNK_SIZE = 50;

/** Parte un arreglo en lotes de `size`. El último puede venir incompleto. */
export function chunked<T>(items: T[], size: number = BULK_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Corre `worker` sobre cada elemento con un tope de tareas simultáneas.
 *
 * Se usa dentro de un lote cuando no hay un endpoint que reciba varias filas de
 * una: en vez de 50 esperas encadenadas, van 5 a la vez. No se lanzan las 50 de
 * golpe a propósito —el navegador solo abre ~6 conexiones por dominio, así que
 * el resto haría cola igual, y de paso se evita el pico de carga en el servidor.
 *
 * Nunca lanza excepción: cada elemento devuelve `{ ok }` o `{ error }`, porque
 * en una importación una fila mala no debe abortar las otras 249.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  opts: { concurrency?: number; onProgress?: (done: number) => void } = {},
): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>> {
  const limit = Math.max(1, opts.concurrency ?? 5);
  const results = new Array<{ ok: true; value: R } | { ok: false; error: unknown }>(items.length);
  let next = 0;
  let done = 0;

  const runner = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { ok: true, value: await worker(items[i], i) };
      } catch (error) {
        results[i] = { ok: false, error };
      }
      opts.onProgress?.(++done);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}
