import { apiFetch } from '@/lib/api';

export interface ProformaItem {
  product_id?: string | null;
  name: string;
  sku?: string | null;
  quantity: number;
  unit_price: number;
  /** Descuento de ESTA línea (%). El general va en la proforma. */
  discount_percent?: number;
  discount_amount?: number;
  iva_rate?: number;
  cabys?: string | null;
  unit?: string | null;
}

export interface Proforma {
  id: string;
  number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_identification: string | null;
  items: ProformaItem[];
  subtotal: number;
  tax: number;
  total: number;
  /** Descuento general del documento (%) y lo que sumó en plata. */
  discount_percent?: number;
  discount_amount?: number;
  notes: string | null;
  valid_until: string | null;
  status: 'open' | 'converted' | 'cancelled';
  converted_invoice: string | null;
  created_at: string;
}

export interface ProformaInput {
  customer_id?: string | null;
  customer_name?: string | null;
  customer_identification?: string | null;
  items: ProformaItem[];
  discount_percent?: number;
  notes?: string | null;
  valid_until?: string | null;
}

export const proformasService = {
  list: (status: 'open' | 'converted' | 'cancelled' | 'all' = 'open') =>
    apiFetch<Proforma[]>(`/proformas?status=${status}`),
  get: (id: string) => apiFetch<Proforma>(`/proformas/${id}`),
  create: (body: ProformaInput) =>
    apiFetch<Proforma>('/proformas', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<ProformaInput>) =>
    apiFetch<Proforma>(`/proformas/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  convert: (id: string, invoice?: string) =>
    apiFetch<Proforma>(`/proformas/${id}/convert`, { method: 'POST', body: JSON.stringify({ invoice }) }),
  cancel: (id: string) => apiFetch<Proforma>(`/proformas/${id}/cancel`, { method: 'POST' }),
  remove: (id: string) => apiFetch<{ deleted: boolean }>(`/proformas/${id}`, { method: 'DELETE' }),
};

export default proformasService;
