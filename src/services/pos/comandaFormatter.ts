// ESC/POS formatter for kitchen/bar comanda tickets.
// Comandas show what to prepare — no prices, no totals.

export interface ComandaItem {
  name: string;
  quantity: number;
  notes?: string;
}

export interface ComandaData {
  invoiceNumber: string;
  time: string;        // "HH:MM"
  label: string;       // printer label, e.g. "Cocina", "Barra"
  items: ComandaItem[];
  customerName?: string;
  tableInfo?: string;
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

  // Ticket number + time
  bold(true);
  text(`#${data.invoiceNumber}`); nl();
  bold(false);
  text(data.time); nl();

  // Customer / table
  if (data.customerName || data.tableInfo) {
    sep('-');
    if (data.tableInfo) { text(`Mesa: ${data.tableInfo}`); nl(); }
    if (data.customerName) { text(`Cliente: ${data.customerName}`); nl(); }
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
