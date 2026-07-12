// Plantillas de etiquetas de producto. Por ahora se guardan en localStorage por
// tenant (rápido, para iterar el diseño); luego se puede mover al backend.

export type LabelElementType = 'product_name' | 'price' | 'barcode' | 'qr' | 'sku' | 'text' | 'image';

export interface LabelElement {
  id: string;
  type: LabelElementType;
  x: number;              // px dentro del canvas (a la escala de diseño)
  y: number;
  fontSize?: number;      // px (no aplica a barcode)
  fontFamily?: string;    // familia CSS (system o Google Fonts)
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  value?: string;         // solo para 'text'
  width?: number;         // ancho (px) — para barcode / imagen
  height?: number;        // alto (px) — para barcode / imagen
  border?: boolean;       // borde alrededor del elemento
  src?: string;           // dataURL (base64) — para 'image'
  codeSource?: 'sku' | 'sku2';  // barcode/qr: cuál código usar (SKU 1 o SKU 2)
  rotation?: number;      // grados 0/90/180/270 (para etiquetas altas)
}

export interface LabelTemplate {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
  border?: boolean;       // borde alrededor de toda la etiqueta
  updatedAt: string;
}

// Presets de tamaño comunes de rotuladoras (ancho × alto en mm).
export const LABEL_SIZE_PRESETS: { label: string; w: number; h: number }[] = [
  { label: '40 × 30 mm', w: 40, h: 30 },
  { label: '50 × 25 mm', w: 50, h: 25 },
  { label: '58 × 40 mm', w: 58, h: 40 },
  { label: '40 × 20 mm', w: 40, h: 20 },
  { label: '32 × 25 mm', w: 32, h: 25 },
];

// Escala de diseño: px por mm en el canvas del editor.
export const DESIGN_SCALE = 6;

const KEY = (tid: string) => `label_templates_${tid}`;
const uid = () => Math.random().toString(36).slice(2, 10);

export const labelTemplatesService = {
  list(tenantId: string): LabelTemplate[] {
    try { return JSON.parse(localStorage.getItem(KEY(tenantId)) || '[]'); } catch { return []; }
  },
  get(tenantId: string, id: string): LabelTemplate | null {
    return this.list(tenantId).find(t => t.id === id) ?? null;
  },
  save(tenantId: string, tpl: LabelTemplate): LabelTemplate {
    const list = this.list(tenantId);
    const next = { ...tpl, updatedAt: new Date().toISOString() };
    const i = list.findIndex(t => t.id === tpl.id);
    if (i >= 0) list[i] = next; else list.unshift(next);
    localStorage.setItem(KEY(tenantId), JSON.stringify(list));
    return next;
  },
  create(tenantId: string, name: string, widthMm: number, heightMm: number): LabelTemplate {
    // Plantilla inicial con nombre, precio y código de barras ya colocados.
    const tpl: LabelTemplate = {
      id: uid(), name, widthMm, heightMm, updatedAt: new Date().toISOString(),
      elements: [
        { id: uid(), type: 'product_name', x: 6, y: 6, fontSize: 13, bold: true, align: 'left' },
        { id: uid(), type: 'price', x: 6, y: Math.round(heightMm * DESIGN_SCALE * 0.55), fontSize: 20, bold: true, align: 'left' },
        { id: uid(), type: 'barcode', x: 6, y: Math.round(heightMm * DESIGN_SCALE * 0.35), width: Math.round(widthMm * DESIGN_SCALE * 0.7), height: 26 },
      ],
    };
    return this.save(tenantId, tpl);
  },
  remove(tenantId: string, id: string) {
    localStorage.setItem(KEY(tenantId), JSON.stringify(this.list(tenantId).filter(t => t.id !== id)));
  },
};
