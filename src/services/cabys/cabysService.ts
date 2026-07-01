import { apiFetch } from '@/lib/api';

export interface CabysItem {
  code: string;
  description: string;
  iva_rate: number;
}

export const cabysService = {
  /** Busca por código o descripción (mínimo 2 caracteres). */
  search: (q: string) => apiFetch<CabysItem[]>(`/cabys/search?q=${encodeURIComponent(q)}`),

  /** Cantidad de códigos cargados. */
  count: () => apiFetch<{ count: number }>('/cabys/count'),

  /** Carga masiva (super-admin). */
  bulk: (rows: Array<{ code: string; description: string; iva_rate: number; sheet?: string }>) =>
    apiFetch<{ inserted: number }>('/cabys/bulk', { method: 'POST', body: JSON.stringify({ rows }) }),

  /** Vaciar el catálogo. */
  clear: () => apiFetch<{ ok: boolean }>('/cabys', { method: 'DELETE' }),
};

export default cabysService;
