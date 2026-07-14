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
export function barcodeDataURL(value: string, textPx = 20): string {
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

// ── Auto-ajuste de texto (achicar fuente + envolver en N líneas) ─────────────
// Todo se mide en "px de diseño" (misma escala que fontSize/width del elemento),
// así el ajuste es consistente sin importar el zoom o los mm reales.
let _measureCtx: CanvasRenderingContext2D | null = null;
function measureCtx(): CanvasRenderingContext2D | null {
  if (_measureCtx) return _measureCtx;
  try { _measureCtx = document.createElement('canvas').getContext('2d'); } catch { _measureCtx = null; }
  return _measureCtx;
}

/** Envuelve `text` en ≤maxLines líneas que quepan en maxWidth; null si no cabe. */
function wrapToLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] | null {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (ctx.measureText(w).width > maxWidth) return null;   // palabra sola no cabe
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) { cur = test; }
    else { lines.push(cur); cur = w; if (lines.length >= maxLines) return null; }
  }
  if (cur) lines.push(cur);
  return lines.length <= maxLines ? lines : null;
}

/**
 * Calcula el tamaño de fuente (px de diseño) y las líneas para que `text` quepa
 * en `maxWidth` × `maxLines`, achicando desde `maxFont` hasta `minFont`.
 */
export function fitText(
  text: string, maxWidth: number, maxLines: number, maxFont: number,
  bold: boolean, family: string, minFont = 6,
): { fontSize: number; lines: string[] } {
  const ctx = measureCtx();
  if (!ctx) return { fontSize: maxFont, lines: [String(text ?? '')] };
  for (let fs = Math.round(maxFont); fs >= minFont; fs--) {
    ctx.font = `${bold ? '700' : '400'} ${fs}px ${family}`;
    const lines = wrapToLines(ctx, text, maxWidth, maxLines);
    if (lines) return { fontSize: fs, lines };
  }
  // No cupo ni al mínimo: partir a la fuerza en maxLines y truncar.
  ctx.font = `${bold ? '700' : '400'} ${minFont}px ${family}`;
  const chars = String(text ?? '');
  const lines: string[] = [];
  let cur = '';
  for (const ch of chars) {
    if (ctx.measureText(cur + ch).width > maxWidth) { lines.push(cur); cur = ch; if (lines.length >= maxLines) break; }
    else cur += ch;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return { fontSize: minFont, lines };
}

/** Texto SIN escapar (para medir/ajustar). */
export function elRawText(el: LabelElement, p: LabelProduct): string {
  switch (el.type) {
    case 'product_name': return p.name ?? '';
    case 'price':        return crc(p.price);
    case 'sku':          return codeOf(el, p);
    case 'text':         return el.value || '';
    default:             return '';
  }
}

function elText(el: LabelElement, p: LabelProduct): string {
  return escapeHtml(elRawText(el, p));
}

/** Alineación del texto: el nombre del producto se centra automáticamente. */
export function textAlignOf(el: LabelElement): 'left' | 'center' | 'right' {
  if (el.type === 'product_name') return 'center';
  return el.align ?? 'left';
}

/** ¿Este elemento de texto usa auto-ajuste multi-línea? (product_name: sí por defecto). */
export function textFitConfig(el: LabelElement): { fit: boolean; maxLines: number } {
  const fit = el.autoFit ?? (el.type === 'product_name');
  const maxLines = el.maxLines ?? (el.type === 'product_name' ? 2 : 1);
  return { fit: !!fit && maxLines >= 1, maxLines };
}

/** Ancho de la caja de texto (px de diseño): el.width o el resto de la etiqueta. */
export function textBoxWidth(el: LabelElement, widthMm: number): number {
  if (el.width && el.width > 0) return el.width;
  return Math.max(20, widthMm * DESIGN_SCALE - el.x - DESIGN_SCALE * 2);
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
    const align = textAlignOf(el);
    const font = el.fontFamily || DEFAULT_FONT_CSS;
    const { fit, maxLines } = textFitConfig(el);
    if (fit) {
      // Auto-ajuste: achica la fuente y envuelve en ≤maxLines líneas (ej. nombre
      // de producto en 2 líneas). Se mide en px de diseño y se emite en mm/pt.
      const boxDesign = textBoxWidth(el, tpl.widthMm);
      const fitted = fitText(elRawText(el, p), boxDesign, maxLines, el.fontSize ?? 12, !!el.bold, font);
      const body = fitted.lines.map(l => escapeHtml(l)).join('<br>');
      return `<div style="position:absolute;left:${left}mm;top:${top}mm;width:${mm(boxDesign)}mm;` +
        `font-size:${pt(fitted.fontSize)}pt;font-family:${font};font-weight:${el.bold ? 700 : 400};` +
        `text-align:${align};line-height:1.05;overflow:hidden;${border}${rot(el)}">${body}</div>`;
    }
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
