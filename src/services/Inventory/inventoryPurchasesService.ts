import { supabase } from '@/lib/supabase';

export interface InventoryPurchase {
  id: string;
  tenant_id: string;
  supplier_id: string;
  purchase_number: string;
  purchase_date: string;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  status: 'pending' | 'received' | 'cancelled';
  total_amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_price: number;
  total_price: number;
}

export const inventoryPurchasesService = {
  // Obtener todas las compras
  async getAllPurchases(tenantId: string) {
    const { data, error } = await supabase
      .from('purchases')
      .select(`
        *,
        supplier:suppliers(name, email, phone),
        items:purchase_items(*)
      `)
      .eq('tenant_id', tenantId)
      .order('purchase_date', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  // Obtener compra por ID
  async getPurchaseById(id: string) {
    const { data, error } = await supabase
      .from('purchases')
      .select(`
        *,
        supplier:suppliers(*),
        items:purchase_items(
          *,
          product:products(name, sku)
        )
      `)
      .eq('id', id)
      .maybeSingle();
    
    if (error) throw error;
    return data;
  },

  // Crear compra
  async createPurchase(tenantId: string, purchase: Omit<InventoryPurchase, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await supabase
      .from('purchases')
      .insert([{ ...purchase, tenant_id: tenantId }])
      .select()
      .maybeSingle();
    
    if (error) throw error;
    return data;
  },

  // Agregar items a la compra
  async addPurchaseItems(purchaseId: string, items: Omit<PurchaseItem, 'id'>[]) {
    const { data, error } = await supabase
      .from('purchase_items')
      .insert(items.map(item => ({ ...item, purchase_id: purchaseId })))
      .select();
    
    if (error) throw error;
    return data;
  },

  // Actualizar estado de compra
  async updatePurchaseStatus(id: string, status: 'pending' | 'received' | 'cancelled') {
    const { data, error } = await supabase
      .from('purchases')
      .update({ status })
      .eq('id', id)
      .select()
      .maybeSingle();
    
    if (error) throw error;
    return data;
  },

  // Recibir compra
  async receivePurchase(id: string, _actualDeliveryDate: string) {
    const purchase = await this.getPurchaseById(id);

    // Actualizar stock de productos
    for (const item of purchase.items) {
      const product = await supabase
        .from('products')
        .select('quantity_on_hand')
        .eq('id', item.product_id)
        .maybeSingle();

      if (!product.data) continue;

      await supabase
        .from('products')
        .update({ quantity_on_hand: product.data.quantity_on_hand + item.quantity_ordered })
        .eq('id', item.product_id);
      
      // Registrar movimiento de stock
      await supabase
        .from('stock_movements')
        .insert([{
          tenant_id: purchase.tenant_id,
          product_id: item.product_id,
          movement_type: 'purchase',
          quantity: item.quantity_ordered,
          reference_id: id,
          reference_type: 'purchase',
        }]);
    }

    // Actualizar estado de compra
    return this.updatePurchaseStatus(id, 'received');
  },

  // Obtener compras pendientes
  async getPendingPurchases(tenantId: string) {
    const { data, error } = await supabase
      .from('purchases')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .order('expected_delivery_date', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  // Eliminar compra
  async deletePurchase(id: string): Promise<void> {
    const { error } = await supabase.from('purchases').delete().eq('id', id);
    if (error) throw error;
  },

  // Generar número de compra único
  async generatePurchaseNumber(tenantId: string) {
    const { data, error } = await supabase
      .from('purchases')
      .select('purchase_number')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) throw error;

    const lastNumber = data?.[0]?.purchase_number || 'PO-0000';
    const number = parseInt(lastNumber.split('-')[1]) + 1;
    return `PO-${String(number).padStart(4, '0')}`;
  },
};