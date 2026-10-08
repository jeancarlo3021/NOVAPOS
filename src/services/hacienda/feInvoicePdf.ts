import { apiFetch } from '@/lib/api';
import { invoicesService } from '@/services/invoice/invoiceService';
import { customersService } from '@/services/customers/customersService';
import { feComprobanteHtml } from './feComprobanteHtml';

export async function openFeInvoicePdf(invoiceId: string, opts: { creditNote?: boolean } = {}) {
  const [inv, emisor, receiptCfg] = await Promise.all([
    invoicesService.getInvoiceById(invoiceId) as any,
    apiFetch<any>('/settings/electronic-invoice').catch(() => ({})),
    apiFetch<any>('/settings/receipt').catch(() => ({})),
  ]);
  if (!inv) throw new Error('Factura no encontrada');

  let receptor: any = null;
  if (inv.customer_id) receptor = await customersService.get(inv.customer_id).catch(() => null);

  const html = feComprobanteHtml({ inv, emisor, receptor, receiptCfg, creditNote: !!opts.creditNote });

  const w = window.open('', '_blank');
  if (!w) throw new Error('El navegador bloqueó la ventana. Permití las ventanas emergentes.');
  w.document.write(html);
  w.document.close();
}

/**
 * Arma el HTML del comprobante. FUNCIÓN PURA: recibe los datos ya cargados.
 *
 * Va aparte de `openFeInvoicePdf` para poder revisar el documento sin abrir el
 * navegador ni iniciar sesión: con los datos de una venta real se arma el HTML
 * y se compara contra el comprobante del proveedor, que es la única forma de
 * saber si al PDF le falta algo.
 */
