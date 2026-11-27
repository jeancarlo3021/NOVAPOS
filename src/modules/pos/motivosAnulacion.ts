/**
 * POR QUÉ SE ANULA UNA VENTA.
 *
 * El motivo se escribía a mano en un campo libre, y un campo libre obligatorio
 * termina lleno de «error», «mal» y «.». Estos seis cubren casi todo lo que de
 * verdad pasa en el mostrador, se eligen de un toque y se pueden editar antes
 * de confirmar.
 *
 * Lo que importa de la lista es `esError`: distingue las dos cosas muy
 * distintas que se llaman igual.
 *
 *  · Fue un ERROR de quien facturó → la venta SÍ existe, el cliente se llevó
 *    la mercadería y pagó. Hay que anular y volver a hacerla bien, o queda
 *    mercadería afuera sin ninguna venta que la respalde y el inventario
 *    empieza a mentir.
 *  · La venta NO va a existir (el cliente se arrepintió, estaba duplicada) →
 *    no hay nada que rehacer, y ofrecerlo invita a facturar de más.
 */
export interface MotivoAnulacion {
  id: string;
  texto: string;
  /** Fue un error al facturar: la venta hay que volver a hacerla bien. */
  esError: boolean;
}

export const MOTIVOS_ANULACION: MotivoAnulacion[] = [
  { id: 'digitacion', texto: 'Error al digitar la venta',                 esError: true },
  { id: 'producto',   texto: 'Se facturó el producto equivocado',         esError: true },
  { id: 'precio',     texto: 'Precio o descuento equivocado',             esError: true },
  { id: 'pago',       texto: 'Se cobró con el medio de pago equivocado',  esError: true },
  { id: 'duplicada',  texto: 'La venta se facturó dos veces',             esError: false },
  { id: 'arrepintio', texto: 'El cliente se arrepintió o devolvió todo',  esError: false },
];

/**
 * ¿El motivo escrito es un ERROR al facturar?
 *
 * Se resuelve por el texto y no por el botón elegido, porque el motivo se
 * puede editar a mano después de elegirlo: lo que vale es lo que quedó
 * escrito, que es lo que se guarda.
 */
export function esMotivoDeError(texto: string): boolean {
  const t = String(texto ?? '').trim().toLowerCase();
  if (!t) return false;
  const exacto = MOTIVOS_ANULACION.find(m => m.texto.toLowerCase() === t);
  if (exacto) return exacto.esError;
  /* Escrito a mano: se buscan las palabras con las que la gente describe un
     error de facturación. No alcanza con «error» solo —«error del cliente» no
     es uno—, pero es una sugerencia marcada, no una decisión: el cajero
     siempre puede destildar «rehacer». */
  if (/duplicad|dos veces|arrepint|devolv|cancel[óo] el pedido/.test(t)) return false;
  return /error|equivocad|me equivoqu|por error|mal digit|digit\w*\s+mal/.test(t);
}

/** El motivo que se guarda si el campo queda vacío. */
export const MOTIVO_POR_OMISION = 'Anulación por error en facturación';
