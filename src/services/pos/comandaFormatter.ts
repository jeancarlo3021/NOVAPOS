// ESC/POS formatter for kitchen/bar comanda tickets.
// Comandas show what to prepare — no prices, no totals.

export interface ComandaItem {
  name: string;
  quantity: number;
  notes?: string;
  category_id?: string;   // para rutear a la impresora de su estación
  /**
   * Estación de cocina de la RECETA del plato ("Cocina", "Barra", "Parrilla").
   *
   * Manda sobre la categoría cuando existe: la categoría es de venta (Bebidas,
   * Platos fuertes) y la estación es de producción, y no siempre coinciden — un
   * postre y un café son categorías distintas que salen de la misma barra.
   */
  station?: string;
}

export interface ComandaData {
  invoiceNumber: string;
  time: string;        // "HH:MM"
  label: string;       // printer label, e.g. "Cocina", "Barra"
  items: ComandaItem[];
  customerName?: string;
  /** SALÓN: mesa en la que se sirve. */
  tableInfo?: string;
  /** VENTANITA: número de orden que se le canta al cliente. */
  orderNumber?: number | string;
  /** VENTANITA: bipper que se le prestó. */
  bipper?: string;
  /**
   * Cómo se entrega. En cocina cambia el trabajo: para llevar se empaca, para
   * acá se monta en plato. Va grande porque es lo que más se equivoca cuando
   * hay prisa.
   */
  serviceMode?: 'aca' | 'llevar' | 'mesa';
}

// ── ESC/POS byte builder ──────────────────────────────────────────────────────

export function formatComanda(data: ComandaData, charWidth = 42): Uint8Array {
  const cmds: number[] = [];
  const enc = new TextEncoder();

  const push  = (...bytes: number[]) => cmds.push(...bytes);
  const text  = (s: string) => cmds.push(...enc.encode(stripAccents(s)));
  const nl    = () => push(0x0a);
  const sep   = (char = '=') => { text(char.repeat(charWidth)); nl(); };
  const bold  = (on: boolean) => push(0x1b, 0x45, on ? 1 : 0);
  const align = (a: 'left' | 'center' | 'right') =>
    push(0x1b, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2);
  const doubleSize = (on: boolean) =>
    push(0x1d, 0x21, on ? 0x11 : 0x00); // double width + height

  // ── Init ──
  push(0x1b, 0x40); // ESC @ reset
  push(0x1b, 0x74, 0x00); // CP437 charset

  // ── Header ──
  sep('=');
  align('center');
  bold(true);
  doubleSize(true);
  text(data.label.toUpperCase()); nl();
  doubleSize(false);
  bold(false);

  // ── Identificador GRANDE ──
  // Lo primero que busca cocina al levantar el papel. En la ventanita es el
  // bipper o el número de orden; en el salón, la mesa. El consecutivo de la
  // factura no le sirve a nadie en la cocina, así que va chico y de respaldo.
  const bigId = data.bipper
    ? `BIPPER ${data.bipper}`
    : data.orderNumber != null
      ? `ORDEN ${data.orderNumber}`
      : data.tableInfo
        ? `MESA ${data.tableInfo}`
        : '';
  if (bigId) {
    bold(true);
    doubleSize(true);
    text(bigId); nl();
    doubleSize(false);
    bold(false);
  }

  // Modo de entrega, en grande: para llevar se empaca y para acá se monta en
  // plato. Es lo que más se equivoca cuando hay prisa.
  if (data.serviceMode === 'llevar' || data.serviceMode === 'aca') {
    bold(true);
    doubleSize(true);
    text(data.serviceMode === 'llevar' ? '** PARA LLEVAR **' : 'COMER ACA'); nl();
    doubleSize(false);
    bold(false);
  }

  text(`#${data.invoiceNumber}  ${data.time}`); nl();

  if (data.customerName) {
    sep('-');
    text(`Cliente: ${data.customerName}`); nl();
  }

  sep('=');

  // ── Items ──
  for (const item of data.items) {
    // Quantity badge + name in large text
    align('left');
    bold(true);
    doubleSize(true);
    const qtyStr = `${item.quantity}x `;
    const nameStr = item.name.substring(0, charWidth - qtyStr.length);
    text(qtyStr + nameStr); nl();
    doubleSize(false);
    bold(false);

    // Notes
    if (item.notes?.trim()) {
      text(`  * ${item.notes.trim()}`); nl();
    }
  }

  sep('=');

  // Feed & cut
  push(0x0a, 0x0a, 0x0a);
  push(0x1d, 0x56, 0x42, 0x00); // GS V B 0 — partial cut

  return new Uint8Array(cmds);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Basic accent stripping for thermal printers that use CP437 encoding.
// Full unicode may not render on older thermal heads.
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
