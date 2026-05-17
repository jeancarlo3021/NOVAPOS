import { apiFetch } from '@/lib/api';

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
  suppliers?: { name: string };
  purchase_items?: PurchaseItem[];
}

// Matches the actual purchase_items table schema
export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  quantity: number;            // column: quantity
  received_quantity: number;   // column: received_quantity
  unit_price: number;
  subtotal: number;            // column: subtotal
}

export const inventoryPurchasesService = {
  // Obtener todas las compras
  async getAllPurchases(_tenantId: string) {
    return apiFetch<InventoryPurchase[]>('/purchases');
  },

  // Obtener compra por ID
  async getPurchaseById(id: string) {
    console.log('Fetching purchase details for ID:', id);
    try {
      const result = await apiFetch<InventoryPurchase>('/purchases/' + id);
      console.log('apiFetch returned:', result);
      console.log('suppliers:', (result as any)?.suppliers);
      console.log('purchase_items:', (result as any)?.purchase_items);
      return result;
    } catch (err) {
      console.error('apiFetch error:', err);
      throw err;
    }
  },

  // Crear compra
  async createPurchase(_tenantId: string, purchase: Omit<InventoryPurchase, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) {
    return apiFetch<InventoryPurchase>('/purchases', {
      method: 'POST',
      body: JSON.stringify(purchase),
    });
  },

  // Agregar items a la compra — maps to actual DB column names
  async addPurchaseItems(purchaseId: string, items: Array<{
    product_id: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>) {
    return apiFetch<PurchaseItem[]>('/purchases/' + purchaseId + '/receive', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },

  // Actualizar estado de compra
  async updatePurchaseStatus(id: string, status: 'pending' | 'received' | 'cancelled') {
    return apiFetch<InventoryPurchase>('/purchases/' + id, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  },

  // Recibir compra
  async receivePurchase(id: string, items: Array<{ product_id: string; quantity: number }>) {
    return apiFetch<InventoryPurchase>('/purchases/' + id + '/receive', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },

  // Obtener compras pendientes
  async getPendingPurchases(_tenantId: string) {
    return apiFetch<InventoryPurchase[]>('/purchases?status=pending');
  },

  // Eliminar compra
  async deletePurchase(id: string): Promise<void> {
    await apiFetch('/purchases/' + id, { method: 'DELETE' });
  },

  // Generar número de compra único
  async generatePurchaseNumber(_tenantId: string): Promise<string> {
    const purchases = await apiFetch<Array<{ purchase_number: string }>>('/purchases');
    const max = (purchases ?? []).reduce((m, row) => {
      const suffix = row.purchase_number?.split('-').pop();
      const n = suffix ? parseInt(suffix, 10) : NaN;
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return `PO-${String(max + 1).padStart(4, '0')}`;
  },
};
