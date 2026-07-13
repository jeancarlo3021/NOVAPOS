// Impresión DIRECTA en TSPL para etiquetadoras Xprinter / TSC / Gprinter.
//
// A diferencia de la impresión HTML por driver (que reescala y no respeta los
// mm), TSPL define la etiqueta en milímetros reales (8 puntos/mm a 203 dpi) y la
// impresora respeta el tamaño exacto y detecta el GAP entre etiquetas.
//
// Pipeline: renderLabelPrintHTML → SVG(foreignObject) → canvas 1-bit → BITMAP.

import { renderLabelPrintHTML, type LabelProduct } from './labelRenderService';
import type { LabelTemplate } from './labelTemplatesService';
import { qzPrintUSB } from '@/services/pos/qzTrayService';

const DPI = 203;                       // densidad típica de etiquetadoras térmicas
const MM_PER_IN = 25.4;
const mmToDots = (mm: number) => Math.round((mm / MM_PER_IN) * DPI);
const mmToCss = (mm: number) => (mm / MM_PER_IN) * 96;   // px CSS (96 dpi)

/** Rasteriza el HTML de la etiqueta a un canvas monocromo al tamaño físico. */
async function rasterizeLabel(
  tpl: LabelTemplate, product: LabelProduct, offset?: { x: number; y: number },
): Promise<ImageData> {
  const inner = await renderLabelPrintHTML(tpl, product, offset);
  const cssW = mmToCss(tpl.widthMm), cssH = mmToCss(tpl.heightMm);
  const dotW = mmToDots(tpl.widthMm), dotH = mmToDots(tpl.heightMm);

  // El contenido está en mm (96dpi en el navegador). El viewBox en espacio 96dpi
  // se escala al tamaño en puntos (203dpi) → nítido y a tamaño real.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dotW}" height="${dotH}" viewBox="0 0 ${cssW} ${cssH}">` +
    `<foreignObject width="${cssW}" height="${cssH}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${tpl.widthMm}mm;height:${tpl.heightMm}mm;background:#fff;">${inner}</div>` +
    `</foreignObject></svg>`;

  const img = new Image();
  img.width = dotW; img.height = dotH;
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('No se pudo rasterizar la etiqueta'));
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = dotW; canvas.height = dotH;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, dotW, dotH);
  ctx.drawImage(img, 0, 0, dotW, dotH);
  try {
    return ctx.getImageData(0, 0, dotW, dotH);
  } catch {
    // getImageData falla si el canvas quedó "tainted" por una imagen remota.
    throw new Error('La etiqueta tiene una imagen externa que impide la impresión directa. Quitá la imagen o usá el modo HTML.');
  }
}

/** Empaqueta el ImageData en datos de BITMAP TSPL (bit 0 = negro, 1 = blanco). */
function packBitmap(img: ImageData): { widthBytes: number; height: number; bytes: Uint8Array } {
  const { width, height, data } = img;
  const widthBytes = Math.ceil(width / 8);
  const bytes = new Uint8Array(widthBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Luminancia; considerar transparencia como blanco.
      const a = data[i + 3];
      const lum = a === 0 ? 255 : (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      const black = lum < 128;
      if (!black) {
        // bit 1 = blanco (no imprime). Arrancamos en 0 = negro, seteamos blancos.
        bytes[y * widthBytes + (x >> 3)] |= (0x80 >> (x & 7));
      }
    }
  }
  return { widthBytes, height, bytes };
}

/**
 * Imprime UNA etiqueta directo en TSPL a tamaño físico exacto, con detección de gap.
 */
export async function printLabelTSPL(
  printerName: string,
  tpl: LabelTemplate, product: LabelProduct,
  opts: { gapMm?: number; copies?: number; offset?: { x: number; y: number } } = {},
): Promise<void> {
  const img = await rasterizeLabel(tpl, product, opts.offset);
  const { widthBytes, height, bytes } = packBitmap(img);
  const gap = opts.gapMm ?? 2;
  const copies = opts.copies && opts.copies > 1 ? opts.copies : 1;

  const header =
    `SIZE ${tpl.widthMm} mm, ${tpl.heightMm} mm\r\n` +
    `GAP ${gap} mm, 0 mm\r\n` +
    `DIRECTION 1\r\n` +
    `CLS\r\n` +
    `BITMAP 0,0,${widthBytes},${height},0,`;
  const footer = `\r\nPRINT ${copies}\r\n`;

  const enc = new TextEncoder();
  const h = enc.encode(header), f = enc.encode(footer);
  const out = new Uint8Array(h.length + bytes.length + f.length);
  out.set(h, 0); out.set(bytes, h.length); out.set(f, h.length + bytes.length);
  await qzPrintUSB(printerName, out);
}

/**
 * Imprime VARIAS etiquetas en un solo trabajo TSPL.
 */
export async function printLabelsTSPL(
  printerName: string,
  jobs: Array<{ tpl: LabelTemplate; product: LabelProduct; copies?: number }>,
  opts: { gapMm?: number; offset?: { x: number; y: number } } = {},
): Promise<void> {
  const gap = opts.gapMm ?? 2;
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const job of jobs) {
    const img = await rasterizeLabel(job.tpl, job.product, opts.offset);
    const { widthBytes, height, bytes } = packBitmap(img);
    const copies = job.copies && job.copies > 1 ? job.copies : 1;
    const header =
      `SIZE ${job.tpl.widthMm} mm, ${job.tpl.heightMm} mm\r\n` +
      `GAP ${gap} mm, 0 mm\r\n` +
      `DIRECTION 1\r\n` +
      `CLS\r\n` +
      `BITMAP 0,0,${widthBytes},${height},0,`;
    const footer = `\r\nPRINT ${copies}\r\n`;
    chunks.push(enc.encode(header), bytes, enc.encode(footer));
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  await qzPrintUSB(printerName, out);
}
