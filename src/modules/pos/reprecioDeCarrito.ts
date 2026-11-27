/**
 * REPRECIAR EL CARRITO cuando cambia el cliente o el modo de venta.
 *
 * Corre cada vez que cambian los precios del cliente —o sea cada vez que
 * alguien toca el campo del cliente— y cada vez que se entra o sale del modo
 * delivery o se cambia de plataforma. Sirve para que una línea ya puesta tome
 * el precio que le corresponde: si el cajero empezó en Uber y pasa a Didi, las
 * líneas tienen que tomar el precio de Didi.
 *
 * Lo delicado es qué NO se reprecia. Hay líneas cuyo precio lo decidió alguien,
 * no el catálogo:
 *
 *  · la cuenta de una mesa, que ya trae los adicionales adentro;
 *  · la tarifa de envío, que es un monto y no un artículo;
 *  · y la línea que viene de una COTIZACIÓN, que es la que faltaba. El cliente
 *    tiene el papel en la mano con un monto. Al seleccionarlo en el POS —justo
 *    lo que hay que hacer para poder facturarle— las líneas se iban al precio
 *    de lista, porque ese cliente no tiene precio propio para el producto.
 *    Pedir el cliente le subía la cuenta.
 *
 * Esas llegan marcadas con `__precioFijo` y se devuelven tal cual.
 */
export interface LineaReprecio {
  product_id: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  discount_percent?: number;
  promo?: unknown;
  __precioFijo?: boolean;
}

export interface ContextoReprecio {
  /** Precios especiales del cliente, por producto. */
  customerPrices: Record<string, number>;
  /** Precio de lista del producto de la línea (del catálogo). */
  precioDeCatalogo: number;
  /** Precio de la plataforma de delivery, 0 si no aplica. */
  precioDelivery?: number;
  modoDelivery?: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** El precio que le toca a la línea, sin mirar si se puede cambiar o no. */
export function precioQueCorresponde(l: LineaReprecio, ctx: ContextoReprecio): number {
  const dp = Number(ctx.precioDelivery) || 0;
  if (ctx.modoDelivery && dp > 0) return dp;
  const propio = ctx.customerPrices?.[l.product_id];
  if (propio !== undefined && propio !== null) return Number(propio);
  const catalogo = Number(ctx.precioDeCatalogo);
  return Number.isFinite(catalogo) && catalogo > 0 ? catalogo : Number(l.unit_price) || 0;
}

/** ¿Esta línea se puede repreciar? */
export function sePuedeRepreciar(l: LineaReprecio): boolean {
  return !l?.__precioFijo;
}

/**
 * La línea con su precio nuevo, o la misma si no hay nada que cambiar.
 *
 * `calcPromo` lo pasa el POS: la promo de la línea se recalcula con el precio
 * nuevo, porque un 2x1 sobre el precio viejo cobra el descuento equivocado.
 */
export function repreciarLinea(
  l: LineaReprecio,
  ctx: ContextoReprecio,
  calcPromo?: (base: number, cantidad: number, promo: any) => number,
): LineaReprecio {
  if (!sePuedeRepreciar(l)) return l;
  const base = r2(precioQueCorresponde(l, ctx));
  if (base === l.unit_price) return l;
  const subtotal = r2(l.promo && calcPromo
    ? calcPromo(base, l.quantity, l.promo)
    : l.quantity * base * (1 - (Number(l.discount_percent) || 0) / 100));
  return { ...l, unit_price: base, subtotal };
}
