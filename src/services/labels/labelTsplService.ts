// Impresión DIRECTA en TSPL para etiquetadoras Xprinter / TSC / Gprinter.
//
// A diferencia de la impresión HTML por driver (que reescala y no respeta los
// mm), TSPL define la etiqueta en milímetros reales (8 puntos/mm a 203 dpi) y la
// impresora respeta el tamaño exacto y detecta el GAP entre etiquetas.
//
// Pipeline: se DIBUJA cada elemento directo en un <canvas> (texto con fillText,
// barcode/QR/imagen con drawImage) → 1-bit → BITMAP. Antes se usaba un SVG con
// <foreignObject>, pero su rasterización era inestable entre equipos: el onload
// del SVG se dispara antes de pintar el código de barras y las fuentes, dejando
// SOLO los bordes. Dibujar en canvas es determinista.

import { codeOf, barcodeDataURL, qrSvg, type LabelProduct } from './labelRenderService';
import { DESIGN_SCALE, type LabelTemplate, type LabelElement } from './labelTemplatesService';
import { qzPrintUSB } from '@/services/pos/qzTrayService';

const DPI = 203;                       // densidad típica de etiquetadoras térmicas
const MM_PER_IN = 25.4;
const mmToDots = (mm: number) => Math.round((mm / MM_PER_IN) * DPI);
// Coordenadas de diseño (px @ DESIGN_SCALE por mm) → puntos de impresión (203dpi).
const designToDots = (px: number) => mmToDots(px / DESIGN_SCALE);

const crc = (n: number) => `₡${(n ?? 0).toLocaleString('es-CR')}`;

function elPlainText(el: LabelElement, p: LabelProduct): string {
  switch (el.type) {
    case 'product_name': return p.name ?? '';
    case 'price':        return crc(p.price);
    case 'sku':          return codeOf(el, p);
    case 'text':         return el.value || '';
    default:             return '';
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('No se pudo cargar una imagen de la etiqueta'));
    im.src = url;
  });
}
const svgToUrl = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

/** Dibuja la etiqueta directamente en un canvas monocromo al tamaño físico. */
async function rasterizeLabel(
  tpl: LabelTemplate, product: LabelProduct, offset?: { x: number; y: number },
): Promise<ImageData> {
  const dotW = mmToDots(tpl.widthMm), dotH = mmToDots(tpl.heightMm);
  const canvas = document.createElement('canvas');
  canvas.width = dotW; canvas.height = dotH;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, dotW, dotH);

  // Asegurar que las fuentes cargadas estén listas antes de dibujar texto.
  try { await (document as any).fonts?.ready; } catch { /* noop */ }

  const offX = mmToDots(offset?.x ?? 0), offY = mmToDots(offset?.y ?? 0);
  const borderPx = Math.max(1, mmToDots(0.2));

  // Borde de la etiqueta.
  if (tpl.border) {
    ctx.strokeStyle = '#000'; ctx.lineWidth = borderPx;
    ctx.strokeRect(borderPx / 2, borderPx / 2, dotW - borderPx, dotH - borderPx);
  }

  for (const el of tpl.elements) {
    const left = offX + designToDots(el.x);
    const top = offY + designToDots(el.y);
    ctx.save();
    if (el.rotation) {
      ctx.translate(left, top);
      ctx.rotate((el.rotation * Math.PI) / 180);
      ctx.translate(-left, -top);
    }

    let boxW = 0, boxH = 0;
    try {
      if (el.type === 'barcode') {
        const url = barcodeDataURL(codeOf(el, product), el.fontSize ?? 20);
        if (url) {
          boxW = designToDots(el.width ?? 140); boxH = designToDots(el.height ?? 26);
          ctx.drawImage(await loadImage(url), left, top, boxW, boxH);
        }
      } else if (el.type === 'qr') {
        const svg = qrSvg(codeOf(el, product));
        if (svg) {
          boxW = boxH = designToDots(el.width ?? el.height ?? 80);
          ctx.drawImage(await loadImage(svgToUrl(svg)), left, top, boxW, boxH);
        }
      } else if (el.type === 'image') {
        if (el.src) {
          boxW = designToDots(el.width ?? 60); boxH = designToDots(el.height ?? 60);
          ctx.drawImage(await loadImage(el.src), left, top, boxW, boxH);
        }
      } else {
        const text = elPlainText(el, product);
        const px = designToDots(el.fontSize ?? 12);
        const family = el.fontFamily || 'Arial, Helvetica, sans-serif';
        ctx.font = `${el.bold ? '700' : '400'} ${px}px ${family}`;
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#000';
        ctx.fillText(text, left, top);
        boxW = Math.ceil(ctx.measureText(text).width);
        boxH = Math.ceil(px * 1.1);
      }

      if (el.border && boxW > 0 && boxH > 0) {
        ctx.strokeStyle = '#000'; ctx.lineWidth = borderPx;
        ctx.strokeRect(left, top, boxW, boxH);
      }
    } catch (e) {
      ctx.restore();
      throw e;
    }
    ctx.restore();
  }

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
