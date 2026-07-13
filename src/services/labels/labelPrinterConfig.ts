// Recuerda qué impresora QZ y qué plantilla usar para etiquetas.
// La impresora es del equipo (no del tenant); la plantilla por defecto sí es por tenant.

const PRINTER_KEY = 'label_printer_name';
const OFFSET_KEY = 'label_printer_offset';   // calibración fina X/Y en mm (por equipo)
const MODE_KEY = 'label_printer_mode';       // 'html' (driver) | 'tspl' (crudo, exacto)
const GAP_KEY = 'label_printer_gap_mm';      // gap entre etiquetas (mm) para modo TSPL
const TPL_KEY = (tid: string) => `label_default_template_${tid}`;

export type LabelPrintMode = 'html' | 'tspl';
export interface LabelOffset { x: number; y: number; }

export const labelPrinterConfig = {
  getPrinter(): string { return localStorage.getItem(PRINTER_KEY) || ''; },
  setPrinter(name: string) { localStorage.setItem(PRINTER_KEY, name); },
  getMode(): LabelPrintMode { return localStorage.getItem(MODE_KEY) === 'tspl' ? 'tspl' : 'html'; },
  setMode(m: LabelPrintMode) { localStorage.setItem(MODE_KEY, m); },
  getGapMm(): number { const v = Number(localStorage.getItem(GAP_KEY)); return Number.isFinite(v) && v > 0 ? v : 2; },
  setGapMm(mm: number) { localStorage.setItem(GAP_KEY, String(mm > 0 ? mm : 2)); },
  getOffset(): LabelOffset {
    try { const o = JSON.parse(localStorage.getItem(OFFSET_KEY) || '{}'); return { x: Number(o.x) || 0, y: Number(o.y) || 0 }; }
    catch { return { x: 0, y: 0 }; }
  },
  setOffset(o: LabelOffset) { localStorage.setItem(OFFSET_KEY, JSON.stringify({ x: o.x || 0, y: o.y || 0 })); },
  getDefaultTemplate(tid: string): string { return localStorage.getItem(TPL_KEY(tid)) || ''; },
  setDefaultTemplate(tid: string, id: string) { localStorage.setItem(TPL_KEY(tid), id); },
};
