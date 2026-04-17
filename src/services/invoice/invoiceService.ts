import { supabase } from '@/lib/supabase';
import { CartItem } from '@/types/Types_POS';
import { cashMovementsService } from '../cashManagement/cashManagementService';

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
  async getAllInvoices(tenantId: string) {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        items:invoice_items(*)
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Obtener factura por ID
  async getInvoiceById(id: string) {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        items:invoice_items(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  // Obtener facturas por sesión de caja
  async getInvoicesBySession(sessionId: string) {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        items:invoice_items(*)
      `)
      .eq('cash_session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Obtener número de factura siguiente
  async getNextInvoiceNumber(tenantId: string): Promise<string> {
    const { data, error } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    if (!data) {
      return 'INV-001';
    }

    const lastNumber = parseInt(data.invoice_number.split('-')[1]) || 0;
    const nextNumber = lastNumber + 1;
    return `INV-${String(nextNumber).padStart(3, '0')}`;
  },

  // Crear factura
  async createInvoice(
    tenantId: string,
    sessionId: string,
    cartItems: CartItem[],
    subtotal: number,
    discountAmount: number,
    discountPercentage: number,
    taxAmount: number,
    total: number,
    paymentMethod: 'cash' | 'card' | 'sinpe',
    customerName?: string,
    notes?: string,
    customerPhone?: string
  ) {
    // Obtener número de factura
    const invoiceNumber = await this.getNextInvoiceNumber(tenantId);

    // Crear factura
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert([
        {
          tenant_id: tenantId,
          cash_session_id: sessionId,
          invoice_number: invoiceNumber,
          customer_name: customerName,
          customer_phone: customerPhone,
          subtotal,
          discount_amount: discountAmount,
          discount_percentage: discountPercentage,
          tax_amount: taxAmount,
          total,
          payment_method: paymentMethod,
          notes,
          status: 'completed',
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (invoiceError) throw invoiceError;

    // Crear items de factura
    const items = cartItems.map((item) => ({
      invoice_id: invoice.id,
      product_id: item.product_id,
      product_name: item.product.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.subtotal,
      created_at: new Date().toISOString(),
    }));

    const { error: itemsError } = await supabase
      .from('invoice_items')
      .insert(items);

    if (itemsError) throw itemsError;

    // Registrar movimiento de caja
    await cashMovementsService.createMovement(
      sessionId,
      tenantId,
      'sale',
      total,
      `Venta ${invoiceNumber}`,
      invoice.id
    );

    // Actualizar stock de productos
    for (const item of cartItems) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('stock_quantity')
        .eq('id', item.product_id)
        .single();

      if (productError) throw productError;

      const newStock = (product.stock_quantity || 0) - item.quantity;

      const { error: updateError } = await supabase
        .from('products')
        .update({
          stock_quantity: Math.max(0, newStock),
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.product_id);

      if (updateError) throw updateError;
    }

    return {
      ...invoice,
      items,
      invoice_number: invoiceNumber,
    };
  },

  // Cancelar factura
  async cancelInvoice(invoiceId: string) {
    const { data, error } = await supabase
      .from('invoices')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Obtener facturas por rango de fechas
  async getInvoicesByDateRange(
    tenantId: string,
    startDate: string,
    endDate: string
  ) {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        items:invoice_items(*)
      `)
      .eq('tenant_id', tenantId)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Obtener facturas por método de pago
  async getInvoicesByPaymentMethod(
    tenantId: string,
    paymentMethod: 'cash' | 'card' | 'sinpe'
  ) {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        items:invoice_items(*)
      `)
      .eq('tenant_id', tenantId)
      .eq('payment_method', paymentMethod)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Obtener estadísticas de ventas
  async getSalesStats(tenantId: string) {
    const { data, error } = await supabase
      .from('invoices')
      .select('total, payment_method, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed');

    if (error) throw error;

    const totalSales = data?.reduce((sum, i) => sum + i.total, 0) || 0;
    const totalInvoices = data?.length || 0;

    const byPaymentMethod = {
      cash: data?.filter((i) => i.payment_method === 'cash').reduce((sum, i) => sum + i.total, 0) || 0,
      card: data?.filter((i) => i.payment_method === 'card').reduce((sum, i) => sum + i.total, 0) || 0,
      sinpe: data?.filter((i) => i.payment_method === 'sinpe').reduce((sum, i) => sum + i.total, 0) || 0,
    };

    return {
      totalSales,
      totalInvoices,
      averagePerInvoice: totalInvoices > 0 ? totalSales / totalInvoices : 0,
      byPaymentMethod,
    };
  },

  // Obtener facturas por cliente
  async getInvoicesByCustomer(tenantId: string, customerName: string) {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        items:invoice_items(*)
      `)
      .eq('tenant_id', tenantId)
      .ilike('customer_name', `%${customerName}%`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Obtener resumen de factura
  async getInvoiceSummary(invoiceId: string) {
    const invoice = await this.getInvoiceById(invoiceId);

    return {
      invoiceNumber: invoice.invoice_number,
      customerName: invoice.customer_name,
      customerPhone: invoice.customer_phone,
      items: invoice.items,
      subtotal: invoice.subtotal,
      discountAmount: invoice.discount_amount,
      discountPercentage: invoice.discount_percentage,
      taxAmount: invoice.tax_amount,
      total: invoice.total,
      paymentMethod: invoice.payment_method,
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
    const { data, error } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  // Obtener items por producto
  async getItemsByProduct(tenantId: string, productId: string) {
    const { data, error } = await supabase
      .from('invoice_items')
      .select(`
        *,
        invoice:invoices(tenant_id)
      `)
      .eq('product_id', productId);

    if (error) throw error;

    // Filtrar por tenant
    return (data || []).filter((item) => item.invoice?.tenant_id === tenantId);
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