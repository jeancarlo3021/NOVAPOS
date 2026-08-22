import { apiFetch } from '@/lib/api';

export type WarrantyStatus = 'open' | 'with_supplier' | 'approved' | 'rejected' | 'resolved';
export type WarrantyResolution = 'repair' | 'replace' | 'refund' | 'credit' | 'none';

export interface Warranty {
  id: string;
  number?: string | null;
  invoice_id?: string | null;
  invoice_number?: string | null;
  sold_at?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  product_id?: string | null;
  product_name: string;
  serial?: string | null;
  quantity: number;
  warranty_until?: string | null;
  out_of_warranty?: boolean;
  issue: string;
  photos: string[];
  status: WarrantyStatus;
  resolution?: WarrantyResolution | null;
  resolution_notes?: string | null;
  supplier_id?: string | null;
  supplier_ref?: string | null;
  sent_at?: string | null;
  returned_at?: string | null;
  closed_at?: string | null;
  events?: Array<{ at: string; by?: string | null; from?: string | null; to?: string | null; note?: string | null }>;
  created_at?: string;
}

export interface WarrantyInput {
  invoice_id?: string | null;
  invoice_number?: string | null;
  sold_at?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  product_id?: string | null;
  product_name: string;
  serial?: string | null;
  quantity?: number;
  warranty_until?: string | null;
  out_of_warranty?: boolean;
  issue: string;
  photos?: string[];
  supplier_id?: string | null;
  supplier_ref?: string | null;
}

/** Línea de la venta buscada, con la vigencia ya calculada. */
export interface WarrantyLookupItem {
  product_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  warranty_months: number;
  warranty_until: string | null;
}

export const warrantiesService = {
  /** status: 'pending' (abiertos) | uno concreto | 'all'. */
  list: (status?: string, q?: string) => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (q) p.set('q', q);
    const qs = p.toString();
    return apiFetch<Warranty[]>(`/warranties${qs ? '?' + qs : ''}`);
  },

  get: (id: string) => apiFetch<Warranty>(`/warranties/${id}`),

  /** Busca la venta por número de factura para abrir el caso sin teclear todo. */
  lookup: (invoiceNumber: string) =>
    apiFetch<{ invoice: any; items: WarrantyLookupItem[] }>(
      `/warranties/lookup/${encodeURIComponent(invoiceNumber)}`),

  create: (w: WarrantyInput) =>
    apiFetch<Warranty>('/warranties', { method: 'POST', body: JSON.stringify(w) }),

  update: (id: string, w: Partial<WarrantyInput> & { resolution?: string | null; resolution_notes?: string | null }) =>
    apiFetch<Warranty>(`/warranties/${id}`, { method: 'PUT', body: JSON.stringify(w) }),

  setStatus: (id: string, status: WarrantyStatus, extra?: { note?: string; resolution?: WarrantyResolution; resolution_notes?: string }) =>
    apiFetch<Warranty>(`/warranties/${id}/status`, {
      method: 'POST', body: JSON.stringify({ status, ...extra }),
    }),

  remove: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/warranties/${id}`, { method: 'DELETE' }),
};

export default warrantiesService;
