import { jsPDF } from 'jspdf';
import type { Proforma } from '@/services/proformas/proformasService';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { savePdf } from '@/utils/savePdf';
import { montoPdf } from '@/utils/montoPdf';

// El colón NO existe en las fuentes estándar del PDF: se imprimía «¡». Ver `montoPdf`.
const money = montoPdf;

/**
 * Parte un texto en líneas que CABEN en el ancho dado.
 *
 * `splitTextToSize` corta por espacios, así que una palabra sola más larga que
 * la columna vuelve igual de larga y se sale de la hoja. Acá, cuando una línea
 * sigue pasándose, se corta a lo bruto: feo, pero dentro del papel.
 *
 * Lo necesita toda la proforma, no solo la tabla: medido sobre las 119
 * cotizaciones reales, 85 líneas tienen nombres de más de 38 caracteres y la
 * más larga llega a 134 —un equipo completo descrito en el nombre del
 * producto—.
 */
function enLineas(doc: jsPDF, texto: any, ancho: number): string[] {
  const salida: string[] = [];
  const crudas = doc.splitTextToSize(String(texto ?? ''), ancho) as string[];
  for (const linea of crudas) {
    if (doc.getTextWidth(linea) <= ancho) { salida.push(linea); continue; }
    let actual = '';
    for (const ch of linea) {
      if (actual && doc.getTextWidth(actual + ch) > ancho) { salida.push(actual); actual = ch; }
      else actual += ch;
    }
    if (actual) salida.push(actual);
  }
  return salida.length ? salida : [''];
}

/** Escribe un texto ajustado al ancho y devuelve la `y` siguiente. */
function escribir(doc: jsPDF, texto: any, x: number, y: number, ancho: number, alto: number): number {
  for (const linea of enLineas(doc, texto, ancho)) { doc.text(linea, x, y); y += alto; }
  return y;
}

// Carga una imagen (logo) a data URL para poder incrustarla en el PDF.
async function urlToDataUrl(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return { data: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight };
  } catch { return null; }
}

/** Genera y DESCARGA la proforma como PDF (A4). Incluye logo si está configurado. */
export async function downloadProformaPdf(p: Proforma, tenantId?: string | null): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;                 // margen
  let y = 44;

  /**
   * Datos del negocio, los mismos de Personalización de factura.
   *
   * La cotización se le manda a alguien que todavía no compró: sin teléfono ni
   * dirección no tiene cómo confirmar el pedido. Antes solo viajaba el logo y el
   * nombre.
   */
  let logoUrl = ''; let storeName = ''; let storeAddress = ''; let storePhone = ''; let footer = '';
  if (tenantId) {
    try {
      const cfg: any = await posPrinterService.loadReceiptConfig(tenantId);
      if (cfg?.showLogo && cfg?.logoUrl) logoUrl = cfg.logoUrl;
      storeName = cfg?.businessName || cfg?.storeName || '';
      footer = String(cfg?.footerMessage ?? '').trim();
      const { apiFetch } = await import('@/lib/api');
      const g: any = await apiFetch('/settings/general').catch(() => null);
      if (cfg?.showStoreName !== false) storeName ||= g?.businessName ?? '';
      if (cfg?.showStoreAddress !== false) storeAddress = [g?.address, g?.city].filter(Boolean).join(', ');
      if (cfg?.showStorePhone !== false) storePhone = g?.phone ?? '';
    } catch { /* sin datos: la proforma sale igual */ }
  }
  if (logoUrl) {
    const img = await urlToDataUrl(logoUrl);
    if (img) {
      const maxW = 150, maxH = 60;
      const ratio = Math.min(maxW / img.w, maxH / img.h);
      try { doc.addImage(img.data, 'PNG', M, y, img.w * ratio, img.h * ratio); } catch { /* ignore */ }
      y += 66;
    }
  }
  // El ancho útil: todo lo que se escriba tiene que caber acá adentro.
  const ANCHO = W - M * 2;
  if (storeName) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(30);
    y = escribir(doc, storeName, M, y, ANCHO, 18) + 2;
  }
  const contacto = [storeAddress, storePhone && `Tel: ${storePhone}`].filter(Boolean).join('  ·  ');
  if (contacto) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(107, 114, 128);
    y = escribir(doc, contacto, M, y, ANCHO, 12) + 6;
  }
  y += 6;

  // Badge + título
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(37, 99, 235);
  doc.text('PROFORMA · NO ES FACTURA', M, y); y += 26;
  doc.setFontSize(19); doc.setTextColor(17, 24, 39);
  y = escribir(doc, `Cotización ${p.number ?? ''}`, M, y, ANCHO, 24) + 4;

  // Meta (datos del emisor / documento) — con más aire entre líneas.
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(107, 114, 128);
  y = escribir(doc, `Fecha: ${new Date(p.created_at).toLocaleDateString('es-CR')}${p.valid_until ? `   ·   Vigencia: ${new Date(p.valid_until + 'T00:00:00').toLocaleDateString('es-CR')}` : ''}`, M, y, ANCHO, 16) + 4;
  // El nombre del cliente puede ser largo («Francisco Carniceria las rosas»):
  // antes se iba por el borde derecho en vez de bajar a la línea siguiente.
  y = escribir(doc, `Cliente: ${p.customer_name || 'Cliente de contado'}${p.customer_identification ? `   ·   ${p.customer_identification}` : ''}`, M, y, ANCHO, 16) + 18;

  // Tabla — encabezado
  const xQty = W - M - 210, xPrice = W - M - 110, xTot = W - M;
  const header = () => {
    doc.setFillColor(243, 244, 246); doc.rect(M, y - 12, W - M * 2, 20, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(107, 114, 128);
    doc.text('PRODUCTO', M + 4, y + 2);
    doc.text('CANT.', xQty, y + 2, { align: 'right' });
    doc.text('PRECIO', xPrice, y + 2, { align: 'right' });
    doc.text('TOTAL', xTot - 4, y + 2, { align: 'right' });
    y += 20;
  };
  header();

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(31, 41, 55);
  /**
   * El nombre baja de línea en vez de cortarse.
   *
   * Antes se tomaba `splitTextToSize(...)[0]`: la primera línea y nada más. En
   * una cotización donde el producto ES la descripción —«Equipo Básico 8 de
   * RAM, 246 de sólido, gaveta de dinero, impresora de 58mm…»— eso borraba del
   * papel justo lo que el cliente tiene que leer para decidir.
   *
   * Tres líneas como máximo: más que eso es un párrafo, y para eso están las
   * notas al pie. La tercera termina en «…» para que se vea que sigue.
   */
  const anchoNombre = xQty - M - 16;
  const MAX_LINEAS = 3;
  for (const it of p.items ?? []) {
    let lineas = enLineas(doc, it.name, anchoNombre);
    if (lineas.length > MAX_LINEAS) {
      lineas = lineas.slice(0, MAX_LINEAS);
      lineas[MAX_LINEAS - 1] = enLineas(doc, lineas[MAX_LINEAS - 1] + '…', anchoNombre)[0];
    }
    const alto = 20 + (lineas.length - 1) * 12;
    // El salto de página se decide con el alto REAL de la fila: con el fijo,
    // una línea de tres renglones se montaba sobre el pie de la hoja.
    if (y + alto > 780) {
      doc.addPage(); y = 50; header();
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(31, 41, 55);
    }
    lineas.forEach((l, i) => doc.text(l, M + 4, y + i * 12));
    doc.text(String(it.quantity), xQty, y, { align: 'right' });
    doc.text(money(it.unit_price), xPrice, y, { align: 'right' });
    doc.text(money(it.quantity * it.unit_price), xTot - 4, y, { align: 'right' });
    doc.setDrawColor(243, 244, 246); doc.line(M, y + alto - 15, W - M, y + alto - 15);
    y += alto;
  }

  // Totales — separados del detalle, con el Total resaltado en un recuadro.
  if (y > 700) { doc.addPage(); y = 50; }
  const boxX = W - M - 230;
  y += 16;
  doc.setDrawColor(209, 213, 219); doc.line(boxX, y - 8, W - M, y - 8);   // línea separadora
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(107, 114, 128);
  // Descuento: es lo que el cliente quiere ver. Sin esta línea, la cotización
  // solo muestra un precio más bajo y la rebaja pasa desapercibida.
  const descuento = Number((p as any).discount_amount ?? 0);
  if (descuento > 0.004) {
    doc.text('Descuento', boxX, y + 8);
    doc.text(`-${money(descuento)}`, xTot - 6, y + 8, { align: 'right' });
    y += 22;
  }
  doc.text('Subtotal', boxX, y + 8); doc.text(money(p.subtotal), xTot - 6, y + 8, { align: 'right' }); y += 22;
  // Un negocio sin impuesto no debe ver una línea de IVA en cero: confunde
  // sobre si se cobró o no.
  if (Number(p.tax) > 0.004) {
    doc.text('IVA', boxX, y + 8); doc.text(money(p.tax), xTot - 6, y + 8, { align: 'right' }); y += 22;
  }
  y += 6;
  // Recuadro del TOTAL
  doc.setFillColor(243, 244, 246); doc.roundedRect(boxX, y - 8, 230, 32, 5, 5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(17, 24, 39);
  doc.text('TOTAL', boxX + 12, y + 12); doc.text(money(p.total), xTot - 12, y + 12, { align: 'right' }); y += 48;

  if (p.notes) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(107, 114, 128);
    const notas = enLineas(doc, `Notas: ${p.notes}`, ANCHO);
    // Si las notas no caben en lo que queda de hoja, se van a la siguiente:
    // antes se escribían encima del pie o directamente fuera del papel.
    if (y + notas.length * 14 > 800) { doc.addPage(); y = 50; }
    y = escribir(doc, notas.join('\n'), M, y, ANCHO, 14) + 10;
  }
  doc.setFontSize(9); doc.setTextColor(156, 163, 175);
  if (footer) {
    doc.setFontSize(9); doc.setTextColor(107, 114, 128);
    y = escribir(doc, footer, M, Math.min(y, 792), ANCHO, 12);
  }
  doc.setFontSize(9); doc.setTextColor(156, 163, 175);
  escribir(doc, 'Documento no fiscal. Precios sujetos a cambio según vigencia.', M, Math.min(y, 820), ANCHO, 12);

  // `savePdf` y no `doc.save()`: adentro de la app de Android la descarga
  // clásica no hace nada y la proforma nunca llegaba al cliente.
  await savePdf(doc, `${p.number ?? 'proforma'}.pdf`);
}
