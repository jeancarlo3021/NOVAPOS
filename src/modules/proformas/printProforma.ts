import type { Proforma } from '@/services/proformas/proformasService';
import { posPrinterService } from '@/services/pos/posPrinterService';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/**
 * Lo que se rebajó en una línea.
 *
 * El descuento por línea puede venir en plata o en porcentaje; se resuelve a
 * plata para poder mostrarlo. Sin esta columna la cotización solo muestra un
 * precio más bajo y el cliente no ve la rebaja que se le hizo, que es
 * justamente el argumento de venta.
 */
const lineaDesc = (it: { quantity: number; unit_price: number; discount_amount?: number; discount_percent?: number }) => {
  const bruto = Number(it.quantity || 0) * Number(it.unit_price || 0);
  const monto = Number(it.discount_amount ?? 0);
  if (monto > 0.004) return monto;
  const pct = Number(it.discount_percent ?? 0);
  return pct > 0 ? Math.round(bruto * pct) / 100 : 0;
};

const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] as string));

/** Imprime la proforma como documento NO fiscal (ventana del navegador).
 *  Incluye el logo del negocio si está activado en la config de recibo. */
export async function printProforma(p: Proforma, tenantId?: string | null): Promise<void> {
  // Logo del negocio (si showLogo + logoUrl en la config de recibo).
  let logo = '';
  let storeName = '';
  if (tenantId) {
    try {
      const cfg: any = await posPrinterService.loadReceiptConfig(tenantId);
      if (cfg?.showLogo && cfg?.logoUrl) logo = cfg.logoUrl;
      storeName = cfg?.businessName || cfg?.storeName || '';
    } catch { /* sin logo */ }
  }

  const hayDescLinea = (p.items ?? []).some(it => lineaDesc(it) > 0.004);

  const rows = (p.items ?? []).map(it => {
    const bruto = Number(it.quantity || 0) * Number(it.unit_price || 0);
    const desc = lineaDesc(it);
    return `
    <tr>
      <td>${esc(it.name)}</td>
      <td style="text-align:center">${it.quantity}</td>
      <td style="text-align:right">${fmt(it.unit_price)}</td>
      ${hayDescLinea ? `<td style="text-align:right;color:#b45309">${desc > 0.004 ? `-${fmt(desc)}` : '—'}</td>` : ''}
      <td style="text-align:right">${fmt(bruto - desc)}</td>
    </tr>`;
  }).join('');

  const descGeneral = Number((p as any).discount_amount ?? 0);

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.number ?? 'Proforma')}</title>
  <style>
    * { font-family: system-ui, -apple-system, Arial, sans-serif; }
    body { margin: 32px; color: #111827; }
    h1 { font-size: 22px; margin: 14px 0 16px; }
    .meta { color: #6b7280; font-size: 12.5px; margin: 6px 0; }
    .muted { color: #6b7280; font-size: 12px; }
    .badge { display:inline-block; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:4px 12px; border-radius:999px; font-size:11px; font-weight:800; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 30px; font-size: 13px; }
    th, td { padding: 10px 6px; border-bottom: 1px solid #f3f4f6; }
    th { text-align: left; color:#6b7280; font-size:11px; text-transform:uppercase; }
    .tot { margin-top: 26px; text-align: right; font-size: 13px; }
    .tot .row { margin: 7px 0; color:#4b5563; }
    .tot .grand { display:inline-block; margin-top: 12px; font-size: 20px; font-weight: 900;
                  background:#f3f4f6; border:1px solid #e5e7eb; border-radius: 10px; padding: 12px 20px; }
    .foot { margin-top: 36px; color:#9ca3af; font-size: 11px; }
    .logo { max-height: 80px; max-width: 240px; object-fit: contain; display:block; margin-bottom: 14px; }
    .store { font-weight: 800; font-size: 17px; margin-bottom: 14px; }
  </style></head><body>
    ${logo ? `<img class="logo" src="${esc(logo)}" alt="logo"/>` : ''}
    ${storeName ? `<div class="store">${esc(storeName)}</div>` : ''}
    <span class="badge">PROFORMA · NO ES FACTURA</span>
    <h1>Cotización ${esc(p.number ?? '')}</h1>
    <div class="meta">Fecha: ${new Date(p.created_at).toLocaleDateString('es-CR')}${p.valid_until ? ` &nbsp;·&nbsp; Vigencia: ${new Date(p.valid_until + 'T00:00:00').toLocaleDateString('es-CR')}` : ''}</div>
    <div class="meta">Cliente: ${esc(p.customer_name || 'Cliente de contado')}${p.customer_identification ? ` &nbsp;·&nbsp; ${esc(p.customer_identification)}` : ''}</div>
    <table>
      <thead><tr><th>Producto</th><th style="text-align:center">Cant.</th><th style="text-align:right">Precio</th>${hayDescLinea ? '<th style="text-align:right">Desc.</th>' : ''}<th style="text-align:right">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="tot">
      ${descGeneral > 0.004 ? `<div class="row" style="color:#b45309;font-weight:700">Descuento${p.discount_percent ? ` (${p.discount_percent}%)` : ''}: -${fmt(descGeneral)}</div>` : ''}
      <div class="row">Subtotal: ${fmt(p.subtotal)}</div>
      <div class="row">IVA: ${fmt(p.tax)}</div>
      <div class="grand">Total: ${fmt(p.total)}</div>
    </div>
    ${p.notes ? `<div class="muted" style="margin-top:12px">Notas: ${esc(p.notes)}</div>` : ''}
    <div class="foot">Documento no fiscal. Precios sujetos a cambio según vigencia.</div>
    <script>window.onload = function(){ window.print(); }</script>
  </body></html>`;

  const w = window.open('', '_blank', 'width=800,height=600');
  if (!w) { alert('Habilitá las ventanas emergentes para imprimir la proforma.'); return; }
  w.document.write(html);
  w.document.close();
}

/** Imprime la proforma en la impresora de TICKET (térmica) configurada. */
export async function printProformaTicket(p: Proforma, tenantId: string): Promise<void> {
  const now = new Date();
  await posPrinterService.printAuto({
    invoiceNumber: p.number ?? 'PROFORMA',
    date: now.toLocaleDateString('es-CR'),
    time: now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
    // El subtotal de cada línea va YA rebajado, y el descuento general se
    // muestra aparte. En el tiquete no había ni rastro del descuento: el
    // cliente leía precios más bajos sin saber que se le hizo una rebaja.
    items: (p.items ?? []).map(it => ({
      name: it.name, quantity: it.quantity, unitPrice: it.unit_price,
      subtotal: (it.quantity * it.unit_price) - lineaDesc(it),
    })),
    subtotal: p.subtotal,
    tax: p.tax,
    total: p.total,
    discount: Number((p as any).discount_amount ?? 0) || undefined,
    discountLabel: p.discount_percent ? `Descuento (${p.discount_percent}%)` : 'Descuento',
    paymentMethod: 'PROFORMA',
    customerName: p.customer_name ?? undefined,
    copyLabel: 'PROFORMA - NO ES FACTURA',
    footerMessage: p.valid_until
      ? `Vigencia: ${new Date(p.valid_until + 'T00:00:00').toLocaleDateString('es-CR')} · Documento no fiscal`
      : 'Documento no fiscal',
  } as any, tenantId);
}
