import { jsPDF } from 'jspdf';
import type { Proforma } from '@/services/proformas/proformasService';
import { posPrinterService } from '@/services/pos/posPrinterService';

const money = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

  // Logo + nombre del negocio (config de recibo).
  let logoUrl = ''; let storeName = '';
  if (tenantId) {
    try {
      const cfg: any = await posPrinterService.loadReceiptConfig(tenantId);
      if (cfg?.showLogo && cfg?.logoUrl) logoUrl = cfg.logoUrl;
      storeName = cfg?.businessName || cfg?.storeName || '';
    } catch { /* sin logo */ }
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
  if (storeName) { doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(30); doc.text(storeName, M, y); y += 26; }

  // Badge + título
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(37, 99, 235);
  doc.text('PROFORMA · NO ES FACTURA', M, y); y += 26;
  doc.setFontSize(19); doc.setTextColor(17, 24, 39);
  doc.text(`Cotización ${p.number ?? ''}`, M, y); y += 28;

  // Meta (datos del emisor / documento) — con más aire entre líneas.
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(107, 114, 128);
  doc.text(`Fecha: ${new Date(p.created_at).toLocaleDateString('es-CR')}${p.valid_until ? `   ·   Vigencia: ${new Date(p.valid_until + 'T00:00:00').toLocaleDateString('es-CR')}` : ''}`, M, y); y += 20;
  doc.text(`Cliente: ${p.customer_name || 'Cliente de contado'}${p.customer_identification ? `   ·   ${p.customer_identification}` : ''}`, M, y); y += 34;

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
  for (const it of p.items ?? []) {
    if (y > 780) { doc.addPage(); y = 50; header(); doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(31, 41, 55); }
    const name = doc.splitTextToSize(String(it.name ?? ''), xQty - M - 12)[0] ?? '';
    doc.text(name, M + 4, y);
    doc.text(String(it.quantity), xQty, y, { align: 'right' });
    doc.text(money(it.unit_price), xPrice, y, { align: 'right' });
    doc.text(money(it.quantity * it.unit_price), xTot - 4, y, { align: 'right' });
    doc.setDrawColor(243, 244, 246); doc.line(M, y + 5, W - M, y + 5);
    y += 20;
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
  doc.text('IVA', boxX, y + 8); doc.text(money(p.tax), xTot - 6, y + 8, { align: 'right' }); y += 28;
  // Recuadro del TOTAL
  doc.setFillColor(243, 244, 246); doc.roundedRect(boxX, y - 8, 230, 32, 5, 5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(17, 24, 39);
  doc.text('TOTAL', boxX + 12, y + 12); doc.text(money(p.total), xTot - 12, y + 12, { align: 'right' }); y += 48;

  if (p.notes) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(107, 114, 128);
    doc.text(doc.splitTextToSize(`Notas: ${p.notes}`, W - M * 2), M, y);
    y += 24;
  }
  doc.setFontSize(9); doc.setTextColor(156, 163, 175);
  doc.text('Documento no fiscal. Precios sujetos a cambio según vigencia.', M, Math.min(y, 820));

  doc.save(`${p.number ?? 'proforma'}.pdf`);
}
