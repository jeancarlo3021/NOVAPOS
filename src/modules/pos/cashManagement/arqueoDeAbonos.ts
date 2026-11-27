/**
 * LOS ABONOS EN EL ARQUEO DEL CIERRE.
 *
 * Un cierre se cuadra contra lo que el cajero cuenta. El problema es que no
 * todo lo que el sistema registra es algo que el cajero pueda contar, y no todo
 * lo que puede contar tiene sentido pedírselo.
 *
 *  · Un abono en EFECTIVO son billetes en la gaveta: se cuentan como cualquier
 *    otro billete, y el cajero no tiene que hacer nada especial.
 *  · Un abono por SINPE o por TARJETA ya entró al sistema con su monto y su
 *    medio de pago, puesto por el mismo cajero al recibirlo. Pedirle que lo
 *    vuelva a escribir en el cierre no controla nada —el número ya está, y se
 *    lo dio él— y sí deja la puerta abierta a olvidarlo.
 *
 * Pasó de verdad en un turno: ₡10.600 de ventas por SINPE y dos abonos por
 * SINPE de ₡12.000 y ₡103.200. El cajero anotó las ventas, que es lo que vio
 * pasar por el mostrador, y el cierre salió con ₡116.000 de faltante que nunca
 * existió. Un faltante inventado de ese tamaño es peor que no cuadrar: al día
 * siguiente nadie puede distinguirlo de un robo.
 */
export interface AbonoArqueable {
  method: string;
  amount: number;
}

/** Los abonos de un medio que entran solos, sin teclearlos. */
export function abonosAutomaticos<T extends AbonoArqueable>(abonos: T[], metodo: 'sinpe' | 'card'): T[] {
  return (Array.isArray(abonos) ? abonos : [])
    .filter(a => String(a?.method ?? '') === metodo && Number(a?.amount || 0) > 0);
}

export function sumaDeAbonos(abonos: AbonoArqueable[]): number {
  return (Array.isArray(abonos) ? abonos : [])
    .reduce((t, a) => t + Number(a?.amount || 0), 0);
}

/**
 * EL MISMO ABONO ANOTADO DOS VECES.
 *
 * Si el cajero teclea una transferencia por el monto exacto de un abono que ya
 * entra solo, casi siempre es el abono escrito a mano. Duplicarlo inventa un
 * SOBRANTE, que es igual de difícil de explicar que un faltante.
 *
 * Devuelve los montos sospechosos, no un sí/no: el aviso tiene que decir CUÁL,
 * porque un cierre con ocho transferencias no se revisa a ciegas.
 */
export function abonosDuplicados(
  tecleados: Array<{ amount: string | number }>,
  abonosDelMetodo: AbonoArqueable[],
): number[] {
  const esperados = (Array.isArray(abonosDelMetodo) ? abonosDelMetodo : [])
    .map(a => Math.round(Number(a?.amount || 0)));
  return (Array.isArray(tecleados) ? tecleados : [])
    .map(e => Math.round(parseFloat(String(e?.amount ?? '')) || 0))
    .filter(a => a > 0 && esperados.includes(a));
}

export interface Descuadre {
  label: string;
  sistema: number;
  contado: number;
  /** Positivo = sobra; negativo = falta. */
  diferencia: number;
}

/**
 * LO QUE NO CUADRA Y SÍ SE PUEDE DECIR EN PANTALLA.
 *
 * El EFECTIVO no entra acá a propósito: decirle al cajero cuánto se espera en
 * la gaveta antes de cerrar es decirle cuánto tiene que poner, y ahí se acaba
 * el arqueo. Con SINPE y tarjeta no hay nada que tapar —esa plata nunca pasó
 * por sus manos, ya está en el banco—; lo único que puede haber es un cobro
 * registrado con el medio equivocado, y eso conviene encontrarlo hoy, con el
 * cajero enfrente y el teléfono a mano.
 *
 * El caso «el sistema registra algo y se contó ₡0» se deja afuera porque ya
 * tiene su propio aviso: preguntar dos veces por lo mismo enseña a darle
 * «aceptar» sin leer.
 */
export function descuadresVisibles(
  metodos: Array<{ label: string; sistema: number; contado: number }>,
): Descuadre[] {
  return (Array.isArray(metodos) ? metodos : [])
    .map(m => ({
      label: m.label,
      sistema: Number(m.sistema || 0),
      contado: Number(m.contado || 0),
      diferencia: Math.round(Number(m.contado || 0) - Number(m.sistema || 0)),
    }))
    .filter(m => m.diferencia !== 0 && !(m.sistema > 0 && m.contado <= 0));
}
