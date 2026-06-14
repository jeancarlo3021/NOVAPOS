import { posPrinterService } from '@/services/pos/posPrinterService';
import { cacheGet, cacheKey } from '@/utils/offlineCache';
import { billSubtotal, billItemTotal, type Bill } from './types';

interface PrintOpts {
  taxEnabled: boolean;
  taxRate: number;          // ej. 0.13
  cashierName?: string;
  partLabel?: string;       // "Parte 1 de 3" en cuentas divididas
}

/**
 * Imprime el ticket de una cuenta de restaurante usando el mismo motor del POS.
 * Cada modifier se lista como sub-línea del plato. Soporta régimen simplificado
 * leyendo la config de Settings → General / FE (igual que el POS).
 */
export async function printBillTicket(tenantId: string, bill: Bill, opts: PrintOpts): Promise<void> {
  const cachedGeneral = cacheGet<any>(cacheKey(tenantId, 'settings_general'))
                      ?? cacheGet<any>(cacheKey(tenantId, 'general_settings'));
  const general = cachedGeneral?.config ?? cachedGeneral;

  const cachedFe = cacheGet<any>(cacheKey(tenantId, 'settings_electronic-invoice'))
                 ?? cacheGet<any>(cacheKey(tenantId, 'electronic-invoice'));
  const feConfig = cachedFe?.config ?? cachedFe;
  const simplificadoFooter = !!(feConfig?.simplificado || general?.simplificado);

  const subtotal = billSubtotal(bill);
  const tax = opts.taxEnabled ? Math.round(subtotal * opts.taxRate) : 0;
  const total = subtotal + tax;

  const now = new Date();

  // Construir items: cada plato + sus modifiers como detalle en el nombre.
  const items = bill.items.map(it => {
    const modText = (it.modifiers && it.modifiers.length > 0)
      ? '\n  + ' + it.modifiers.map(m => m.name).join(', ')
      : '';
    const noteText = it.notes ? `\n  * ${it.notes}` : '';
    return {
      name: `${it.name}${modText}${noteText}`,
      quantity: it.quantity,
      unitPrice: billItemTotal(it) / it.quantity,
      subtotal: billItemTotal(it),
    };
  });

  await posPrinterService.printAuto(
    {
      invoiceNumber: opts.partLabel ? `${bill.id.slice(-6)} · ${opts.partLabel}` : bill.id.slice(-6),
      date: now.toLocaleDateString('es-CR'),
      time: now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
      items,
      subtotal,
      tax,
      total,
      paymentMethod: 'Mesa',
      storeName: general?.businessName,
      storeRuc: general?.ruc,
      storeCedula: general?.cedula,
      storeAddress: general?.address,
      storeCity: general?.city,
      storePhone: general?.phone,
      cashierName: opts.cashierName,
      customerName: bill.customer_name ?? undefined,
      simplificadoFooter,
    },
    tenantId,
  );
}
