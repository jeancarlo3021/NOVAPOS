import { apiFetch } from '@/lib/api';
import { CartItem } from '@/types/Types_POS';
import { cashMovementsService } from '../cashManagement/cashManagementService';

/** Fecha-hora LOCAL de la máquina en formato ISO SIN zona (wall clock).
 *  Ej: 2026-06-16T21:32:05. Así la hora que se guarda y se muestra es la del
 *  equipo donde se hace la venta, sin corrimiento por UTC. */
export function localNowISO(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  cash_session_id: string;
  invoice_number: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  subtotal: number;
  discount_amount: number;
  discount_percentage: number;
  tax_amount: number;
  total: number;
  payment_method: 'cash' | 'card' | 'sinpe';
  amount_received?: number;
  change_amount?: number;
  voucher_number?: string;
  notes?: string;
  status: 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
}

// ============================================
// INVOICES SERVICE
// ============================================

export const invoicesService = {
  // Obtener todas las facturas
  async getAllInvoices(_tenantId: string) {
    return apiFetch<Invoice[]>('/invoices');
  },

  // Obtener factura por ID
  async getInvoiceById(id: string) {
    return apiFetch<Invoice>('/invoices/' + id);
  },

  // Obtener facturas por sesión de caja
  async getInvoicesBySession(sessionId: string) {
    return apiFetch<Invoice[]>('/invoices?session=' + sessionId);
  },

  // Obtener número de factura siguiente
  async getNextInvoiceNumber(_tenantId: string): Promise<string> {
    return apiFetch<string>('/invoices/next-number');
  },

  // Crear factura - ACTUALIZADO CON NUEVOS CAMPOS
  async createInvoice(
    _tenantId: string,
    sessionId: string,
    cartItems: CartItem[],
    subtotal: number,
    discountAmount: number,
    discountPercentage: number,
    taxAmount: number,
    total: number,
    paymentMethod: 'cash' | 'card' | 'sinpe' | 'credit',
    customerName?: string,
    notes?: string,
    customerPhone?: string,
    amountReceived?: number,
    changeAmount?: number,
    voucherNumber?: string,
    invoiceNumber?: string,
    /** Cajero activo (kiosk mode). Si se omite, el backend usa el del JWT. */
    cashierId?: string | null,
    cashierName?: string | null,
    /** Pagos mixtos: array de splits. Si llega, la columna `payments` se
     *  llena y el `payment_method` queda como el dominante. */
    payments?: { method: 'cash' | 'card' | 'sinpe'; amount: number; voucher_number?: string }[] | null,
    /** Tipo de documento fiscal elegido en el POS. */
    documentType?: 'ticket' | 'tiquete_electronico' | 'factura_electronica',
    /** Cliente seleccionado (para vincular venta a crédito → cuenta por cobrar). */
    customerId?: string | null,
    /** Multimoneda + delivery. */
    currencyInfo?: {
      currency?: 'CRC' | 'USD'; exchangeRate?: number; changeCurrency?: 'CRC' | 'USD';
      isDelivery?: boolean; deliveryCommissionPct?: number; deliveryNet?: number; deliveryPlatform?: string;
    },
  ) {
    // Validaciones según método de pago. En pago mixto (payments con 2+
    // splits) la validación ya la hizo el modal: la suma cuadra con el total y
    // cada split de tarjeta/SINPE tiene comprobante. No revalidamos aquí
    // porque amountReceived es solo la porción efectivo (menor al total).
    const isMixed = !!payments && payments.length > 1;
    if (!isMixed) {
      if (paymentMethod === 'cash') {
        if (!amountReceived || amountReceived < total) {
          throw new Error('Monto recibido inválido para pago en efectivo');
        }
      }
      // El número de comprobante de tarjeta/SINPE es opcional.
    }

    const invoice = await apiFetch<Invoice & { items: CartItem[] }>('/invoices', {
      method: 'POST',
      body: JSON.stringify({
        cash_session_id: sessionId,
        items: cartItems,
        subtotal,
        discount_amount: discountAmount,
        discount_percent: discountPercentage,
        tax_amount: taxAmount,
        total,
        payment_method: paymentMethod,
        customer_id: customerId ?? null,
        customer_name: customerName,
        customer_phone: customerPhone,
        amount_received: paymentMethod === 'cash' ? amountReceived : null,
        change_amount: paymentMethod === 'cash' ? changeAmount : null,
        voucher_number: (paymentMethod === 'card' || paymentMethod === 'sinpe') ? voucherNumber : null,
        notes,
        invoice_number: invoiceNumber, // Preserve offline invoice number if provided
        cashier_id: cashierId ?? null,
        cashier_name: cashierName ?? null,
        payments: payments && payments.length > 1 ? payments : null,
        document_type: documentType ?? 'ticket',
        currency: currencyInfo?.currency ?? 'CRC',
        exchange_rate: currencyInfo?.exchangeRate ?? null,
        change_currency: currencyInfo?.changeCurrency ?? null,
        is_delivery: currencyInfo?.isDelivery ?? false,
        delivery_commission_pct: currencyInfo?.deliveryCommissionPct ?? 0,
        delivery_net: currencyInfo?.deliveryNet ?? null,
        delivery_platform: currencyInfo?.deliveryPlatform ?? null,
        // Hora LOCAL de la máquina (la columna no guarda zona horaria, así el
        // ticket y los reportes muestran la misma hora que el cajero ve).
        issued_at: localNowISO(),
      }),
    });

    // Registrar movimiento de caja — en pago mixto solo entra la porción efectivo.
    // Las porciones de tarjeta/SINPE no afectan el efectivo en caja.
    // En venta a CRÉDITO no entra dinero: no se registra movimiento de caja.
    if (paymentMethod !== 'credit') {
      const cashAmount = (payments && payments.length > 1)
        ? (payments.find(p => p.method === 'cash')?.amount ?? 0)
        : (paymentMethod === 'cash' ? total : total);  // mantiene comportamiento legacy

      await cashMovementsService.createMovement(
        sessionId,
        invoice.tenant_id,
        'sale',
        cashAmount,
        `Venta ${invoice.invoice_number}`,
        invoice.id
      );
    }

    return invoice;
  },

  // Cancelar factura
  async cancelInvoice(invoiceId: string) {
    return apiFetch<Invoice>('/invoices/' + invoiceId + '/void', { method: 'POST' });
  },

  // Anular el PAGO de una factura y dejarla a crédito (con saldo pendiente).
  async toCredit(invoiceId: string) {
    return apiFetch<{ ok: boolean; to_credit: boolean; total: number }>('/invoices/' + invoiceId + '/to-credit', { method: 'POST' });
  },

  // Obtener facturas por rango de fechas
  async getInvoicesByDateRange(
    _tenantId: string,
    startDate: string,
    endDate: string
  ) {
    return apiFetch<Invoice[]>(`/invoices?from=${startDate}&to=${endDate}`);
  },

  // Obtener facturas por método de pago
  async getInvoicesByPaymentMethod(
    _tenantId: string,
    paymentMethod: 'cash' | 'card' | 'sinpe'
  ) {
    return apiFetch<Invoice[]>(`/invoices?payment_method=${paymentMethod}`);
  },

  // Obtener estadísticas de ventas - ACTUALIZADO
  async getSalesStats(_tenantId: string) {
    const data = await apiFetch<Invoice[]>('/invoices?status=completed');

    const totalSales = data.reduce((sum, i) => sum + i.total, 0);
    const totalInvoices = data.length;

    const byPaymentMethod = {
      cash: data.filter((i) => i.payment_method === 'cash').reduce((sum, i) => sum + i.total, 0),
      card: data.filter((i) => i.payment_method === 'card').reduce((sum, i) => sum + i.total, 0),
      sinpe: data.filter((i) => i.payment_method === 'sinpe').reduce((sum, i) => sum + i.total, 0),
    };

    // Calcular total de vuelto en efectivo
    const totalChange = data
      .filter((i) => i.payment_method === 'cash')
      .reduce((sum, i) => sum + (i.change_amount || 0), 0);

    return {
      totalSales,
      totalInvoices,
      averagePerInvoice: totalInvoices > 0 ? totalSales / totalInvoices : 0,
      byPaymentMethod,
      totalChange,
    };
  },

  // Obtener facturas por cliente
  async getInvoicesByCustomer(_tenantId: string, customerName: string) {
    return apiFetch<Invoice[]>(`/invoices?customer=${encodeURIComponent(customerName)}`);
  },

  // Obtener resumen de factura - ACTUALIZADO
  async getInvoiceSummary(invoiceId: string) {
    const invoice = await this.getInvoiceById(invoiceId);

    return {
      invoiceNumber: invoice.invoice_number,
      customerName: invoice.customer_name,
      customerPhone: invoice.customer_phone,
      items: (invoice as unknown as { items: InvoiceItem[] }).items,
      subtotal: invoice.subtotal,
      discountAmount: invoice.discount_amount,
      discountPercentage: invoice.discount_percentage,
      taxAmount: invoice.tax_amount,
      total: invoice.total,
      paymentMethod: invoice.payment_method,
      amountReceived: invoice.amount_received,
      changeAmount: invoice.change_amount,
      voucherNumber: invoice.voucher_number,
      createdAt: invoice.created_at,
      notes: invoice.notes,
    };
  },
};

// ============================================
// INVOICE ITEMS SERVICE
// ============================================

export const invoiceItemsService = {
  // Obtener items de factura
  async getInvoiceItems(invoiceId: string) {
    const invoice = await apiFetch<Invoice & { items: InvoiceItem[] }>('/invoices/' + invoiceId);
    return invoice.items ?? [];
  },

  // Obtener items por producto
  async getItemsByProduct(_tenantId: string, productId: string) {
    return apiFetch<InvoiceItem[]>(`/invoices/items?product_id=${productId}`);
  },

  // Obtener estadísticas de producto
  async getProductStats(tenantId: string, productId: string) {
    const items = await this.getItemsByProduct(tenantId, productId);

    const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
    const totalRevenue = items.reduce((sum, i) => sum + i.subtotal, 0);
    const averagePrice = items.length > 0 ? totalRevenue / totalQuantity : 0;

    return {
      totalQuantity,
      totalRevenue,
      averagePrice,
      totalSales: items.length,
    };
  },
};

// ============================================
// EXPORTS
// ============================================

export const invoiceService = {
  ...invoicesService,
  items: invoiceItemsService,
};
