import { jsPDF } from 'jspdf';
import { savePdf } from '@/utils/savePdf';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { apiFetch } from '@/lib/api';

const money = (n: number) =>
  `\u00A2${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface InvoicePdfLine {
  name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  date?: Date;
  customerName?: string | null;
  customerIdentification?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  items: InvoicePdfLine[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod?: string | null;
  notes?: string | null;
  /** Documento electrónico: clave y consecutivo de Hacienda. */
  feClave?: string | null;
  feConsecutivo?: string | null;
  documentLabel?: string;
}

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

const PAY_LABEL: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', sinpe: 'SINPE Móvil', credit: 'Crédito',
  check: 'Cheque', transfer: 'Transferencia', third_party: 'Recaudado por terceros',
  digital: 'Plataforma digital', other: 'Otros',
};

/**
 * Descarga la factura en PDF tamaño A4.
 *
 * El tiquete térmico sirve en el mostrador, pero el cliente que necesita
 * respaldo (empresa, reembolso, contabilidad) pide "la factura en hoja". Esto
 * genera esa versión con los mismos datos de la venta.
 */
export async function downloadInvoicePdf(d: InvoicePdfData, tenantId?: string | null): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  let y = 44;

  // Datos del emisor: los mismos que salen en el tiquete — primero el emisor de
  // Facturación Electrónica y, lo que falte, de Configuración → General.
  let logoUrl = ''; let storeName = ''; let commercialName = '';
  let storeId = ''; let storeAddress = ''; let storePhone = ''; let storeEmail = '';
  if (tenantId) {
    try {
      const cfg: any = await posPrinterService.loadReceiptConfig(tenantId);
      if (cfg?.showLogo && cfg?.logoUrl) logoUrl = cfg.logoUrl;
    } catch { /* sin logo */ }

    const readSetting = async (type: string, cacheKey: string) => {
      try {
        const cached = localStorage.getItem(`novapos_cache_${tenantId}_settings_${cacheKey}`);
        if (cached) { const p = JSON.parse(cached); return p?.data ?? p; }
      } catch { /* ignore */ }
      try { const r: any = await apiFetch<any>(`/settings/${type}`); return r?.config ?? r; }
      catch { return null; }
    };

    const fe: any = await readSetting('electronic-invoice', 'electronic-invoice');
    if (fe?.emisor_name) {
      storeName = fe.emisor_name;
      commercialName = fe.emisor_commercial_name ?? '';
      storeId = fe.emisor_identification ?? '';
      storeAddress = fe.emisor_address ?? '';
      storePhone = fe.emisor_phone ?? '';
      storeEmail = fe.emisor_email ?? '';
    }
    const general: any = await readSetting('general', 'general');
    if (general) {
      storeName ||= general.businessName ?? '';
      storeId ||= general.ruc ?? general.cedula ?? '';
      storeAddress ||= [general.address, general.city].filter(Boolean).join(', ');
      storePhone ||= general.phone ?? '';
      storeEmail ||= general.email ?? '';
    }
  }
  const storeInfo = [
    storeId && `Ced. ${storeId}`,
    storeAddress,
    storePhone && `Tel. ${storePhone}`,
    storeEmail,
  ].filter(Boolean) as string[];

  if (logoUrl) {
    const img = await urlToDataUrl(logoUrl);
    if (img) {
      const maxW = 150, maxH = 60;
      const ratio = Math.min(maxW / img.w, maxH / img.h);
      try { doc.addImage(img.data, 'PNG', M, y, img.w * ratio, img.h * ratio); } catch { /* ignore */ }
      y += 66;
    }
  }
  if (storeName) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(30);
    doc.text(storeName, M, y); y += 17;
    if (commercialName && commercialName !== storeName) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(75, 85, 99);
      doc.text(commercialName, M, y); y += 15;
    }
  }
  if (storeInfo.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(107, 114, 128);
    // Puede ser largo (dirección completa): se parte en varias líneas.
    const lines = doc.splitTextToSize(storeInfo.join('   -   '), W - M * 2) as string[];
    doc.text(lines, M, y); y += lines.length * 12 + 8;
  }

  // Título
  doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.setTextColor(17, 24, 39);
  doc.text(`${d.documentLabel ?? 'Factura'} ${d.invoiceNumber}`, M, y); y += 26;

  const date = d.date ?? new Date();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(107, 114, 128);
  doc.text(
    `Fecha: ${date.toLocaleDateString('es-CR')} ${date.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}` +
    (d.paymentMethod ? `   -   Pago: ${PAY_LABEL[d.paymentMethod] ?? d.paymentMethod}` : ''),
    M, y); y += 18;

  const cliente = [d.customerName || 'Cliente de contado', d.customerIdentification, d.customerPhone, d.customerEmail]
    .filter(Boolean).join('   -   ');
  doc.text(`Cliente: ${cliente}`, M, y); y += 18;

  if (d.feConsecutivo || d.feClave) {
    doc.setFontSize(8);
    if (d.feConsecutivo) { doc.text(`Consecutivo Hacienda: ${d.feConsecutivo}`, M, y); y += 13; }
    if (d.feClave) { doc.text(`Clave: ${d.feClave}`, M, y); y += 13; }
    doc.setFontSize(10);
  }
  y += 14;

  // Tabla
  const xQty = W - M - 210, xPrice = W - M - 110, xTot = W - M;
  const header = () => {
    doc.setFillColor(243, 244, 246); doc.rect(M, y - 12, W - M * 2, 20, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(107, 114, 128);
    doc.text('DESCRIPCIÓN', M + 4, y + 2);
    doc.text('CANT.', xQty, y + 2, { align: 'right' });
    doc.text('PRECIO', xPrice, y + 2, { align: 'right' });
    doc.text('TOTAL', xTot - 4, y + 2, { align: 'right' });
    y += 20;
  };
  header();

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(31, 41, 55);
  for (const it of d.items) {
    if (y > 760) {
      doc.addPage(); y = 50; header();
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(31, 41, 55);
    }
    const name = doc.splitTextToSize(String(it.name ?? ''), xQty - M - 12)[0] ?? '';
    doc.text(name, M + 4, y);
    doc.text(String(it.quantity), xQty, y, { align: 'right' });
    doc.text(money(it.unit_price), xPrice, y, { align: 'right' });
    doc.text(money(it.subtotal), xTot - 4, y, { align: 'right' });
    doc.setDrawColor(243, 244, 246); doc.line(M, y + 5, W - M, y + 5);
    y += 20;
  }

  // Totales
  if (y > 690) { doc.addPage(); y = 50; }
  const boxX = W - M - 230;
  y += 16;
  doc.setDrawColor(209, 213, 219); doc.line(boxX, y - 8, W - M, y - 8);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(107, 114, 128);
  doc.text('Subtotal', boxX, y + 8); doc.text(money(d.subtotal), xTot - 6, y + 8, { align: 'right' }); y += 22;
  doc.text('IVA', boxX, y + 8); doc.text(money(d.tax), xTot - 6, y + 8, { align: 'right' }); y += 28;
  doc.setFillColor(243, 244, 246); doc.roundedRect(boxX, y - 8, 230, 32, 5, 5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(17, 24, 39);
  doc.text('TOTAL', boxX + 12, y + 12); doc.text(money(d.total), xTot - 12, y + 12, { align: 'right' }); y += 48;

  if (d.notes) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(107, 114, 128);
    doc.text(doc.splitTextToSize(String(d.notes), W - M * 2), M, y);
  }

  const fileName = `${d.invoiceNumber || 'factura'}.pdf`;

  // Dentro de la app de Android la descarga clásica no ocurre (y tampoco lanza
  // error): `savePdf` sube el archivo y abre el enlace https, que el teléfono sí
  // sabe descargar. En el navegador de escritorio baja como siempre.
  await savePdf(doc, fileName);
}

export default downloadInvoicePdf;
