import { jsPDF } from 'jspdf';
import { nombreUbicacion } from '@/data/crLocations';
import { montoPdf as money } from '@/utils/montoPdf';
import {
  datosDelDocumento, fechaHoraCR,
  TIPO_ID, CONDICION_VENTA, MEDIO_PAGO, FE_RESOLUTION,
} from './feComprobanteHtml';

/**
 * EL COMPROBANTE COMO ARCHIVO PDF.
 *
 * Mismo contenido que la vista de impresión —los dos salen de
 * `datosDelDocumento`, o sea del documento que se le envió a Hacienda—, pero
 * dibujado con jsPDF para que se pueda BAJAR. Ver `feComprobantePdf.ts`, que es
 * el que carga los datos y lo guarda.
 */

/** Ancho de columna en puntos, sobre el área útil de una A4 con márgenes de 40. */
interface Columna { titulo: string; ancho: number; derecha?: boolean }

/**
 * Arma el comprobante como documento jsPDF. FUNCIÓN PURA: recibe los datos ya
 * cargados y no toca la ventana ni la red, así que se puede generar y revisar
 * sin navegador ni sesión —que es como se encuentra lo que le falta—.
 */
export function construirComprobantePdf(
  { inv, emisor, receptor, creditNote }:
  { inv: any; emisor: any; receptor: any; creditNote?: boolean },
): { pdf: jsPDF; nombreArchivo: string } {
  const isNC = !!creditNote;
  const esFactura = inv.document_type === 'factura_electronica';
  const tipoLabel = isNC ? 'NOTA DE CRÉDITO ELECTRÓNICA'
    : esFactura ? 'FACTURA ELECTRÓNICA' : 'TIQUETE ELECTRÓNICO';
  const clave = String((isNC ? inv.fe_nc_clave : inv.fe_clave) ?? '');
  const digitos = clave.replace(/\D/g, '');
  const consecutivo = digitos.length === 50 ? digitos.slice(21, 41) : String(inv.fe_consecutivo ?? '');
  const doc = datosDelDocumento(inv);

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 40;
  const util = W - M * 2;
  let y = 46;

  const texto = (t: string, x: number, size = 9, estilo: 'normal' | 'bold' = 'normal', color = '#1f2937') => {
    pdf.setFont('helvetica', estilo).setFontSize(size).setTextColor(color);
    pdf.text(t, x, y);
  };
  const derecha = (t: string, size = 9, estilo: 'normal' | 'bold' = 'normal', color = '#1f2937') => {
    pdf.setFont('helvetica', estilo).setFontSize(size).setTextColor(color);
    pdf.text(t, W - M, y, { align: 'right' });
  };
  /** Salta de página cuando lo que viene no cabe: nada se corta a la mitad. */
  const sitio = (alto: number) => {
    if (y + alto > H - M) { pdf.addPage(); y = 46; }
  };

  // ── Encabezado: negocio a la izquierda, documento a la derecha ──
  const nombreNegocio = String(emisor?.emisor_commercial_name || emisor?.emisor_name || '');
  texto(nombreNegocio, M, 16, 'bold', '#111827');
  derecha(tipoLabel, 13, 'bold', '#2563eb');
  y += 16;
  if (consecutivo) { derecha(consecutivo, 10, 'bold', '#111827'); y += 12; }
  derecha(`N° interno ${inv.invoice_number}`, 9, 'bold'); y += 12;
  derecha(`Fecha y hora de emisión: ${fechaHoraCR(doc.emision)}`, 8, 'normal', '#6b7280'); y += 11;
  if (doc.actividad) { derecha(`Act. econ. emisor: ${doc.actividad}`, 8, 'normal', '#6b7280'); y += 11; }
  if (doc.sucursal) { derecha(`Sucursal: ${doc.sucursal}`, 8, 'normal', '#6b7280'); y += 11; }
  if (doc.terminal) { derecha(`Terminal: ${doc.terminal}`, 8, 'normal', '#6b7280'); y += 11; }
  y += 6;
  pdf.setDrawColor('#2563eb').setLineWidth(1.5).line(M, y, W - M, y);
  y += 18;

  // ── Emisor y receptor, uno al lado del otro ──
  const ubicacionEmisor = nombreUbicacion(
    emisor?.emisor_province_code, emisor?.emisor_canton_code, emisor?.emisor_district_code);
  const ubicacionReceptor = nombreUbicacion(
    receptor?.province_code, receptor?.canton_code, receptor?.district_code);

  const bloqueEmisor = [
    String(emisor?.emisor_name || nombreNegocio),
    emisor?.emisor_commercial_name && emisor?.emisor_commercial_name !== emisor?.emisor_name
      ? `Nombre comercial: ${emisor.emisor_commercial_name}` : '',
    emisor?.emisor_identification
      ? `${TIPO_ID[String(emisor?.emisor_identification_type ?? '')] ?? 'Identificación'}: ${emisor.emisor_identification}` : '',
    emisor?.emisor_address ?? '', ubicacionEmisor,
    emisor?.emisor_phone ? `Teléfono: ${emisor.emisor_phone}` : '',
    emisor?.emisor_email ?? '',
  ].filter(Boolean);
  const bloqueReceptor = [
    String(receptor?.name || inv.customer_name || 'Cliente General'),
    receptor?.commercial_name && receptor.commercial_name !== receptor.name
      ? `Nombre comercial: ${receptor.commercial_name}` : '',
    receptor?.identification
      ? `${TIPO_ID[String(receptor?.identification_type ?? '')] ?? 'Identificación'}: ${receptor.identification}` : '',
    receptor?.address ?? '', ubicacionReceptor,
    receptor?.phone || inv.customer_phone ? `Teléfono: ${receptor?.phone || inv.customer_phone}` : '',
    receptor?.email || inv.customer_email || '',
  ].filter(Boolean);

  const anchoCaja = (util - 14) / 2;
  const partes = (titulo: string, lineas: string[], x: number): number => {
    let yy = y;
    pdf.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor('#6b7280');
    pdf.text(titulo.toUpperCase(), x + 8, yy + 13);
    yy += 25;
    lineas.forEach((l, i) => {
      pdf.setFont('helvetica', i === 0 ? 'bold' : 'normal').setFontSize(i === 0 ? 9.5 : 8.5)
        .setTextColor(i === 0 ? '#111827' : '#374151');
      for (const trozo of pdf.splitTextToSize(String(l), anchoCaja - 16)) {
        pdf.text(trozo, x + 8, yy);
        yy += i === 0 ? 12 : 11;
      }
    });
    return yy + 6;
  };
  const yPartes = Math.max(
    partes('Emisor', bloqueEmisor, M),
    partes('Receptor', bloqueReceptor, M + anchoCaja + 14));
  pdf.setDrawColor('#e5e7eb').setLineWidth(0.7);
  pdf.roundedRect(M, y, anchoCaja, yPartes - y, 5, 5);
  pdf.roundedRect(M + anchoCaja + 14, y, anchoCaja, yPartes - y, 5, 5);
  y = yPartes + 14;

  // ── Condiciones de la venta ──
  const moneda = String(inv.currency ?? 'CRC').toUpperCase();
  const tipoCambio = Number(inv.exchange_rate ?? 0) > 0 ? Number(inv.exchange_rate) : 1;
  const condiciones: Array<[string, string]> = [
    ['Condición de venta', CONDICION_VENTA[String(doc.condicion)] ?? '—'],
    ...(doc.medioPago ? [['Medio de pago', MEDIO_PAGO[String(doc.medioPago)] ?? '—'] as [string, string]] : []),
    ['Código de moneda', moneda],
    ['Tipo de cambio', tipoCambio.toLocaleString('es-CR', { maximumFractionDigits: 5 })],
  ];
  sitio(30 + condiciones.length * 12);
  const yCond = y;
  pdf.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor('#6b7280');
  pdf.text('CONDICIONES DE LA VENTA', M + 8, y + 13);
  y += 25;
  for (const [k, v] of condiciones) {
    pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor('#6b7280');
    pdf.text(k, M + 8, y);
    pdf.setTextColor('#111827');
    pdf.text(String(v), M + 160, y);
    y += 12;
  }
  pdf.setDrawColor('#e5e7eb').roundedRect(M, yCond, util, y - yCond + 2, 5, 5);
  y += 20;

  // ── Detalle ──
  const conImpuesto = doc.lineas.some((l: any) => l.tarifa != null);
  const cols: Columna[] = [
    { titulo: 'No.', ancho: 22 },
    { titulo: 'Código', ancho: 46 },
    { titulo: 'Producto / Servicio', ancho: conImpuesto ? 150 : 196 },
    { titulo: 'Cant.', ancho: 34, derecha: true },
    { titulo: 'Unidad', ancho: 38 },
    { titulo: 'Precio', ancho: 62, derecha: true },
    { titulo: 'Descuento', ancho: 56, derecha: true },
    ...(conImpuesto ? [{ titulo: 'Impuesto', ancho: 56, derecha: true } as Columna] : []),
    { titulo: 'Total', ancho: 66, derecha: true },
  ];
  const xDe = (i: number) => M + cols.slice(0, i).reduce((a, c) => a + c.ancho, 0);

  const encabezadoTabla = () => {
    pdf.setFillColor('#f3f4f6').rect(M, y - 10, util, 16, 'F');
    pdf.setFont('helvetica', 'bold').setFontSize(7).setTextColor('#374151');
    cols.forEach((c, i) => {
      const x = xDe(i);
      pdf.text(c.titulo.toUpperCase(), c.derecha ? x + c.ancho - 3 : x + 3, y, { align: c.derecha ? 'right' : 'left' });
    });
    y += 14;
  };
  sitio(60);
  encabezadoTabla();

  for (const l of doc.lineas) {
    const nombreLineas: string[] = pdf.setFont('helvetica', 'normal').setFontSize(8)
      .splitTextToSize(String(l.nombre), cols[2].ancho - 6);
    const alto = Math.max(14, nombreLineas.length * 10 + (l.cabys ? 9 : 0) + 6);
    if (y + alto > H - M) { pdf.addPage(); y = 46; encabezadoTabla(); }

    const base = y;
    pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor('#1f2937');
    pdf.text(String(l.n), xDe(0) + 3, base);
    pdf.setFontSize(7.5).setTextColor('#6b7280');
    pdf.text(String(l.codigo ?? ''), xDe(1) + 3, base);
    pdf.setFontSize(8).setTextColor('#1f2937');
    nombreLineas.forEach((t: string, i: number) => pdf.text(t, xDe(2) + 3, base + i * 10));
    if (l.cabys) {
      pdf.setFontSize(6.5).setTextColor('#6b7280');
      pdf.text(`CABYS: ${l.cabys}`, xDe(2) + 3, base + nombreLineas.length * 10);
      pdf.setFontSize(8).setTextColor('#1f2937');
    }
    pdf.text(l.cantidad.toLocaleString('es-CR', { maximumFractionDigits: 3 }), xDe(3) + cols[3].ancho - 3, base, { align: 'right' });
    pdf.text(String(l.unidad ?? ''), xDe(4) + 3, base);
    pdf.text(money(l.precio), xDe(5) + cols[5].ancho - 3, base, { align: 'right' });
    pdf.text(l.descuento > 0 ? `-${money(l.descuento)}` : money(0), xDe(6) + cols[6].ancho - 3, base, { align: 'right' });
    if (conImpuesto) {
      const x = xDe(7) + cols[7].ancho - 3;
      pdf.text(l.tarifa != null ? `${l.tarifa.toLocaleString('es-CR', { minimumFractionDigits: 2 })}%` : '—', x, base, { align: 'right' });
      if (l.impuesto != null) {
        pdf.setFontSize(6.5).setTextColor('#6b7280');
        pdf.text(money(l.impuesto), x, base + 9, { align: 'right' });
        pdf.setFontSize(8).setTextColor('#1f2937');
      }
    }
    pdf.setFont('helvetica', 'bold');
    pdf.text(money(l.total), xDe(cols.length - 1) + cols[cols.length - 1].ancho - 3, base, { align: 'right' });

    y = base + alto;
    pdf.setDrawColor('#f0f0f0').setLineWidth(0.5).line(M, y - 8, W - M, y - 8);
  }

  // ── Totales ──
  const totales: Array<[string, string, boolean]> = [
    ['Monto total', money(doc.montoTotal), false],
    ['Descuento', `-${money(doc.descuento)}`, false],
    ['Subtotal', money(doc.subtotal), false],
    ['Total IVA', `+${money(doc.impuesto)}`, false],
    ['Otros cargos', `+${money(doc.otrosCargos)}`, false],
    ['TOTAL', money(doc.total), true],
  ];
  sitio(totales.length * 14 + 20);
  y += 10;
  const xTot = W - M - 220;
  for (const [k, v, fuerte] of totales) {
    if (fuerte) {
      pdf.setDrawColor('#111827').setLineWidth(1).line(xTot, y - 10, W - M, y - 10);
      y += 4;
    }
    pdf.setFont('helvetica', fuerte ? 'bold' : 'normal').setFontSize(fuerte ? 12 : 9)
      .setTextColor(fuerte ? '#111827' : '#374151');
    pdf.text(k, xTot, y);
    pdf.text(v, W - M, y, { align: 'right' });
    y += fuerte ? 18 : 13;
  }

  // ── Nota de la factura ──
  const nota = String(inv.notes ?? '').trim();
  if (nota) {
    const lineasNota: string[] = pdf.setFont('helvetica', 'normal').setFontSize(8.5)
      .splitTextToSize(nota, util - 16);
    sitio(lineasNota.length * 11 + 34);
    const yNota = y;
    pdf.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor('#111827');
    pdf.text('Notas:', M + 8, y + 15);
    y += 27;
    pdf.setFont('helvetica', 'normal').setTextColor('#374151');
    for (const t of lineasNota) { pdf.text(t, M + 8, y); y += 11; }
    pdf.setDrawColor('#e5e7eb').setLineWidth(0.7).roundedRect(M, yNota, util, y - yNota + 2, 5, 5);
    y += 18;
  }

  // ── Clave y leyenda ──
  if (clave) {
    sitio(60);
    const yClave = y;
    pdf.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor('#111827');
    pdf.text('Clave numérica:', M + 8, y + 15);
    y += 27;
    pdf.setFont('courier', 'normal').setFontSize(8.5).setTextColor('#374151');
    for (const t of pdf.splitTextToSize(clave, util - 16)) { pdf.text(t, M + 8, y); y += 11; }
    pdf.setFont('helvetica', 'normal').setFontSize(7.5);
    y += 3;
    for (const t of pdf.splitTextToSize(FE_RESOLUTION, util - 16)) { pdf.text(t, M + 8, y); y += 10; }
    pdf.setDrawColor('#e5e7eb').roundedRect(M, yClave, util, y - yClave + 2, 5, 5);
    y += 18;
  }

  sitio(20);
  pdf.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor('#6b7280');
  pdf.text('Representación impresa del comprobante electrónico. El documento con validez ante Hacienda es el XML.',
    W / 2, y, { align: 'center' });

  // El logo no se dibuja: jsPDF necesita la imagen convertida y, si falla la
  // descarga, el archivo queda a medias. El nombre del negocio va como título.

  return { pdf, nombreArchivo: `${isNC ? 'NC-' : ''}${(digitos || inv.invoice_number)}.pdf` };
}
