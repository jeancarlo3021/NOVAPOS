// Convierte una plantilla de etiqueta + datos de producto en HTML imprimible
// (tamaño físico en mm) con código de barras real (Code128 vía JsBarcode).
// El HTML resultante se manda a QZ Tray con `qzPrintHTML`.

import JsBarcode from 'jsbarcode';
import { DESIGN_SCALE, type LabelTemplate, type LabelElement } from './labelTemplatesService';

export interface LabelProduct {
  name: string;
  price: number;
  code: string;   // código para el barcode (sku / código de barras)
}

const crc = (n: number) => `₡${(n ?? 0).toLocaleString('es-CR')}`;

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Genera un PNG dataURL del código de barras Code128. */
function barcodeDataURL(value: string): string {
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value || '0000000000', {
      format: 'CODE128', width: 2, height: 60,
      displayValue: true, fontSize: 14, margin: 0, textMargin: 2,
    });
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

function elText(el: LabelElement, p: LabelProduct): string {
  switch (el.type) {
    case 'product_name': return escapeHtml(p.name);
    case 'price':        return crc(p.price);
    case 'sku':          return escapeHtml(p.code);
    case 'text':         return escapeHtml(el.value || '');
    default:             return '';
  }
}

/** HTML de UNA etiqueta al tamaño físico de la plantilla.
 *  `offset` (mm) desplaza TODO el contenido para calibrar la etiquetadora. */
export function renderLabelHTML(tpl: LabelTemplate, p: LabelProduct, offset?: { x: number; y: number }): string {
  const mm = (px: number) => (px / DESIGN_SCALE).toFixed(2);
  const pt = (px: number) => ((px / DESIGN_SCALE) * 2.83465).toFixed(1); // mm → pt

  const els = tpl.elements.map(el => {
    const left = mm(el.x), top = mm(el.y);
    const border = el.border ? 'border:0.2mm solid #000;' : '';
    if (el.type === 'barcode') {
      const url = barcodeDataURL(p.code);
      if (!url) return '';
      return `<img src="${url}" style="position:absolute;left:${left}mm;top:${top}mm;width:${mm(el.width ?? 140)}mm;height:${mm(el.height ?? 26)}mm;${border}"/>`;
    }
    if (el.type === 'image') {
      if (!el.src) return '';
      return `<img src="${el.src}" style="position:absolute;left:${left}mm;top:${top}mm;width:${mm(el.width ?? 60)}mm;height:${mm(el.height ?? 60)}mm;object-fit:contain;${border}"/>`;
    }
    const align = el.align || 'left';
    return `<div style="position:absolute;left:${left}mm;top:${top}mm;font-size:${pt(el.fontSize ?? 12)}pt;` +
      `font-weight:${el.bold ? 700 : 400};text-align:${align};line-height:1.1;white-space:nowrap;${border}">` +
      `${elText(el, p)}</div>`;
  }).join('');

  const ox = offset?.x ?? 0, oy = offset?.y ?? 0;
  const inner = (ox || oy)
    ? `<div style="position:absolute;left:${ox}mm;top:${oy}mm;">${els}</div>`
    : els;

  const labelBorder = tpl.border ? 'border:0.2mm solid #000;' : '';
  return `<div style="position:relative;width:${tpl.widthMm}mm;height:${tpl.heightMm}mm;box-sizing:border-box;` +
    `overflow:hidden;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;${labelBorder}">${inner}</div>`;
}
