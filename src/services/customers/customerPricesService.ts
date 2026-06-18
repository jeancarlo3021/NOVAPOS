import { apiFetch } from '@/lib/api';

export interface CustomerPrice {
  id: string;
  tenant_id: string;
  customer_id: string;
  product_id: string;
  price: number;
  created_at?: string;
  updated_at?: string;
}

export const customerPricesService = {
  /** Precios especiales de un cliente. */
  listByCustomer: (customerId: string) =>
    apiFetch<CustomerPrice[]>(`/customer-prices?customer_id=${customerId}`),

  /** Crea o actualiza el precio de un producto para un cliente. */
  upsert: (customerId: string, productId: string, price: number) =>
    apiFetch<CustomerPrice>('/customer-prices', {
      method: 'PUT',
      body: JSON.stringify({ customer_id: customerId, product_id: productId, price }),
    }),

  /** Quita el precio especial (el producto vuelve a su precio normal). */
  remove: (customerId: string, productId: string) =>
    apiFetch(`/customer-prices?customer_id=${customerId}&product_id=${productId}`, { method: 'DELETE' }),

  /** Mapa product_id → precio especial, para aplicar rápido en el POS. */
  async mapForCustomer(customerId: string): Promise<Record<string, number>> {
    const list = await customerPricesService.listByCustomer(customerId).catch(() => []);
    const map: Record<string, number> = {};
    for (const p of list ?? []) map[p.product_id] = Number(p.price);
    return map;
  },
};
