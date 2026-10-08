/**
 * EL HTML DEL COMPROBANTE ELECTRÓNICO (representación impresa).
 *
 * Vive aparte del módulo que lo abre porque es una función PURA: recibe la
 * venta, el emisor, el receptor y la configuración del tiquete, y devuelve el
 * documento. Así se puede armar y revisar sin navegador ni sesión iniciada —el
 * otro módulo importa Supabase y los servicios de la app, y eso lo volvía
 * imposible de mirar sin levantar el sistema entero—.
 */
import { nombreUbicacion } from '@/data/crLocations';

const money = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));

const FE_RESOLUTION = 'Autorizada mediante resolución MH-DGT-RES-0027-2024 del 13 de noviembre del 2024 de la DGTD. Version 4.4';

/**
 * Genera y abre (para imprimir / Guardar como PDF) el comprobante electrónico en
 * formato A4 con logo y todos los detalles. Sirve para factura/tiquete y su NC.
 */
/** Etiqueta del tipo de identificación de Hacienda. */
const TIPO_ID: Record<string, string> = {
  '01': 'Cédula física', '02': 'Cédula jurídica', '03': 'DIMEX', '04': 'NITE', '05': 'Extranjero',
};

/** Condición de venta de Hacienda (las que usa el sistema). */
const CONDICION_VENTA: Record<string, string> = {
  '01': 'Contado', '02': 'Crédito', '03': 'Consignación', '04': 'Apartado',
  '05': 'Arrendamiento con opción de compra', '06': 'Arrendamiento en función financiera',
  '07': 'Cobro a favor de un tercero', '08': 'Servicios prestados al Estado',
  '09': 'Pago de servicios prestados al Estado', '10': 'Venta a crédito en IVA hasta 90 días',
  '99': 'Otros',
};

/** Medio de pago de Hacienda. */
const MEDIO_PAGO: Record<string, string> = {
  '01': 'Efectivo', '02': 'Tarjeta', '03': 'Cheque', '04': 'Transferencia / depósito',
  '05': 'Recaudado por terceros', '06': 'SINPE Móvil', '07': 'Plataforma digital', '99': 'Otros',
};

/** Fecha y hora como la muestra Hacienda: 07-10-2026 22:41:31. */
const fechaHoraCR = (iso?: string): string => {
  if (!iso) return '';
  const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return String(iso);
  const [, y, mo, d, h, mi, se] = m;
  return `${d}-${mo}-${y} ${h}:${mi}${se ? `:${se}` : ''}`;
};

const numero = (v: any) => Number(String(v ?? '0').replace(/,/g, '')) || 0;

/**
 * EL COMPROBANTE SE ARMA CON LO QUE SE LE MANDÓ A HACIENDA.
 *
 * `fe_request` es el documento exacto que salió hacia el proveedor: trae el
 * CABYS de cada línea, la unidad de medida, el impuesto con su tarifa, el
 * código de la sucursal y la terminal, la actividad económica y el bloque de
 * totales. Nada de eso está en las tablas de la venta —el CABYS y la unidad son
 * del producto, y la tarifa se calcula al emitir—, así que un PDF armado solo
 * con la factura siempre iba a mostrar menos de lo que declara el comprobante.
 *
 * Partiendo del documento enviado, el PDF dice EXACTAMENTE lo mismo que el XML
 * y que el PDF del proveedor: no hay dos versiones de la misma venta.
 *
 * Las facturas viejas (antes de que se guardara el documento) caen a los datos
 * de la venta: muestran menos, pero muestran.
 */
function datosDelDocumento(inv: any) {
  const req = inv?.fe_request && typeof inv.fe_request === 'object' ? inv.fe_request : null;
  const idDoc = req?.header?.idDoc ?? {};
  const lineasReq = Array.isArray(req?.itemDetails) ? req.itemDetails : null;
  const totalesReq = req?.totals ?? null;

  const lineas = lineasReq
    ? lineasReq.map((l: any, i: number) => ({
        n: i + 1,
        codigo: l.commercialCode?.[0]?.code ?? '',
        nombre: l.detail ?? 'Producto',
        cabys: l.code ?? '',
        cantidad: numero(l.quantity),
        unidad: l.unitMeasurement ?? '',
        precio: numero(l.unitPrice),
        descuento: numero(l.discounts?.[0]?.amountDiscount ?? l.discounts?.[0]?.amount ?? 0),
        tarifa: numero(l.taxes?.[0]?.fee),
        impuesto: numero(l.taxNet ?? l.taxes?.[0]?.amount),
        total: numero(l.amountTotalLine ?? l.amountTotal),
      }))
    : ((inv.items ?? inv.invoice_items ?? []) as any[]).map((it: any, i: number) => {
        const bruto = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
        const rebaja = Math.round((Number(it.discount_amount) || (bruto - (Number(it.subtotal) || 0))) * 100) / 100;
        return {
          n: i + 1,
          codigo: '',
          nombre: it.product_name ?? 'Producto',
          cabys: '',
          cantidad: Number(it.quantity) || 0,
          unidad: '',
          precio: Number(it.unit_price) || 0,
          descuento: rebaja >= 1 ? rebaja : 0,
          tarifa: null as number | null,
          impuesto: null as number | null,
          total: Number(it.subtotal) || 0,
        };
      });

  // Totales: los del documento enviado si están; si no, los de la venta.
  const montoTotal = totalesReq ? numero(totalesReq.totalSale) : Number(inv.subtotal) + Number(inv.discount_amount ?? 0);
  const descuento = totalesReq ? numero(totalesReq.totalDiscounts) : Number(inv.discount_amount ?? 0);
  const subtotal = totalesReq ? numero(totalesReq.totalNetSale) : Number(inv.subtotal ?? 0);
  const impuesto = totalesReq ? numero(totalesReq.totalTax) : Number(inv.tax_amount ?? 0);
  const otrosCargos = totalesReq ? numero(totalesReq.totalOtherCharges) : 0;
  const total = totalesReq ? numero(totalesReq.totalVoucher) : Number(inv.total ?? 0);

  return {
    deEnvio: !!req,
    sucursal: idDoc.headquarters ?? '',
    terminal: idDoc.terminal ?? '',
    emision: req?.header?.issueDate ?? inv.issued_at,
    actividad: req?.header?.senderEconomicActivity ?? '',
    condicion: req?.header?.saleCondition?.id ?? inv.sale_condition ?? '',
    medioPago: req?.header?.paymentMethod?.[0]?.id ?? '',
    lineas,
    montoTotal, descuento, subtotal, impuesto, otrosCargos, total,
  };
}

/**
 * Genera y abre (para imprimir / Guardar como PDF) el comprobante electrónico en
 * formato A4 con logo y todos los detalles. Sirve para factura/tiquete y su NC.
 */
export function feComprobanteHtml(
  { inv, emisor, receptor, receiptCfg, creditNote }:
  { inv: any; emisor: any; receptor: any; receiptCfg: any; creditNote?: boolean },
): string {
  const isNC = !!creditNote;
  const esFactura = inv.document_type === 'factura_electronica';
  const tipoLabel = isNC ? 'NOTA DE CRÉDITO ELECTRÓNICA' : esFactura ? 'FACTURA ELECTRÓNICA' : 'TIQUETE ELECTRÓNICO';
  const clave = isNC ? (inv.fe_nc_clave ?? '') : (inv.fe_clave ?? '');

  const doc = datosDelDocumento(inv);
  /**
   * El consecutivo de HACIENDA son los 20 dígitos de la clave, no el id del
   * proveedor. `fe_consecutivo` guarda el ULID de Alanube —un identificador
   * interno que al cliente no le sirve para nada y que no es lo que Hacienda
   * reconoce—. Dentro de la clave, el consecutivo va en las posiciones 22 a 41.
   */
  const digitos = String(clave).replace(/\D/g, '');
  const consecutivo = digitos.length === 50 ? digitos.slice(21, 41) : (inv.fe_consecutivo ?? '');

  const logo = (receiptCfg?.showLogo && receiptCfg?.logoUrl) ? receiptCfg.logoUrl : '';

  const ubicacionEmisor = nombreUbicacion(
    emisor?.emisor_province_code, emisor?.emisor_canton_code, emisor?.emisor_district_code);
  const ubicacionReceptor = nombreUbicacion(
    receptor?.province_code, receptor?.canton_code, receptor?.district_code);

  const idEmisor = TIPO_ID[String(emisor?.emisor_identification_type ?? '')] ?? 'Identificación';
  const idReceptor = TIPO_ID[String(receptor?.identification_type ?? '')] ?? 'Identificación';

  const emisorBlock = `
    <div class="party">
      <div class="party-title">Emisor</div>
      <div class="party-name">${esc(emisor?.emisor_name || emisor?.emisor_commercial_name || '')}</div>
      ${emisor?.emisor_commercial_name && emisor?.emisor_commercial_name !== emisor?.emisor_name
        ? `<div>Nombre comercial: ${esc(emisor.emisor_commercial_name)}</div>` : ''}
      ${emisor?.emisor_identification ? `<div>${esc(idEmisor)}: ${esc(emisor.emisor_identification)}</div>` : ''}
      ${emisor?.emisor_address ? `<div>${esc(emisor.emisor_address)}</div>` : ''}
      ${ubicacionEmisor ? `<div>${esc(ubicacionEmisor)}</div>` : ''}
      ${emisor?.emisor_phone ? `<div>Teléfono: ${esc(emisor.emisor_phone)}</div>` : ''}
      ${emisor?.emisor_email ? `<div>${esc(emisor.emisor_email)}</div>` : ''}
    </div>`;

  const receptorBlock = `
    <div class="party">
      <div class="party-title">Receptor</div>
      <div class="party-name">${esc(receptor?.name || inv.customer_name || 'Cliente General')}</div>
      ${receptor?.commercial_name && receptor.commercial_name !== receptor.name
        ? `<div>Nombre comercial: ${esc(receptor.commercial_name)}</div>` : ''}
      ${receptor?.identification ? `<div>${esc(idReceptor)}: ${esc(receptor.identification)}</div>` : ''}
      ${receptor?.address ? `<div>${esc(receptor.address)}</div>` : ''}
      ${ubicacionReceptor ? `<div>${esc(ubicacionReceptor)}</div>` : ''}
      ${receptor?.phone || inv.customer_phone ? `<div>Teléfono: ${esc(receptor?.phone || inv.customer_phone)}</div>` : ''}
      ${receptor?.email || inv.customer_email ? `<div>${esc(receptor?.email || inv.customer_email)}</div>` : ''}
    </div>`;

  /**
   * Condiciones de la venta: es lo que declara el comprobante, no un adorno.
   *
   * La moneda y el tipo de cambio van siempre, aunque sea CRC a 1: un
   * comprobante tiene que decir en qué moneda se cobró.
   */
  const moneda = String(inv.currency ?? 'CRC').toUpperCase();
  const tipoCambio = Number(inv.exchange_rate ?? 0) > 0 ? Number(inv.exchange_rate) : 1;
  const condicionesBlock = `
    <div class="cond">
      <div class="party-title">Condiciones de la venta</div>
      <table class="kv">
        <tr><td>Condición de venta</td><td>${esc(CONDICION_VENTA[String(doc.condicion)] ?? '—')}</td></tr>
        ${doc.medioPago ? `<tr><td>Medio de pago</td><td>${esc(MEDIO_PAGO[String(doc.medioPago)] ?? '—')}</td></tr>` : ''}
        <tr><td>Código de moneda</td><td>${esc(moneda)}</td></tr>
        <tr><td>Tipo de cambio</td><td>${tipoCambio.toLocaleString('es-CR', { maximumFractionDigits: 5 })}</td></tr>
      </table>
    </div>`;

  const conImpuesto = doc.lineas.some((l: any) => l.tarifa != null);
  const rowsHtml = doc.lineas.map((l: any) => `
    <tr>
      <td>${l.n}</td>
      <td class="cod">${esc(l.codigo)}</td>
      <td>
        ${esc(l.nombre)}
        ${l.cabys ? `<div class="cabys">CABYS: ${esc(l.cabys)}</div>` : ''}
      </td>
      <td class="r">${l.cantidad.toLocaleString('es-CR', { maximumFractionDigits: 3 })}</td>
      <td>${esc(l.unidad)}</td>
      <td class="r">${money(l.precio)}</td>
      <td class="r">${l.descuento > 0 ? `−${money(l.descuento)}` : money(0)}</td>
      ${conImpuesto ? `<td class="r">${l.tarifa != null
        ? `${l.tarifa.toLocaleString('es-CR', { minimumFractionDigits: 2 })}%<div class="cabys">${money(l.impuesto ?? 0)}</div>`
        : '—'}</td>` : ''}
      <td class="r"><b>${money(l.total)}</b></td>
    </tr>`).join('');

  /**
   * LAS NOTAS DE LA FACTURA.
   *
   * Es lo que el cajero escribe al cobrar —«Del 04 al 06 de Octubre», el número de
   * comprobante de la transferencia, la orden de compra del cliente— y es el dato
   * por el que después se identifica esa venta. Se guardaba (1.851 facturas lo
   * tienen) y el tiquete térmico lo imprimía, pero ESTE documento —el PDF del
   * comprobante electrónico, justo el que se le manda al cliente— no lo mostraba.
   */
  const nota = String(inv.notes ?? '').trim();
  const notasBlock = nota
    ? `<div class="fe" style="white-space:pre-wrap"><div><b>Notas:</b></div><div>${esc(nota)}</div></div>`
    : '';

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>${tipoLabel} ${esc(inv.invoice_number)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; margin: 0; padding: 24px; font-size: 12px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 12px; gap: 16px; }
  .logo { max-height: 80px; max-width: 220px; object-fit: contain; }
  .doc { text-align: right; }
  .doc h1 { font-size: 16px; margin: 0 0 4px; color: #2563eb; letter-spacing: .5px; }
  .doc .num { font-size: 13px; font-weight: bold; }
  .doc .meta { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .doc .consec { font-family: monospace; font-size: 12px; font-weight: bold; color: #111827; }
  .parties { display: flex; gap: 16px; margin: 16px 0 10px; }
  .party, .cond { flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
  .party-title { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #6b7280; font-weight: bold; margin-bottom: 4px; }
  .party-name { font-weight: bold; font-size: 13px; }
  .cond { margin-bottom: 10px; }
  table.kv td { padding: 2px 0; border: none; font-size: 11px; }
  table.kv td:first-child { color: #6b7280; width: 160px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #f3f4f6; text-align: left; padding: 6px; font-size: 9px; text-transform: uppercase; color: #374151; }
  td { padding: 6px; border-bottom: 1px solid #f0f0f0; font-size: 11px; vertical-align: top; }
  td.r, th.r { text-align: right; }
  td.cod { font-family: monospace; font-size: 10px; color: #6b7280; }
  .cabys { font-family: monospace; font-size: 9px; color: #6b7280; margin-top: 2px; }
  .totals { margin-top: 12px; margin-left: auto; width: 280px; }
  .totals div { display: flex; justify-content: space-between; padding: 3px 0; }
  .totals .grand { border-top: 2px solid #111827; margin-top: 4px; padding-top: 6px; font-size: 15px; font-weight: 900; }
  .fe { margin-top: 16px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; font-size: 11px; }
  .fe .clave { font-family: monospace; word-break: break-all; }
  .foot { margin-top: 16px; text-align: center; font-size: 10px; color: #6b7280; }
  @media print { body { padding: 0; } tr { break-inside: avoid; } }
</style></head><body>
  <div class="head">
    <div>${logo
      ? `<img class="logo" src="${esc(logo)}" alt="logo"/>`
      /**
       * Sin logo va el NOMBRE DEL NEGOCIO, no el nuestro.
       *
       * Acá decía «ColónClick» en azul: nuestra marca impresa en el comprobante
       * fiscal del cliente del cliente, en lugar del negocio que vendió. El que
       * recibe la factura no nos conoce ni tiene por qué.
       */
      : `<div style="font-weight:900;font-size:20px;color:#111827">${
        esc(emisor?.emisor_commercial_name || emisor?.emisor_name || '')}</div>`}</div>
    <div class="doc">
      <h1>${tipoLabel}</h1>
      ${consecutivo ? `<div class="consec">${esc(consecutivo)}</div>` : ''}
      <div class="num">N° interno ${esc(inv.invoice_number)}</div>
      <div class="meta">Fecha y hora de emisión: ${esc(fechaHoraCR(doc.emision))}</div>
      ${doc.actividad ? `<div class="meta">Act. econ. emisor: ${esc(doc.actividad)}</div>` : ''}
      ${doc.sucursal ? `<div class="meta">Sucursal: ${esc(doc.sucursal)}</div>` : ''}
      ${doc.terminal ? `<div class="meta">Terminal: ${esc(doc.terminal)}</div>` : ''}
    </div>
  </div>

  <div class="parties">${emisorBlock}${receptorBlock}</div>

  ${condicionesBlock}

  <table>
    <thead><tr>
      <th>No.</th><th>Código</th><th>Producto / Servicio</th>
      <th class="r">Cant.</th><th>Unidad</th><th class="r">Precio</th><th class="r">Descuento</th>
      ${conImpuesto ? '<th class="r">Impuesto</th>' : ''}<th class="r">Total</th>
    </tr></thead>
    <tbody>${rowsHtml || `<tr><td colspan="${conImpuesto ? 9 : 8}" style="text-align:center;color:#9ca3af">Sin líneas</td></tr>`}</tbody>
  </table>

  <div class="totals">
    <div><span>Monto total</span><span>${money(doc.montoTotal)}</span></div>
    <div><span>Descuento</span><span>−${money(doc.descuento)}</span></div>
    <div><span>Subtotal</span><span>${money(doc.subtotal)}</span></div>
    <div><span>Total IVA</span><span>+${money(doc.impuesto)}</span></div>
    <div><span>Otros cargos</span><span>+${money(doc.otrosCargos)}</span></div>
    <div class="grand"><span>TOTAL</span><span>${money(doc.total)}</span></div>
  </div>

  ${notasBlock}

  ${clave ? `<div class="fe">
    <div><b>Clave numérica:</b></div>
    <div class="clave">${esc(clave)}</div>
    <div style="margin-top:6px">${FE_RESOLUTION}</div>
  </div>` : ''}

  <div class="foot">
    Representación impresa del comprobante electrónico. El documento con validez ante Hacienda es el XML.
  </div>

  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 350); };</script>
</body></html>`;

  return html;
}
