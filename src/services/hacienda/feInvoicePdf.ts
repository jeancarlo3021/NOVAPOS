import { apiFetch } from '@/lib/api';
import { invoicesService } from '@/services/invoice/invoiceService';
import { customersService } from '@/services/customers/customersService';

const money = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
const fechaCR = (iso?: string) => {
  if (!iso) return '';
  const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return String(iso);
  const [, y, mo, d, h, mi] = m;
  return `${d}/${mo}/${y} ${h}:${mi}`;
};

const FE_RESOLUTION = 'Autorizada mediante resolución MH-DGT-RES-0027-2024 del 13 de noviembre del 2024 de la DGTD. Version 4.4';

/**
 * Genera y abre (para imprimir / Guardar como PDF) el comprobante electrónico en
 * formato A4 con logo y todos los detalles. Sirve para factura/tiquete y su NC.
 */
export async function openFeInvoicePdf(invoiceId: string, opts: { creditNote?: boolean } = {}) {
  const [inv, emisor, receiptCfg] = await Promise.all([
    invoicesService.getInvoiceById(invoiceId) as any,
    apiFetch<any>('/settings/electronic-invoice').catch(() => ({})),
    apiFetch<any>('/settings/receipt').catch(() => ({})),
  ]);
  if (!inv) throw new Error('Factura no encontrada');

  let receptor: any = null;
  if (inv.customer_id) receptor = await customersService.get(inv.customer_id).catch(() => null);

  const isNC = !!opts.creditNote;
  const esFactura = inv.document_type === 'factura_electronica';
  const tipoLabel = isNC ? 'NOTA DE CRÉDITO ELECTRÓNICA' : esFactura ? 'FACTURA ELECTRÓNICA' : 'TIQUETE ELECTRÓNICO';
  const clave = isNC ? (inv.fe_nc_clave ?? '') : (inv.fe_clave ?? '');
  const consecutivo = isNC ? '' : (inv.fe_consecutivo ?? '');

  const logo = (receiptCfg?.showLogo && receiptCfg?.logoUrl) ? receiptCfg.logoUrl : '';
  const items: any[] = inv.items ?? inv.invoice_items ?? [];

  const emisorBlock = `
    <div class="party">
      <div class="party-title">Emisor</div>
      <div class="party-name">${esc(emisor?.emisor_name || emisor?.emisor_commercial_name || '')}</div>
      ${emisor?.emisor_identification ? `<div>Cédula: ${esc(emisor.emisor_identification)}</div>` : ''}
      ${emisor?.emisor_address ? `<div>${esc(emisor.emisor_address)}</div>` : ''}
      ${emisor?.emisor_phone ? `<div>Tel: ${esc(emisor.emisor_phone)}</div>` : ''}
      ${emisor?.emisor_email ? `<div>${esc(emisor.emisor_email)}</div>` : ''}
      ${emisor?.economic_activity_code ? `<div>Actividad: ${esc(emisor.economic_activity_code)}</div>` : ''}
    </div>`;

  const receptorBlock = `
    <div class="party">
      <div class="party-title">Receptor</div>
      <div class="party-name">${esc(receptor?.name || inv.customer_name || 'Cliente General')}</div>
      ${receptor?.identification ? `<div>Cédula: ${esc(receptor.identification)}</div>` : ''}
      ${receptor?.address ? `<div>${esc(receptor.address)}</div>` : ''}
      ${receptor?.phone ? `<div>Tel: ${esc(receptor.phone)}</div>` : ''}
      ${receptor?.email ? `<div>${esc(receptor.email)}</div>` : ''}
    </div>`;

  const rowsHtml = items.map((it, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(it.product_name ?? 'Producto')}</td>
      <td class="r">${Number(it.quantity)}</td>
      <td class="r">${money(Number(it.unit_price))}</td>
      <td class="r">${money(Number(it.subtotal))}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>${tipoLabel} ${esc(inv.invoice_number)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; margin: 0; padding: 24px; font-size: 12px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 12px; }
  .logo { max-height: 80px; max-width: 220px; object-fit: contain; }
  .doc { text-align: right; }
  .doc h1 { font-size: 16px; margin: 0 0 4px; color: #2563eb; letter-spacing: .5px; }
  .doc .num { font-size: 13px; font-weight: bold; }
  .doc .meta { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .parties { display: flex; gap: 16px; margin: 16px 0; }
  .party { flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
  .party-title { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #6b7280; font-weight: bold; margin-bottom: 4px; }
  .party-name { font-weight: bold; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #f3f4f6; text-align: left; padding: 8px; font-size: 10px; text-transform: uppercase; color: #374151; }
  td { padding: 8px; border-bottom: 1px solid #f0f0f0; }
  td.r, th.r { text-align: right; }
  .totals { margin-top: 12px; margin-left: auto; width: 260px; }
  .totals div { display: flex; justify-content: space-between; padding: 3px 0; }
  .totals .grand { border-top: 2px solid #111827; margin-top: 4px; padding-top: 6px; font-size: 15px; font-weight: 900; }
  .fe { margin-top: 20px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; font-size: 11px; }
  .fe .clave { font-family: monospace; word-break: break-all; }
  .foot { margin-top: 16px; text-align: center; font-size: 10px; color: #6b7280; }
  @media print { body { padding: 0; } }
</style></head><body>
  <div class="head">
    <div>${logo ? `<img class="logo" src="${esc(logo)}" alt="logo"/>` : `<div style="font-weight:900;font-size:20px;color:#2563eb">ColónClick</div>`}</div>
    <div class="doc">
      <h1>${tipoLabel}</h1>
      <div class="num">N° ${esc(inv.invoice_number)}</div>
      <div class="meta">${fechaCR(inv.issued_at)}</div>
      ${consecutivo ? `<div class="meta">Consecutivo: ${esc(consecutivo)}</div>` : ''}
    </div>
  </div>

  <div class="parties">${emisorBlock}${receptorBlock}</div>

  <table>
    <thead><tr><th>#</th><th>Descripción</th><th class="r">Cant.</th><th class="r">P. Unit</th><th class="r">Subtotal</th></tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="5" style="text-align:center;color:#9ca3af">Sin líneas</td></tr>'}</tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span>${money(Number(inv.subtotal))}</span></div>
    ${Number(inv.tax_amount) > 0 ? `<div><span>Impuesto (IVA)</span><span>${money(Number(inv.tax_amount))}</span></div>` : ''}
    <div class="grand"><span>TOTAL</span><span>${money(Number(inv.total))}</span></div>
  </div>

  ${clave ? `<div class="fe">
    <div><b>Clave numérica:</b></div>
    <div class="clave">${esc(clave)}</div>
    <div style="margin-top:6px">${FE_RESOLUTION}</div>
  </div>` : ''}

  <div class="foot">Documento generado por ColónClick</div>

  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 350); };</script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) throw new Error('El navegador bloqueó la ventana. Permití las ventanas emergentes.');
  w.document.write(html);
  w.document.close();
}
