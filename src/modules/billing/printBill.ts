import { posPrinterService } from '@/services/pos/posPrinterService';
import { cacheGet, cacheKey } from '@/utils/offlineCache';
import { billSubtotal, billItemTotal, billService, type Bill } from './types';
import { estimarPromosDeCuenta, type Promotion } from '@/services/promotions/promotionsService';

interface PrintOpts {
  taxEnabled: boolean;
  taxRate: number;          // ej. 0.13
  cashierName?: string;
  partLabel?: string;       // "Parte 1 de 3" en cuentas divididas
  /** Promociones vigentes: el papel tiene que decir lo mismo que la pantalla. */
  promociones?: Promotion[];
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
  /* Las promociones de ESTA cuenta (o de esta parte, si se dividió: la promo
     aplica a lo que lleva cada quien). Mismo motor que la pantalla y que el
     POS; sin esto el papel cantaba un total y la caja cobraba otro. */
  const promos = estimarPromosDeCuenta(
    bill.items.map(it => ({
      product_id: it.product_id ?? '',
      category_id: it.category_id ?? null,
      unit_price: it.quantity ? billItemTotal(it) / it.quantity : 0,
      quantity: it.quantity,
      iva_pct: opts.taxEnabled ? Math.round(opts.taxRate * 100) : 0,
      suelta: !it.product_id,
    })),
    opts.promociones ?? [],
  );
  const neto = Math.max(0, subtotal - promos.descuento);
  const service = billService(neto, bill.is_delivery);   // 10% en mesa, 0 en delivery
  const tax = opts.taxEnabled ? Math.round(neto * opts.taxRate) : 0;
  const total = neto + service + tax;

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

  /* Con promociones en el papel, el 10 % baja a ser una línea del detalle: el
     único renglón de descuento ya está ocupado por ellas. */
  if (promos.descuento > 0 && service > 0) {
    items.push({ name: 'Servicio 10%', quantity: 1, unitPrice: service, subtotal: service });
  }

  await posPrinterService.printAuto(
    {
      invoiceNumber: opts.partLabel ? `${bill.id.slice(-6)} · ${opts.partLabel}` : bill.id.slice(-6),
      date: now.toLocaleDateString('es-CR'),
      time: now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
      items,
      subtotal,
      tax,
      /* El renglón de descuento es UNO solo. Con promociones se usa para
         ellas —que es la plata que el cliente quiere ver— y el servicio pasa a
         ser una línea más, igual que viaja a la factura desde el POS: así el
         papel de la mesa y la factura final se leen iguales. */
      discount: promos.descuento > 0 ? promos.descuento : (service > 0 ? -service : 0),
      discountLabel: promos.descuento > 0 ? 'Promociones' : 'Servicio 10%',
      total,
      paymentMethod: bill.is_delivery ? 'Delivery' : 'Mesa',
      storeName: general?.businessName,
      storeRuc: general?.ruc,
      storeCedula: general?.cedula,
      storeAddress: general?.address,
      storeCity: general?.city,
      storePhone: general?.phone,
      // Mesero responsable de la cuenta (o cajero si no hay).
      cashierName: bill.responsible_name || opts.cashierName,
      customerName: bill.customer_name ?? undefined,
      simplificadoFooter,
    },
    tenantId,
  );
}
