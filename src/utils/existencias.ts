/**
 * Existencias DISPONIBLES para vender.
 *
 * Un producto puede estar físicamente en la bodega y aun así no poder venderse:
 * si un cliente lo apartó, la mercadería tiene su nombre encima. Restarlo del
 * stock haría mentir al inventario —el producto está ahí— así que se lleva
 * aparte, en `reserved_quantity`, y lo vendible es la resta de ambos.
 */
export function disponibleDe(producto: any): number {
  const stock = Number(producto?.stock_quantity ?? 0);
  const apartado = Number(producto?.reserved_quantity ?? 0);
  return Math.max(0, stock - (Number.isFinite(apartado) ? apartado : 0));
}

/** ¿Cuánto de este producto está apartado por clientes? */
export function apartadoDe(producto: any): number {
  const v = Number(producto?.reserved_quantity ?? 0);
  return Number.isFinite(v) && v > 0 ? v : 0;
}
