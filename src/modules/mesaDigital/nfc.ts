/**
 * GRABAR LAS ETIQUETAS NFC DE LAS MESAS, desde el mismo teléfono.
 *
 * La etiqueta NFC es la alternativa al QR: el cliente apoya el teléfono en la
 * calcomanía de la mesa y se le abre la pantalla, sin apuntar la cámara ni
 * enfocar en un salón a media luz. La contra es que escribirla necesita una
 * app aparte… salvo que el navegador lo permita, que es lo que usa esto.
 *
 * Web NFC solo existe en Chrome sobre Android y solo en páginas seguras
 * (https). En iPhone el sistema LEE etiquetas pero no deja escribirlas desde el
 * navegador: ahí el camino es copiar el enlace y grabarlo con una app.
 */

export type SoporteNfc = 'si' | 'sin-api' | 'sin-https';

export function soporteNfc(): SoporteNfc {
  if (typeof window === 'undefined') return 'sin-api';
  const seguro = window.isSecureContext || /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  if (!seguro) return 'sin-https';
  return 'NDEFReader' in window ? 'si' : 'sin-api';
}

/** El motivo, dicho para quien está parado frente a la mesa con la calcomanía. */
export function motivoNfc(e: unknown): string {
  const m = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  const low = m.toLowerCase();
  if (low.includes('notallowed') || low.includes('permission'))
    return 'El teléfono no dio permiso para usar el NFC. Habilitalo en los ajustes de Chrome y probá otra vez.';
  if (low.includes('notsupported'))
    return 'Este teléfono no puede escribir etiquetas desde el navegador.';
  if (low.includes('notreadable') || low.includes('io error') || low.includes('transfer'))
    return 'Se despegó antes de terminar. Dejá la etiqueta quieta sobre el teléfono hasta que avise.';
  if (low.includes('abort'))
    return 'Se canceló.';
  if (low.includes('network') || low.includes('nomodification') || low.includes('read-only'))
    return 'Esa etiqueta está bloqueada y ya no se puede volver a grabar. Usá una nueva.';
  if (low.includes('quota') || low.includes('too large') || low.includes('size'))
    return 'El enlace no cabe en esa etiqueta. Usá una NTAG213 o mayor.';
  return m;
}

export interface Grabado {
  /** Deja la etiqueta de SOLO LECTURA: nadie la puede reescribir nunca más. */
  bloquear?: boolean;
  /** Para poder cancelar la espera (el usuario cerró la ventana). */
  signal?: AbortSignal;
}

/**
 * Escribe una dirección en la etiqueta que se apoye en el teléfono.
 *
 * Queda esperando hasta que alguien acerque una etiqueta: es lo que permite
 * grabar veinte seguidas sin tocar la pantalla entre una y otra.
 */
export async function grabarEtiqueta(url: string, opciones: Grabado = {}): Promise<void> {
  const Reader = (window as any).NDEFReader;
  if (!Reader) throw new Error('NotSupportedError: este navegador no escribe NFC');
  const ndef = new Reader();
  await ndef.write({ records: [{ recordType: 'url', data: url }] }, { signal: opciones.signal });
  if (opciones.bloquear) {
    // Bloquear es IRREVERSIBLE; va aparte para que un fallo acá no se confunda
    // con «no se grabó»: a esta altura la etiqueta YA quedó escrita.
    try { await ndef.makeReadOnly({ signal: opciones.signal }); }
    catch (e) { throw new Error(`GRABADA_SIN_BLOQUEAR: ${motivoNfc(e)}`); }
  }
}
