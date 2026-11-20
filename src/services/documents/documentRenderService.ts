/**
 * DIBUJA UN DOCUMENTO con su plantilla.
 *
 * Entra una plantilla (bandas con elementos en mm) más los datos del documento,
 * y sale el HTML listo para imprimir —en hoja, en el navegador o rasterizado
 * para una térmica por QZ—. Un solo renderizador para los tres: si cada formato
 * dibujara por su cuenta, el diseño se vería distinto según por dónde salga, y
 * eso es exactamente lo que el negocio no puede explicarle a un cliente.
 *
 * ── Dos reglas que no son obvias ──────────────────────────────────────────
 *
 * 1. UN DATO VACÍO NO DEJA HUECO. Si la venta no tiene descuento, la línea
 *    «Descuento» no se imprime —y los elementos que están debajo EN LA MISMA
 *    COLUMNA suben—. Sin esto, un tiquete de contado salía con tres renglones
 *    en blanco en el medio de los totales.
 *
 * 2. EL DETALLE VA EN UNA `<table>` DE VERDAD, no en posiciones absolutas. Es
 *    lo que hace que una venta de 60 líneas pagine bien en hoja (con los
 *    encabezados repetidos arriba de cada página, que el navegador hace solo) y
 *    que en rollo el pie salga después del último producto y no encima.
 */
import { qrSvg } from '@/services/labels/labelRenderService';
import type { DocTemplate, DocDesign, DocElement, DocBanda } from './documentTemplatesService';

export interface DocLinea {
  cantidad: number | string;
  codigo?: string | null;
  nombre: string;
  unidad?: string | null;
  precio: number;
  descuento?: number | null;
  iva?: number | null;
  total: number;
}

export interface DocDatos {
  negocio: {
    logo?: string | null; nombre?: string | null; razonSocial?: string | null;
    identificacion?: string | null; direccion?: string | null; ciudad?: string | null;
    telefono?: string | null; correo?: string | null;
  };
  doc: {
    titulo?: string | null; numero?: string | null; fecha?: string | null; hora?: string | null;
    cajero?: string | null; medioPago?: string | null; notas?: string | null; vigencia?: string | null;
  };
  cliente: {
    nombre?: string | null; identificacion?: string | null; telefono?: string | null;
    correo?: string | null; direccion?: string | null;
  };
  totales: {
    subtotal?: number | null; descuento?: number | null; iva?: number | null;
    total?: number | null; recibido?: number | null; vuelto?: number | null;
  };
  fe?: {
    clave?: string | null; consecutivo?: string | null; leyenda?: string | null;
    qr?: string | null;        // dataURL; si no viene y hay `qrContenido`, se genera
    qrContenido?: string | null;
  };
  lineas: DocLinea[];
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, m => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m] as string));

const money = (n: unknown) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return `₡${v.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

/** Montos en cero: se tratan como vacíos para que no dejen renglón. */
const montoONada = (n: unknown) => {
  const v = Number(n);
  if (!Number.isFinite(v) || Math.abs(v) < 0.005) return '';
  return money(v);
};

/** El valor de un campo, ya como texto listo para el papel. */
export function resolverCampo(campo: string, d: DocDatos): string {
  switch (campo) {
    case 'negocio.logo': return String(d.negocio.logo ?? '');
    case 'negocio.nombre': return String(d.negocio.nombre ?? '');
    case 'negocio.razonSocial': return String(d.negocio.razonSocial ?? '');
    case 'negocio.identificacion': return String(d.negocio.identificacion ?? '');
    case 'negocio.direccion': return String(d.negocio.direccion ?? '');
    case 'negocio.ciudad': return String(d.negocio.ciudad ?? '');
    case 'negocio.telefono': return String(d.negocio.telefono ?? '');
    case 'negocio.correo': return String(d.negocio.correo ?? '');

    case 'doc.titulo': return String(d.doc.titulo ?? '');
    case 'doc.numero': return String(d.doc.numero ?? '');
    case 'doc.fecha': return String(d.doc.fecha ?? '');
    case 'doc.hora': return String(d.doc.hora ?? '');
    case 'doc.cajero': return String(d.doc.cajero ?? '');
    case 'doc.medioPago': return String(d.doc.medioPago ?? '');
    case 'doc.notas': return String(d.doc.notas ?? '');
    case 'doc.vigencia': return String(d.doc.vigencia ?? '');

    case 'cliente.nombre': return String(d.cliente.nombre ?? '');
    case 'cliente.identificacion': return String(d.cliente.identificacion ?? '');
    case 'cliente.telefono': return String(d.cliente.telefono ?? '');
    case 'cliente.correo': return String(d.cliente.correo ?? '');
    case 'cliente.direccion': return String(d.cliente.direccion ?? '');

    /* El TOTAL se imprime aunque sea cero: una venta de regalía total ₡0 es
       válida, y un comprobante sin total no es un comprobante. Los demás
       montos en cero no dejan renglón. */
    case 'totales.total': return money(d.totales.total ?? 0);
    case 'totales.subtotal': return montoONada(d.totales.subtotal);
    case 'totales.descuento': return montoONada(d.totales.descuento);
    case 'totales.iva': return montoONada(d.totales.iva);
    case 'totales.recibido': return montoONada(d.totales.recibido);
    case 'totales.vuelto': return montoONada(d.totales.vuelto);

    case 'fe.clave': return String(d.fe?.clave ?? '');
    case 'fe.consecutivo': return String(d.fe?.consecutivo ?? '');
    case 'fe.leyenda': return String(d.fe?.leyenda ?? '');
    case 'fe.qr': return String(d.fe?.qr ?? d.fe?.qrContenido ?? '');
    default: return '';
  }
}

const valorDeLinea = (campo: string, l: DocLinea): string => {
  switch (campo) {
    case 'linea.cantidad': return String(l.cantidad ?? '');
    case 'linea.codigo': return String(l.codigo ?? '');
    case 'linea.nombre': return String(l.nombre ?? '');
    case 'linea.unidad': return String(l.unidad ?? '');
    case 'linea.precio': return money(l.precio);
    case 'linea.descuento': return montoONada(l.descuento);
    case 'linea.iva': return montoONada(l.iva);
    case 'linea.total': return money(l.total);
    default: return '';
  }
};

/** Texto fijo con campos entre llaves: «Gracias, {cliente.nombre}». */
const interpolar = (texto: string, d: DocDatos) =>
  texto.replace(/\{([a-zA-Z.]+)\}/g, (_m, campo) => resolverCampo(String(campo), d));

/** Lo que un elemento va a mostrar. Vacío = no se imprime. */
function textoDeElemento(el: DocElement, d: DocDatos): string {
  if (el.type === 'texto') return interpolar(String(el.value ?? ''), d);
  if (el.type === 'campo') {
    const v = resolverCampo(String(el.campo ?? ''), d);
    if (!v) return '';
    return `${el.etiqueta ?? ''}${v}`;
  }
  return '';
}

/**
 * Acomoda una banda: saca lo vacío y sube lo que quedó debajo EN SU COLUMNA.
 *
 * Por columna y no por banda entera: en un comprobante de hoja los totales
 * están a la derecha y los datos del cliente a la izquierda. Subir todo junto
 * movería el cliente porque la venta no tenía descuento.
 */
function acomodarBanda(banda: DocBanda, d: DocDatos): { elementos: Array<DocElement & { _texto: string }>; hMm: number } {
  const visibles: Array<DocElement & { _texto: string }> = [];
  const columnas = new Map<string, Array<DocElement>>();

  for (const el of banda.elementos) {
    const k = `${Math.round(el.x * 2)}|${Math.round(el.w * 2)}`;
    if (!columnas.has(k)) columnas.set(k, []);
    columnas.get(k)!.push(el);
  }

  let altoMax = 0;
  for (const grupo of columnas.values()) {
    const ordenado = [...grupo].sort((a, b) => a.y - b.y);
    let corrimiento = 0;
    for (const el of ordenado) {
      const texto = textoDeElemento(el, d);
      const pinta = el.type === 'linea' || el.type === 'caja'
        ? true
        : el.type === 'imagen'
          ? !!(el.src || resolverCampo(String(el.campo ?? 'negocio.logo'), d))
          : el.type === 'qr'
            ? !!resolverCampo('fe.qr', d)
            : texto !== '';
      if (!pinta) {
        /* El hueco que deja: su alto más el espacio hasta el siguiente. Se
           descuenta de todo lo que viene abajo en esta misma columna. */
        corrimiento += el.h;
        continue;
      }
      const y = el.y - corrimiento;
      visibles.push({ ...el, y, _texto: texto });
      altoMax = Math.max(altoMax, y + el.h);
    }
  }
  /* El alto de la banda es el que dibuja el contenido, nunca más que el
     declarado en el diseño: así el diseño puede reservar espacio sin que una
     venta sin descuento imprima el hueco. */
  return { elementos: visibles, hMm: Math.min(banda.hMm, Math.max(altoMax, 0)) };
}

const mm = (v: number) => `${Number(v || 0).toFixed(2)}mm`;

function estiloElemento(el: DocElement & { _texto: string }, design: DocDesign): string {
  const partes = [
    'position:absolute',
    `left:${mm(el.x)}`, `top:${mm(el.y)}`,
    `width:${mm(el.w)}`,
  ];
  if (el.type === 'linea') {
    partes.push(`height:0`, `border-top:${mm(Math.max(el.h, 0.25))} solid #000`);
    return partes.join(';');
  }
  partes.push(`height:${mm(el.h)}`);
  if (el.type === 'caja') {
    if (el.fondo) partes.push(`background:${el.fondo}`);
    if (el.borde !== false) partes.push('border:0.3mm solid #000');
    return partes.join(';');
  }
  if (el.type === 'imagen' || el.type === 'qr') {
    partes.push('display:flex', 'overflow:hidden');
    partes.push(`justify-content:${el.align === 'right' ? 'flex-end' : el.align === 'center' ? 'center' : 'flex-start'}`);
    if (el.borde) partes.push('border:0.3mm solid #000');
    return partes.join(';');
  }
  partes.push(
    `font-size:${el.fontPt ?? 10}pt`,
    `font-family:${el.fontFamily || design.fontFamily}`,
    `text-align:${el.align ?? 'left'}`,
    `font-weight:${el.bold ? '700' : '400'}`,
    el.italic ? 'font-style:italic' : 'font-style:normal',
    'line-height:1.15',
    'overflow:hidden',
    /* El texto baja de línea y una palabra larguísima se parte antes que
       salirse del papel: hay nombres de producto de 130 caracteres. */
    'overflow-wrap:anywhere',
    `color:${el.gris ? `rgba(0,0,0,${1 - Math.min(0.6, el.gris)})` : '#000'}`,
  );
  if (el.borde) partes.push('border:0.3mm solid #000');
  if (el.fondo) partes.push(`background:${el.fondo}`);
  if (el.maxLines && el.maxLines > 0) {
    partes.push('display:-webkit-box', `-webkit-line-clamp:${el.maxLines}`, '-webkit-box-orient:vertical');
  }
  return partes.join(';');
}

function pintarBanda(banda: DocBanda, d: DocDatos, design: DocDesign): string {
  const { elementos, hMm } = acomodarBanda(banda, d);
  const cuerpo = elementos.map(el => {
    const style = estiloElemento(el, design);
    if (el.type === 'linea' || el.type === 'caja') return `<div style="${style}"></div>`;
    if (el.type === 'imagen') {
      const src = el.src || resolverCampo(String(el.campo ?? 'negocio.logo'), d);
      if (!src) return '';
      return `<div style="${style}"><img src="${esc(src)}" style="max-width:100%;max-height:100%;object-fit:contain"/></div>`;
    }
    if (el.type === 'qr') {
      const v = resolverCampo('fe.qr', d);
      if (!v) return '';
      const inner = v.startsWith('data:')
        ? `<img src="${esc(v)}" style="max-width:100%;max-height:100%;object-fit:contain"/>`
        : `<div style="width:100%;height:100%">${qrSvg(v)}</div>`;
      return `<div style="${style}">${inner}</div>`;
    }
    return `<div style="${style}">${esc(el._texto)}</div>`;
  }).join('');
  return `<div style="position:relative;width:100%;height:${mm(hMm)}">${cuerpo}</div>`;
}

function pintarDetalle(design: DocDesign, d: DocDatos): string {
  const cols = design.detalle.columnas ?? [];
  if (cols.length === 0 || d.lineas.length === 0) return '';
  const colgroup = cols.map(c => `<col style="width:${mm(c.wMm)}"/>`).join('');
  const thead = design.detalle.encabezados
    ? `<thead><tr>${cols.map(c =>
        `<th style="text-align:${c.align ?? 'left'};padding:0.4mm 0.6mm;border-bottom:0.3mm solid #000;font-weight:700">${esc(c.titulo)}</th>`,
      ).join('')}</tr></thead>`
    : '';
  const borde = design.detalle.lineas ? 'border-bottom:0.2mm solid #ddd' : '';
  const tbody = d.lineas.map(l => `<tr>${cols.map(c => {
    const nombre = c.campo === 'linea.nombre';
    return `<td style="text-align:${c.align ?? 'left'};padding:0.4mm 0.6mm;${borde};vertical-align:top;${
      nombre ? 'overflow-wrap:anywhere' : 'white-space:nowrap'}">${esc(valorDeLinea(c.campo, l))}</td>`;
  }).join('')}</tr>`).join('');

  return `<table style="width:100%;table-layout:fixed;border-collapse:collapse;
    font-size:${design.detalle.fontPt ?? 9}pt;font-family:${design.fontFamily}">
    <colgroup>${colgroup}</colgroup>${thead}<tbody>${tbody}</tbody></table>`;
}

/**
 * El documento completo, como HTML imprimible.
 *
 * `autoPrint` abre el diálogo de impresión al cargar: es lo que quiere la caja.
 * En la vista previa del editor va apagado, porque ahí se está diseñando.
 */
export function renderDocumento(
  tpl: DocTemplate,
  d: DocDatos,
  opciones: { autoPrint?: boolean; paraPantalla?: boolean } = {},
): string {
  const design = tpl.design;
  const m = design.margenes ?? { top: 10, right: 10, bottom: 10, left: 10 };
  const anchoUtil = tpl.widthMm - m.left - m.right;

  /* El tamaño de página se declara EXACTO. En rollo el alto va en `auto`: una
     térmica corta donde termina el contenido, y declararle un alto fijo deja
     papel en blanco de más o corta el tiquete por la mitad. */
  const pageSize = tpl.heightMm
    ? `${tpl.widthMm}mm ${tpl.heightMm}mm`
    : `${tpl.widthMm}mm auto`;

  const cuerpo = `
    ${pintarBanda(design.encabezado, d, design)}
    ${pintarDetalle(design, d)}
    ${pintarBanda(design.pie, d, design)}`;

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(d.doc.numero || d.doc.titulo || 'Documento')}</title>
<style>
  @page { size: ${pageSize}; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  /* El papel entero: el margen lo pone esta caja y no @page, porque los
     elementos se posicionan en mm RELATIVOS al área útil. Con margen en @page
     el navegador le suma el suyo y todo se corre. */
  .papel {
    width: ${mm(tpl.widthMm)};
    padding: ${mm(m.top)} ${mm(m.right)} ${mm(m.bottom)} ${mm(m.left)};
    margin: 0 auto;
  }
  .util { width: ${mm(anchoUtil)}; }
  /* Una fila del detalle no se parte entre dos hojas. */
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  ${opciones.paraPantalla ? `
  body { background:#e5e7eb; padding: 12px 0; }
  .papel { background:#fff; box-shadow: 0 2px 12px rgba(0,0,0,.18); }` : ''}
</style></head><body>
  <div class="papel"><div class="util">${cuerpo}</div></div>
  ${opciones.autoPrint ? '<script>window.onload=function(){window.print()}</script>' : ''}
</body></html>`;
}

/** Datos de ejemplo para la vista previa del editor. */
export function datosDeMuestra(kind: DocTemplate['kind']): DocDatos {
  return {
    negocio: {
      logo: '', nombre: 'Pollos del Valle', razonSocial: 'Inversiones JMR S.A.',
      identificacion: 'Céd. Jurídica: 3-101-123456',
      direccion: '200 m sur de la escuela, San Rafael',
      ciudad: 'Heredia, San Rafael, San Josecito',
      telefono: '2222-3344', correo: 'ventas@pollosdelvalle.cr',
    },
    doc: {
      titulo: kind === 'proforma' ? 'COTIZACIÓN' : 'FACTURA',
      numero: kind === 'proforma' ? 'PRO-00042' : '00001234',
      fecha: '20/11/2026', hora: '14:35',
      cajero: 'María R.', medioPago: 'Efectivo',
      notas: 'Entregar en recepción.',
      vigencia: kind === 'proforma' ? '05/12/2026' : '',
    },
    cliente: {
      nombre: 'Soda La Esquina', identificacion: '3-102-998877',
      telefono: '8888-1122', correo: 'soda@correo.cr', direccion: 'Centro de Heredia',
    },
    totales: { subtotal: 42500, descuento: 2500, iva: 5200, total: 45200, recibido: 50000, vuelto: 4800 },
    fe: {
      clave: '50620112600310112345600100001010000001234567890',
      consecutivo: '00100001010000001234',
      leyenda: 'Autorizada mediante resolución MH-DGT-RES-0027-2024 del 13 de noviembre del 2024 de la DGTD. Version 4.4',
      qrContenido: 'https://api.hacienda.go.cr/fe/consulta?clave=506201126003101123456',
    },
    lineas: [
      { cantidad: 2, codigo: 'POL-001', nombre: 'Pollo entero fresco', unidad: 'kg', precio: 4800, descuento: 0, iva: 0, total: 9600 },
      { cantidad: 1, codigo: 'EMB-220', nombre: 'Chorizo parrillero paquete de 5 unidades', unidad: 'paq', precio: 3250, descuento: 250, iva: 390, total: 3000 },
      { cantidad: 12, codigo: 'HUE-030', nombre: 'Huevos', unidad: 'und', precio: 180, descuento: 0, iva: 0, total: 2160 },
      { cantidad: 3, codigo: 'ACE-100', nombre: 'Aceite vegetal 900 ml', unidad: 'und', precio: 2100, descuento: 0, iva: 819, total: 6300 },
    ],
  };
}
