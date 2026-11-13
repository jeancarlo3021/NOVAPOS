import { apiFetch } from '@/lib/api';
import { purchasesOfflineService } from './purchasesOfflineService';

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

/** Lo que deshizo una anulación de compra. */
export interface AnulacionDeCompra {
  numero: string;
  estado_anterior: string;
  motivo: string;
  /** Cuántas líneas volvieron del inventario. */
  stock_revertido: number;
  unidades: number;
  /** Líneas de productos que no llevan existencias: no se tocaron. */
  sin_stock: number;
  fallaron: number;
  /** Quedaron en negativo porque la mercadería ya se había vendido. */
  negativos: Array<{ producto: string; stock: number }>;
  /** Su costo quedó con el precio de esta compra: conviene revisarlo. */
  costos_a_revisar: string[];
  cuenta_por_pagar: 'ninguna' | 'cancelada' | 'no_se_pudo';
}

export const inventoryPurchasesService = {
  // Obtener todas las compras
  async getAllPurchases(_tenantId: string) {
    return apiFetch<InventoryPurchase[]>('/purchases');
  },

  // Obtener compra por ID
  async getPurchaseById(id: string) {
    try {
      const result = await apiFetch<InventoryPurchase>('/purchases/' + id);
      console.log('suppliers:', (result as any)?.suppliers);
      console.log('purchase_items:', (result as any)?.purchase_items);
      return result;
    } catch (err) {
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

  // Actualizar estado de compra. Recibir NO va por acá: mueve inventario y
  // crea cuentas por pagar, así que tiene su propio camino (`receivePurchase`).
  /**
   * ANULAR una compra, incluso ya recibida.
   *
   * Devuelve el resumen de lo que se deshizo: cuántas líneas volvieron del
   * inventario, cuáles productos quedaron en negativo —porque la mercadería ya
   * se vendió—, qué pasó con la cuenta por pagar y qué costos conviene
   * revisar. Se muestra todo: una anulación que no dice qué movió obliga a ir
   * a revisar el inventario producto por producto.
   */
  async voidPurchase(id: string, motivo: string) {
    return apiFetch<AnulacionDeCompra>('/purchases/' + id + '/void', {
      method: 'POST',
      body: JSON.stringify({ motivo }),
    });
  },

  async updatePurchaseStatus(id: string, status: 'pending' | 'cancelled') {
    return apiFetch<InventoryPurchase>('/purchases/' + id, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  },

  /**
   * Corregir una orden PENDIENTE: proveedor, fechas, notas y sus líneas.
   *
   * El total no viaja: lo calcula el servidor desde las líneas. Si lo mandara
   * la pantalla, una orden podría terminar con líneas que suman ₡90.000 y un
   * total de ₡100.000, y esa diferencia después es una cuenta por pagar mal.
   */
  async updatePurchase(id: string, cambios: {
    supplier_id?: string;
    purchase_date?: string;
    expected_delivery_date?: string | null;
    notes?: string | null;
    items?: Array<{ product_id: string; quantity: number; unit_price: number }>;
  }) {
    return apiFetch<InventoryPurchase>('/purchases/' + id, {
      method: 'PUT',
      body: JSON.stringify(cambios),
    });
  },

  // Recibir compra. `canUpdateStock` indica si el plan permite actualizar stock;
  // si es false, el backend solo marca la compra como recibida sin tocar inventario.
  async receivePurchase(
    id: string,
    /** `unit_price` va cuando la factura trajo otro precio que la orden. */
    items: Array<{ product_id: string; quantity: number; unit_price?: number }>,
    canUpdateStock = true,
    notes?: string,
  ) {
    return apiFetch<InventoryPurchase>('/purchases/' + id + '/receive', {
      method: 'POST',
      body: JSON.stringify({ items, canUpdateStock, notes }),
    });
  },

  /**
   * ¿Qué pasaría si vuelvo a cargar esta orden al inventario?
   *
   * Se consulta ANTES de tocar nada: dice cuánto subiría cada producto, si la
   * orden ya se cargó antes y si las líneas quedaron mal conciliadas.
   */
  async stockStatus(id: string) {
    return apiFetch<EstadoDeCarga>('/purchases/' + id + '/stock-status');
  },

  /** Vuelve a sumar al inventario las cantidades de la orden. */
  async reloadStock(id: string) {
    return apiFetch<{ purchase_number: string; aplicados: number; sinStock: number; fallaron: number; unidades: number }>(
      '/purchases/' + id + '/reload-stock',
      { method: 'POST', body: JSON.stringify({ confirmar: true }) },
    );
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
  async generatePurchaseNumber(tenantId: string): Promise<string> {
    try {
      const purchases = await apiFetch<Array<{ purchase_number: string }>>('/purchases');
      const pending = await purchasesOfflineService.getPendingCreates(tenantId);

      // Extract numbers from both online and offline purchases
      const allNumbers = [
        ...(purchases ?? []).map(row => {
          const suffix = row.purchase_number?.split('-').pop();
          const n = suffix ? parseInt(suffix, 10) : NaN;
          return isNaN(n) ? 0 : n;
        }),
        ...pending.map(p => {
          const suffix = p.purchaseData.purchase_number?.split('-').pop();
          const n = suffix ? parseInt(suffix, 10) : NaN;
          return isNaN(n) ? 0 : n;
        }),
      ];

      const max = allNumbers.length > 0 ? Math.max(...allNumbers) : 0;
      return `PO-${String(max + 1).padStart(4, '0')}`;
    } catch {
      // Fallback: just get pending offline purchases
      const pending = await purchasesOfflineService.getPendingCreates(tenantId).catch(() => []);
      const counter = String(pending.length + 1).padStart(4, '0');
      return `PO-${counter}`;
    }
  },
};

/** Lo que devuelve `stockStatus`: la foto previa a cargar una orden. */
export interface EstadoDeCarga {
  purchase_number: string | null;
  status: string;
  purchase_date: string | null;
  lineas: number;
  productos: number;
  unidades: number;
  /** Fechas en las que esta orden YA entró al inventario. */
  cargas_previas: string[];
  unidades_ya_cargadas: number;
  /** Líneas que caen sobre un producto ya usado por otra línea. */
  lineas_repetidas: number;
  /** Hay un producto con 5 o más líneas: la factura quedó mal conciliada. */
  sospechosa: boolean;
  detalle: Array<{
    product_id: string; nombre: string; sku: string | null;
    lineas: number; cantidad: number; stock: number | null; infinito: boolean;
  }>;
}
