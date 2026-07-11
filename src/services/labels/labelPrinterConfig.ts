// Recuerda qué impresora QZ y qué plantilla usar para etiquetas.
// La impresora es del equipo (no del tenant); la plantilla por defecto sí es por tenant.

const PRINTER_KEY = 'label_printer_name';
const OFFSET_KEY = 'label_printer_offset';   // calibración fina X/Y en mm (por equipo)
const TPL_KEY = (tid: string) => `label_default_template_${tid}`;

export interface LabelOffset { x: number; y: number; }

export const labelPrinterConfig = {
  getPrinter(): string { return localStorage.getItem(PRINTER_KEY) || ''; },
  setPrinter(name: string) { localStorage.setItem(PRINTER_KEY, name); },
  getOffset(): LabelOffset {
    try { const o = JSON.parse(localStorage.getItem(OFFSET_KEY) || '{}'); return { x: Number(o.x) || 0, y: Number(o.y) || 0 }; }
    catch { return { x: 0, y: 0 }; }
  },
  setOffset(o: LabelOffset) { localStorage.setItem(OFFSET_KEY, JSON.stringify({ x: o.x || 0, y: o.y || 0 })); },
  getDefaultTemplate(tid: string): string { return localStorage.getItem(TPL_KEY(tid)) || ''; },
  setDefaultTemplate(tid: string, id: string) { localStorage.setItem(TPL_KEY(tid), id); },
};
