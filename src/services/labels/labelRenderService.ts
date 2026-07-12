// Convierte una plantilla de etiqueta + datos de producto en HTML imprimible
// (tamaño físico en mm) con código de barras real (Code128 vía JsBarcode).
// El HTML resultante se manda a QZ Tray con `qzPrintHTML`.

import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { DESIGN_SCALE, type LabelTemplate, type LabelElement } from './labelTemplatesService';
import { buildFontFaceCss, DEFAULT_FONT_CSS } from './fontsService';

export interface LabelProduct {
  name: string;
  price: number;
  sku: string;    // código 1
  sku2?: string;  // código 2
}

const crc = (n: number) => `₡${(n ?? 0).toLocaleString('es-CR')}`;

/** Código a codificar según la fuente elegida (SKU 1 / SKU 2). */
export function codeOf(el: LabelElement, p: LabelProduct): string {
  return el.codeSource === 'sku2' ? (p.sku2 || p.sku || '') : (p.sku || '');
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Genera un PNG dataURL del código de barras Code128. `textPx` = tamaño del número. */
function barcodeDataURL(value: string, textPx = 20): string {
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value || '0000000000', {
      format: 'CODE128', width: 2, height: 60,
      displayValue: true, fontSize: textPx, fontOptions: 'bold', margin: 0, textMargin: 2,
    });
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

/** SVG de un código QR (síncrono, nítido). */
export function qrSvg(value: string): string {
  try {
    const qr = QRCode.create(value || '0000', { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const data = qr.modules.data;
    let rects = '';
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (data[r * n + c]) rects += `<rect x="${c}" y="${r}" width="1" height="1"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" width="100%" height="100%">` +
      `<rect width="${n}" height="${n}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
  } catch {
    return '';
  }
}

function elText(el: LabelElement, p: LabelProduct): string {
  switch (el.type) {
    case 'product_name': return escapeHtml(p.name);
    case 'price':        return crc(p.price);
    case 'sku':          return escapeHtml(codeOf(el, p));
    case 'text':         return escapeHtml(el.value || '');
    default:             return '';
  }
}

/** HTML de UNA etiqueta al tamaño físico de la plantilla.
 *  `offset` (mm) desplaza TODO el contenido para calibrar la etiquetadora.
 *  `fontFaceCss` incrusta las Google Fonts usadas (para impresión). */
export function renderLabelHTML(
  tpl: LabelTemplate, p: LabelProduct,
  offset?: { x: number; y: number }, fontFaceCss?: string,
): string {
  const mm = (px: number) => (px / DESIGN_SCALE).toFixed(2);
  const pt = (px: number) => ((px / DESIGN_SCALE) * 2.83465).toFixed(1); // mm → pt

  const rot = (el: LabelElement) => el.rotation ? `transform:rotate(${el.rotation}deg);transform-origin:top left;` : '';

  const els = tpl.elements.map(el => {
    const left = mm(el.x), top = mm(el.y);
    const border = el.border ? 'border:0.2mm solid #000;' : '';
    if (el.type === 'barcode') {
      const url = barcodeDataURL(codeOf(el, p), el.fontSize ?? 20);
      if (!url) return '';
      return `<img src="${url}" style="position:absolute;left:${left}mm;top:${top}mm;width:${mm(el.width ?? 140)}mm;height:${mm(el.height ?? 26)}mm;${border}${rot(el)}"/>`;
    }
    if (el.type === 'qr') {
      const svg = qrSvg(codeOf(el, p));
      if (!svg) return '';
      const s = mm(el.width ?? el.height ?? 80);
      return `<div style="position:absolute;left:${left}mm;top:${top}mm;width:${s}mm;height:${s}mm;${border}${rot(el)}">${svg}</div>`;
    }
    if (el.type === 'image') {
      if (!el.src) return '';
      return `<img src="${el.src}" style="position:absolute;left:${left}mm;top:${top}mm;width:${mm(el.width ?? 60)}mm;height:${mm(el.height ?? 60)}mm;object-fit:contain;${border}${rot(el)}"/>`;
    }
    const align = el.align || 'left';
    const font = el.fontFamily || DEFAULT_FONT_CSS;
    return `<div style="position:absolute;left:${left}mm;top:${top}mm;font-size:${pt(el.fontSize ?? 12)}pt;` +
      `font-family:${font};font-weight:${el.bold ? 700 : 400};text-align:${align};line-height:1.1;white-space:nowrap;${border}${rot(el)}">` +
      `${elText(el, p)}</div>`;
  }).join('');

  const ox = offset?.x ?? 0, oy = offset?.y ?? 0;
  const inner = (ox || oy)
    ? `<div style="position:absolute;left:${ox}mm;top:${oy}mm;">${els}</div>`
    : els;

  const labelBorder = tpl.border ? 'border:0.2mm solid #000;' : '';
  const style = fontFaceCss ? `<style>${fontFaceCss}</style>` : '';
  return `${style}<div style="position:relative;width:${tpl.widthMm}mm;height:${tpl.heightMm}mm;box-sizing:border-box;` +
    `overflow:hidden;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;${labelBorder}">${inner}</div>`;
}

/** Igual que renderLabelHTML pero INCRUSTA las Google Fonts usadas (async, para imprimir). */
export async function renderLabelPrintHTML(
  tpl: LabelTemplate, p: LabelProduct, offset?: { x: number; y: number },
): Promise<string> {
  const fontFaceCss = await buildFontFaceCss(tpl.elements.map(e => e.fontFamily));
  return renderLabelHTML(tpl, p, offset, fontFaceCss);
}
