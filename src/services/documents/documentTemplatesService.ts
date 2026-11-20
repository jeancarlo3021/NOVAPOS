/**
 * PLANTILLAS DE DOCUMENTO: el diseño del tiquete, de la hoja (PDF) y de la
 * proforma, guardado en la base.
 *
 * ── Por qué BANDAS y no un lienzo suelto ──────────────────────────────────
 * Un documento no tiene alto fijo: una venta de 3 líneas y una de 60 usan el
 * mismo diseño. Con posiciones absolutas sobre la página entera, la venta larga
 * se le monta encima a los totales o se sale del papel —y en un rollo térmico
 * no existe siquiera un "alto de página"—.
 *
 * Por eso el diseño son tres bandas:
 *   ENCABEZADO — alto fijo, elementos donde el negocio quiera.
 *   DETALLE    — la tabla de líneas. Crece con el documento y empuja al pie.
 *   PIE        — alto fijo, elementos donde el negocio quiera (totales, notas,
 *                condiciones, leyenda legal).
 *
 * Dentro de cada banda se arrastra libre, que es lo que se pidió; entre bandas,
 * el detalle manda. Así el mismo diseño sirve para 3 líneas y para 60, pagina
 * bien en hoja y se puede rasterizar para la térmica.
 */
import { apiFetch } from '@/lib/api';

export type DocKind = 'ticket' | 'hoja' | 'proforma';

export type DocElementType =
  | 'texto'    // texto fijo escrito por el negocio
  | 'campo'    // un dato del documento (se resuelve al imprimir)
  | 'imagen'   // el logo del negocio, o una imagen subida
  | 'linea'    // regla horizontal (separador)
  | 'caja'     // rectángulo: marco o fondo
  | 'qr';      // QR del comprobante electrónico

export interface DocElement {
  id: string;
  type: DocElementType;
  /** Posición y tamaño EN MILÍMETROS, relativos a su banda. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tamaño de letra en puntos (pt): es la unidad en la que se piensa el papel. */
  fontPt?: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Gris del texto: 0 = negro. En térmica todo sale negro de todos modos. */
  gris?: number;
  /** 'texto': lo escrito. Admite campos entre llaves: «Gracias, {cliente.nombre}». */
  value?: string;
  /** 'campo': la clave del dato (ver CAMPOS). */
  campo?: string;
  /** 'campo': etiqueta antepuesta («Cliente: »). Vacío = solo el dato. */
  etiqueta?: string;
  /** 'imagen': dataURL propio. Vacío con `campo: 'negocio.logo'` = el logo configurado. */
  src?: string;
  /** Marco alrededor del elemento. */
  borde?: boolean;
  /** Relleno de la caja (ej. '#f3f4f6'). Vacío = transparente. */
  fondo?: string;
  /** Texto: achica la letra para que quepa en el ancho declarado. */
  autoFit?: boolean;
  /** Texto: tope de líneas antes de recortar. */
  maxLines?: number;
}

export interface DocBanda {
  /** Alto de la banda en mm. El detalle no tiene: lo pone el contenido. */
  hMm: number;
  elementos: DocElement[];
}

export interface DocColumna {
  /** Qué muestra: una de las claves de COLUMNAS_DETALLE. */
  campo: string;
  /** El encabezado de la columna. Editable: «Producto», «Descripción», «Ítem». */
  titulo: string;
  /** Ancho en mm. La suma debería dar el ancho útil; si no, se reparte. */
  wMm: number;
  align?: 'left' | 'center' | 'right';
}

export interface DocDetalle {
  columnas: DocColumna[];
  fontPt: number;
  /** Mostrar la fila de encabezados de columna. */
  encabezados: boolean;
  /** Línea divisoria entre filas. */
  lineas: boolean;
  /** Alto mínimo reservado en el diseño (para ver la banda en el editor). */
  hMm: number;
}

export interface DocDesign {
  /** Márgenes del papel, en mm. */
  margenes: { top: number; right: number; bottom: number; left: number };
  encabezado: DocBanda;
  detalle: DocDetalle;
  pie: DocBanda;
  /** Fuente base de todo el documento. */
  fontFamily: string;
}

export interface DocTemplate {
  id: string;
  kind: DocKind;
  name: string;
  isDefault: boolean;
  widthMm: number;
  /** Alto de la hoja. `null` en rollo: lo pone el contenido. */
  heightMm: number | null;
  design: DocDesign;
  updatedAt: string;
}

/** px por mm en el lienzo del editor (el zoom solo escala la vista). */
export const DESIGN_PX_POR_MM = 3.78;   // ≈ 96 dpi, el px CSS de siempre

/**
 * LOS DATOS QUE SE PUEDEN PONER EN EL PAPEL.
 *
 * Es el contrato entre el editor y el que imprime: el editor ofrece estas
 * claves y el renderizador sabe resolverlas. Agregar un dato nuevo es agregarlo
 * acá y en `resolverCampo`.
 */
export const CAMPOS: Array<{ grupo: string; campo: string; label: string; kinds?: DocKind[] }> = [
  { grupo: 'Negocio', campo: 'negocio.logo', label: 'Logo' },
  { grupo: 'Negocio', campo: 'negocio.nombre', label: 'Nombre del negocio' },
  { grupo: 'Negocio', campo: 'negocio.razonSocial', label: 'Razón social' },
  { grupo: 'Negocio', campo: 'negocio.identificacion', label: 'Cédula (con su tipo)' },
  { grupo: 'Negocio', campo: 'negocio.direccion', label: 'Dirección' },
  { grupo: 'Negocio', campo: 'negocio.ciudad', label: 'Provincia / cantón / distrito' },
  { grupo: 'Negocio', campo: 'negocio.telefono', label: 'Teléfono' },
  { grupo: 'Negocio', campo: 'negocio.correo', label: 'Correo' },

  { grupo: 'Documento', campo: 'doc.titulo', label: 'Título (FACTURA / TIQUETE…)' },
  { grupo: 'Documento', campo: 'doc.numero', label: 'Número' },
  { grupo: 'Documento', campo: 'doc.fecha', label: 'Fecha' },
  { grupo: 'Documento', campo: 'doc.hora', label: 'Hora' },
  { grupo: 'Documento', campo: 'doc.cajero', label: 'Cajero / vendedor' },
  { grupo: 'Documento', campo: 'doc.medioPago', label: 'Medio de pago' },
  { grupo: 'Documento', campo: 'doc.notas', label: 'Notas' },
  { grupo: 'Documento', campo: 'doc.vigencia', label: 'Vigencia', kinds: ['proforma'] },

  { grupo: 'Cliente', campo: 'cliente.nombre', label: 'Nombre' },
  { grupo: 'Cliente', campo: 'cliente.identificacion', label: 'Cédula' },
  { grupo: 'Cliente', campo: 'cliente.telefono', label: 'Teléfono' },
  { grupo: 'Cliente', campo: 'cliente.correo', label: 'Correo' },
  { grupo: 'Cliente', campo: 'cliente.direccion', label: 'Dirección' },

  { grupo: 'Totales', campo: 'totales.subtotal', label: 'Subtotal' },
  { grupo: 'Totales', campo: 'totales.descuento', label: 'Descuento' },
  { grupo: 'Totales', campo: 'totales.iva', label: 'IVA' },
  { grupo: 'Totales', campo: 'totales.total', label: 'TOTAL' },
  { grupo: 'Totales', campo: 'totales.recibido', label: 'Recibido' },
  { grupo: 'Totales', campo: 'totales.vuelto', label: 'Vuelto' },

  { grupo: 'Electrónico', campo: 'fe.clave', label: 'Clave (50 dígitos)' },
  { grupo: 'Electrónico', campo: 'fe.consecutivo', label: 'Consecutivo' },
  { grupo: 'Electrónico', campo: 'fe.leyenda', label: 'Leyenda de resolución' },
  { grupo: 'Electrónico', campo: 'fe.qr', label: 'QR de consulta' },
];

/** Las columnas que puede llevar el detalle. */
export const COLUMNAS_DETALLE: Array<{ campo: string; label: string; align: 'left' | 'center' | 'right' }> = [
  { campo: 'linea.cantidad', label: 'Cant.', align: 'center' },
  { campo: 'linea.codigo', label: 'Código', align: 'left' },
  { campo: 'linea.nombre', label: 'Producto', align: 'left' },
  { campo: 'linea.unidad', label: 'Unidad', align: 'center' },
  { campo: 'linea.precio', label: 'Precio', align: 'right' },
  { campo: 'linea.descuento', label: 'Desc.', align: 'right' },
  { campo: 'linea.iva', label: 'IVA', align: 'right' },
  { campo: 'linea.total', label: 'Total', align: 'right' },
];

export const ANCHOS_PRESET: Array<{ label: string; kind: DocKind[]; w: number; h: number | null }> = [
  { label: 'Rollo 80 mm (imprime 72)', kind: ['ticket', 'proforma'], w: 72, h: null },
  { label: 'Rollo 58 mm (imprime 48)', kind: ['ticket', 'proforma'], w: 48, h: null },
  { label: 'Carta (216 × 279)', kind: ['hoja', 'proforma'], w: 216, h: 279 },
  { label: 'A4 (210 × 297)', kind: ['hoja', 'proforma'], w: 210, h: 297 },
];

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * El diseño de arranque de una plantilla nueva.
 *
 * No arranca en blanco a propósito: un lienzo vacío obliga a armar un
 * comprobante desde cero —con su cédula, su leyenda legal y sus totales— antes
 * de poder ver nada, y ahí es donde se abandona. Arranca con el documento
 * armado y de ahí se mueve lo que se quiera.
 */
export function disenoInicial(kind: DocKind, anchoMm: number): DocDesign {
  const rollo = anchoMm <= 90;
  const m = rollo ? 2 : 14;
  const util = anchoMm - m * 2;
  const pt = rollo ? 8 : 10;

  const titulo = kind === 'proforma' ? 'COTIZACIÓN' : kind === 'hoja' ? 'FACTURA' : 'TIQUETE';

  const enc: DocElement[] = [];
  let y = 0;
  const fila = (el: Omit<DocElement, 'id' | 'x' | 'w'> & { x?: number; w?: number }): DocElement => ({
    id: uid(), x: el.x ?? 0, w: el.w ?? util, ...el,
  } as DocElement);

  enc.push(fila({ type: 'imagen', campo: 'negocio.logo', y, h: rollo ? 12 : 18, align: 'center' }));
  y += (rollo ? 12 : 18) + 1;
  enc.push(fila({ type: 'campo', campo: 'negocio.nombre', y, h: 6, fontPt: pt + 3, bold: true, align: 'center' }));
  y += 7;
  enc.push(fila({ type: 'campo', campo: 'negocio.identificacion', y, h: 4, fontPt: pt - 1, align: 'center' }));
  y += 4.5;
  enc.push(fila({ type: 'campo', campo: 'negocio.direccion', y, h: 4, fontPt: pt - 1, align: 'center' }));
  y += 4.5;
  enc.push(fila({ type: 'campo', campo: 'negocio.telefono', etiqueta: 'Tel: ', y, h: 4, fontPt: pt - 1, align: 'center' }));
  y += 6;
  enc.push(fila({ type: 'texto', value: titulo, y, h: 6, fontPt: pt + 2, bold: true, align: 'center' }));
  y += 7;
  enc.push(fila({ type: 'linea', y, h: 0.4 }));
  y += 2;
  enc.push(fila({ type: 'campo', campo: 'doc.numero', etiqueta: 'N° ', y, h: 4, fontPt: pt - 1, align: 'left', w: util / 2 }));
  enc.push(fila({ type: 'campo', campo: 'doc.fecha', y, h: 4, fontPt: pt - 1, align: 'right', x: util / 2, w: util / 2 }));
  y += 4.5;
  enc.push(fila({ type: 'campo', campo: 'cliente.nombre', etiqueta: 'Cliente: ', y, h: 4, fontPt: pt - 1, align: 'left' }));
  y += 5;

  /* Las columnas: en rollo no caben seis, así que arranca con las cuatro que
     hacen falta para que el cliente pueda revisar lo que le cobraron. */
  const columnas: DocColumna[] = rollo
    ? [
        { campo: 'linea.cantidad', titulo: 'Cant', wMm: util * 0.14, align: 'center' },
        { campo: 'linea.nombre', titulo: 'Producto', wMm: util * 0.46, align: 'left' },
        { campo: 'linea.precio', titulo: 'Precio', wMm: util * 0.2, align: 'right' },
        { campo: 'linea.total', titulo: 'Total', wMm: util * 0.2, align: 'right' },
      ]
    : [
        { campo: 'linea.cantidad', titulo: 'Cant.', wMm: util * 0.1, align: 'center' },
        { campo: 'linea.codigo', titulo: 'Código', wMm: util * 0.16, align: 'left' },
        { campo: 'linea.nombre', titulo: 'Descripción', wMm: util * 0.38, align: 'left' },
        { campo: 'linea.precio', titulo: 'Precio', wMm: util * 0.18, align: 'right' },
        { campo: 'linea.total', titulo: 'Total', wMm: util * 0.18, align: 'right' },
      ];

  const pie: DocElement[] = [];
  let py = 1;
  const anchoTot = rollo ? util : util * 0.45;
  const xTot = rollo ? 0 : util - anchoTot;
  pie.push(fila({ type: 'linea', y: 0, h: 0.4 }));
  pie.push(fila({ type: 'campo', campo: 'totales.subtotal', etiqueta: 'Subtotal', y: py, h: 4.5, fontPt: pt, align: 'right', x: xTot, w: anchoTot }));
  py += 5;
  pie.push(fila({ type: 'campo', campo: 'totales.descuento', etiqueta: 'Descuento', y: py, h: 4.5, fontPt: pt, align: 'right', x: xTot, w: anchoTot }));
  py += 5;
  pie.push(fila({ type: 'campo', campo: 'totales.iva', etiqueta: 'IVA', y: py, h: 4.5, fontPt: pt, align: 'right', x: xTot, w: anchoTot }));
  py += 6;
  pie.push(fila({ type: 'campo', campo: 'totales.total', etiqueta: 'TOTAL', y: py, h: 7, fontPt: pt + 4, bold: true, align: 'right', x: xTot, w: anchoTot }));
  py += 9;
  if (kind !== 'proforma') {
    pie.push(fila({ type: 'campo', campo: 'doc.medioPago', etiqueta: 'Pago: ', y: py, h: 4, fontPt: pt - 1, align: 'left' }));
    py += 5;
  }
  if (kind === 'proforma') {
    pie.push(fila({
      type: 'texto', y: py, h: 8, fontPt: pt - 1, align: 'left', maxLines: 3,
      value: 'Documento no fiscal. Precios sujetos a cambio según vigencia.',
    }));
    py += 9;
  } else {
    pie.push(fila({ type: 'campo', campo: 'fe.leyenda', y: py, h: 8, fontPt: pt - 2, align: 'center', maxLines: 3 }));
    py += 9;
  }
  pie.push(fila({ type: 'texto', value: '¡Gracias por su compra!', y: py, h: 5, fontPt: pt, bold: true, align: 'center' }));
  py += 6;

  return {
    margenes: { top: m, right: m, bottom: m, left: m },
    fontFamily: rollo ? 'monospace' : 'system-ui, Arial, sans-serif',
    encabezado: { hMm: Math.ceil(y), elementos: enc },
    detalle: { columnas, fontPt: pt - 1, encabezados: true, lineas: !rollo, hMm: rollo ? 30 : 60 },
    pie: { hMm: Math.ceil(py), elementos: pie },
  };
}

/** Una plantilla nueva, sin guardar. */
export function plantillaNueva(kind: DocKind, nombre?: string): DocTemplate {
  const preset = ANCHOS_PRESET.find(p => p.kind.includes(kind))!;
  const w = kind === 'ticket' ? 72 : 216;
  const h = kind === 'ticket' ? null : 279;
  void preset;
  return {
    id: '', kind, name: nombre ?? 'Plantilla nueva', isDefault: false,
    widthMm: w, heightMm: h,
    design: disenoInicial(kind, w),
    updatedAt: new Date().toISOString(),
  };
}

const KEY = (tid: string) => `document_templates_${tid}`;

/** Copia local: el papel tiene que poder salir sin internet. */
const leerLocal = (tenantId: string): DocTemplate[] => {
  try { return JSON.parse(localStorage.getItem(KEY(tenantId)) || '[]'); } catch { return []; }
};
const escribirLocal = (tenantId: string, list: DocTemplate[]) => {
  try { localStorage.setItem(KEY(tenantId), JSON.stringify(list)); } catch { /* privado o lleno */ }
};

const aCuerpo = (t: Partial<DocTemplate>) => ({
  ...(t.kind !== undefined ? { kind: t.kind } : {}),
  ...(t.name !== undefined ? { name: t.name } : {}),
  ...(t.isDefault !== undefined ? { is_default: t.isDefault } : {}),
  ...(t.widthMm !== undefined ? { width_mm: t.widthMm } : {}),
  ...(t.heightMm !== undefined ? { height_mm: t.heightMm } : {}),
  ...(t.design !== undefined ? { design: t.design } : {}),
});

export const documentTemplatesService = {
  /**
   * Las plantillas del negocio.
   *
   * Si el servidor no contesta se usa la copia de este equipo: quedarse sin
   * poder imprimir porque se cayó internet no es aceptable en una caja.
   */
  async list(tenantId: string, kind?: DocKind): Promise<DocTemplate[]> {
    try {
      const qs = kind ? `?kind=${kind}` : '';
      const d = await apiFetch<DocTemplate[]>(`/document-templates${qs}`);
      const todas = Array.isArray(d) ? d : [];
      if (!kind) escribirLocal(tenantId, todas);
      else {
        /* Al traer un solo tipo se reemplaza SOLO ese tipo en la copia local:
           sobrescribir todo dejaría al negocio sin las plantillas de los otros
           dos documentos la próxima vez que se quede sin señal. */
        const otras = leerLocal(tenantId).filter(t => t.kind !== kind);
        escribirLocal(tenantId, [...otras, ...todas]);
      }
      return todas;
    } catch {
      const local = leerLocal(tenantId);
      return kind ? local.filter(t => t.kind === kind) : local;
    }
  },

  /** La plantilla con la que se imprime ese documento, o `null` si no hay. */
  async predeterminada(tenantId: string, kind: DocKind): Promise<DocTemplate | null> {
    const list = await this.list(tenantId, kind).catch(() => [] as DocTemplate[]);
    return list.find(t => t.isDefault) ?? null;
  },

  async save(tenantId: string, t: DocTemplate): Promise<DocTemplate> {
    const guardada = t.id
      ? await apiFetch<DocTemplate>(`/document-templates/${t.id}`, {
          method: 'PUT', body: JSON.stringify(aCuerpo(t)),
        })
      : await apiFetch<DocTemplate>('/document-templates', {
          method: 'POST', body: JSON.stringify(aCuerpo(t)),
        });
    const resto = leerLocal(tenantId).filter(x => x.id !== guardada.id);
    /* Si esta quedó predeterminada, las otras del mismo tipo dejaron de serlo:
       la copia local tiene que decir lo mismo que la base, o sin señal se
       imprimiría con la plantilla vieja. */
    const ajustadas = guardada.isDefault
      ? resto.map(x => (x.kind === guardada.kind ? { ...x, isDefault: false } : x))
      : resto;
    escribirLocal(tenantId, [guardada, ...ajustadas]);
    return guardada;
  },

  async remove(tenantId: string, id: string): Promise<void> {
    await apiFetch(`/document-templates/${id}`, { method: 'DELETE' });
    escribirLocal(tenantId, leerLocal(tenantId).filter(x => x.id !== id));
  },

  /** Duplicar: la forma sana de probar un cambio sin arruinar la que imprime. */
  duplicar(t: DocTemplate): DocTemplate {
    return {
      ...t,
      id: '',
      name: `${t.name} (copia)`,
      isDefault: false,
      design: JSON.parse(JSON.stringify(t.design)),
    };
  },
};
