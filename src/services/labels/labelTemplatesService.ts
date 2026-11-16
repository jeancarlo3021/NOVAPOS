/**
 * PLANTILLAS DE ETIQUETAS — guardadas en la BASE, no en el navegador.
 *
 * Vivían en el localStorage del equipo, y eso le costaba al negocio: la
 * plantilla existía en UNA computadora —la del mostrador no la veía—, y se
 * borraba con el caché del navegador, en una sesión privada o cuando alguien
 * «limpiaba» la máquina. Diseñar una etiqueta de 40×30 con su código de barras
 * bien puesto toma media hora.
 *
 * ── Lo que había en cada equipo NO se tira ───────────────────────────────
 * La primera vez que se abren las etiquetas, si el negocio no tiene plantillas
 * en la base y este equipo sí tiene en localStorage, se SUBEN. Si se cambiara
 * de golpe, el negocio abriría la pantalla y encontraría sus plantillas
 * borradas, que es exactamente el problema que se está arreglando.
 *
 * ── Y el equipo sigue teniendo una copia ─────────────────────────────────
 * Lo que viene del servidor se guarda también en localStorage: una rotuladora
 * en una bodega sin señal tiene que poder imprimir igual. La base es la verdad;
 * la copia local es para seguir trabajando sin internet.
 */
import { apiFetch } from '@/lib/api';

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
  maxLines?: number;      // texto: máximo de líneas (product_name = 2 por defecto)
  autoFit?: boolean;      // texto: achica la fuente para caber en el ancho/líneas
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

/** La copia local (lo que permite imprimir sin señal). */
const leerLocal = (tenantId: string): LabelTemplate[] => {
  try { return JSON.parse(localStorage.getItem(KEY(tenantId)) || '[]'); } catch { return []; }
};
const escribirLocal = (tenantId: string, list: LabelTemplate[]) => {
  try { localStorage.setItem(KEY(tenantId), JSON.stringify(list)); } catch { /* modo privado o lleno */ }
};

/** Al servidor van en milímetros y snake_case; de vuelta ya vienen en camel. */
const aCuerpo = (t: Partial<LabelTemplate>) => ({
  ...(t.name !== undefined ? { name: t.name } : {}),
  ...(t.widthMm !== undefined ? { width_mm: t.widthMm } : {}),
  ...(t.heightMm !== undefined ? { height_mm: t.heightMm } : {}),
  ...(t.border !== undefined ? { border: !!t.border } : {}),
  ...(t.elements !== undefined ? { elements: t.elements } : {}),
});

/** Para no subir dos veces lo que había en este equipo. */
const LLAVE_SUBIDO = (tid: string) => `label_templates_subidas_${tid}`;

export const labelTemplatesService = {
  /**
   * Las plantillas del NEGOCIO.
   *
   * Sin conexión —o si el servidor contesta mal— devuelve la copia de este
   * equipo: quedarse sin poder imprimir una etiqueta porque se cayó internet
   * no es aceptable en un mostrador.
   */
  async list(tenantId: string): Promise<LabelTemplate[]> {
    try {
      const delServidor = await apiFetch<LabelTemplate[]>('/label-templates');
      const lista = Array.isArray(delServidor) ? delServidor : [];

      /* LO QUE HABÍA EN ESTE EQUIPO SE SUBE, una sola vez. Si el negocio no
         tiene ninguna arriba y acá hay, son las de siempre: subirlas es lo que
         evita que el dueño abra la pantalla y las vea desaparecidas. */
      if (lista.length === 0) {
        let yaSubido = false;
        try { yaSubido = localStorage.getItem(LLAVE_SUBIDO(tenantId)) === '1'; } catch { /* da igual */ }
        const locales = leerLocal(tenantId);
        if (!yaSubido && locales.length > 0) {
          const subidas: LabelTemplate[] = [];
          for (const t of locales) {
            try { subidas.push(await apiFetch<LabelTemplate>('/label-templates', {
              method: 'POST', body: JSON.stringify(aCuerpo(t)),
            })); } catch { /* si una falla, se intenta de nuevo la próxima vez */ }
          }
          if (subidas.length === locales.length) {
            try { localStorage.setItem(LLAVE_SUBIDO(tenantId), '1'); } catch { /* da igual */ }
          }
          if (subidas.length > 0) { escribirLocal(tenantId, subidas); return subidas; }
          /* No se pudo subir ninguna: se siguen usando las locales en vez de
             mostrar la pantalla vacía. */
          return locales;
        }
      }

      escribirLocal(tenantId, lista);
      return lista;
    } catch {
      return leerLocal(tenantId);
    }
  },

  async get(tenantId: string, id: string): Promise<LabelTemplate | null> {
    const local = leerLocal(tenantId).find(t => t.id === id) ?? null;
    try { return await apiFetch<LabelTemplate>(`/label-templates/${id}`); }
    catch { return local; }
  },

  /** Guarda el diseño. Devuelve la plantilla como quedó en la base. */
  async save(tenantId: string, tpl: LabelTemplate): Promise<LabelTemplate> {
    /* `id` corto = plantilla que nació en localStorage y nunca se subió: va
       como nueva. Los ids de la base son UUID. */
    const esDeLaBase = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tpl.id);
    const guardada = esDeLaBase
      ? await apiFetch<LabelTemplate>(`/label-templates/${tpl.id}`, {
          method: 'PUT', body: JSON.stringify(aCuerpo(tpl)) })
      : await apiFetch<LabelTemplate>('/label-templates', {
          method: 'POST', body: JSON.stringify(aCuerpo(tpl)) });

    const list = leerLocal(tenantId).filter(t => t.id !== tpl.id && t.id !== guardada.id);
    escribirLocal(tenantId, [guardada, ...list]);
    return guardada;
  },

  async create(tenantId: string, name: string, widthMm: number, heightMm: number): Promise<LabelTemplate> {
    // Plantilla inicial con nombre, precio y código de barras ya colocados.
    const tpl: LabelTemplate = {
      id: uid(), name, widthMm, heightMm, updatedAt: new Date().toISOString(),
      elements: [
        // Nombre en 2 líneas, auto-ajuste de tamaño y centrado (por defecto).
        { id: uid(), type: 'product_name', x: 6, y: 6, fontSize: 13, bold: true, align: 'center',
          width: Math.round(widthMm * DESIGN_SCALE - 12), maxLines: 2, autoFit: true },
        { id: uid(), type: 'price', x: 6, y: Math.round(heightMm * DESIGN_SCALE * 0.55), fontSize: 20, bold: true, align: 'left' },
        { id: uid(), type: 'barcode', x: 6, y: Math.round(heightMm * DESIGN_SCALE * 0.35), width: Math.round(widthMm * DESIGN_SCALE * 0.7), height: 26 },
      ],
    };
    return this.save(tenantId, tpl);
  },

  async remove(tenantId: string, id: string): Promise<void> {
    try { await apiFetch(`/label-templates/${id}`, { method: 'DELETE' }); }
    finally {
      /* La copia local se limpia igual: si el borrado falló por red, la
         plantilla vuelve en la próxima lista del servidor —y si se borró, no
         puede seguir apareciendo acá—. */
      escribirLocal(tenantId, leerLocal(tenantId).filter(t => t.id !== id));
    }
  },

  /** Lo que este equipo tiene guardado, sin pedir nada (para pintar al instante). */
  cache(tenantId: string): LabelTemplate[] {
    return leerLocal(tenantId);
  },
};
