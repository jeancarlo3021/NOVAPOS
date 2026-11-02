/** La bandeja de caja, con pedidos de agente y del portal del cliente. */
const CLIENTE = 'cli-1';
const PEDIDOS = [
  { id: 'o-1', number: 'P-000010', status: 'pending', origen: 'cliente',
    customer_id: CLIENTE, customer_name: 'Pulpería Doña Ana', customer_phone: '88887777',
    total: 23000, created_at: new Date().toISOString(), notes: 'Entregar después de las 2',
    document_type: 'ticket',
    items: [{ product_name: 'Refresco 2L', quantity: 20, unit_price: 850, subtotal: 17000 },
            { product_name: 'Galleta surtida', quantity: 10, unit_price: 600, subtotal: 6000 }] },
  { id: 'o-2', number: 'P-000011', status: 'pending', origen: 'agente',
    agent_name: 'Kendall', customer_id: 'cli-2', customer_name: 'Super El Roble',
    total: 9000, created_at: new Date().toISOString(), document_type: 'ticket',
    items: [{ product_name: 'Arroz 1kg', quantity: 8, unit_price: 1100, subtotal: 8800 }] },
];
export async function apiFetch<T = any>(path: string, _init?: any): Promise<T> {
  if (path.startsWith('/agent-orders/agenda')) return [] as any;
  if (path.startsWith('/agent-orders?status=pending')) return PEDIDOS as any;
  if (path.startsWith('/agent-orders?status=taken')) return [] as any;
  if (path.startsWith('/accounts-receivable/summary')) return {
    outstanding: 170000, overdue_count: 1, overdue_amount: 70000, pending_count: 2,
    by_customer: [{ customer_id: CLIENTE, customer_name: 'Pulpería Doña Ana', balance: 170000, count: 2 }],
  } as any;
  if (path.startsWith('/settings')) return {} as any;
  return [] as any;
}
export default apiFetch;
