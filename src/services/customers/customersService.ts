import { apiFetch } from '@/lib/api';

export interface Customer {
  id:                  string;
  tenant_id:           string;
  identification_type?: string | null;
  identification?:      string | null;
  name:                string;
  commercial_name?:    string | null;
  email?:              string | null;
  phone?:              string | null;
  province_code?:      string | null;
  canton_code?:        string | null;
  district_code?:      string | null;
  address?:            string | null;
  zone?:               string | null;
  notes?:              string | null;
  is_active:           boolean;
  created_at:          string;
  updated_at:          string;
}

export type CustomerInput = Omit<Partial<Customer>, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>;

export const customersService = {
  list:   (q?: string) => apiFetch<Customer[]>(`/customers${q ? '?q=' + encodeURIComponent(q) : ''}`),
  get:    (id: string) => apiFetch<Customer>(`/customers/${id}`),
  create: (c: CustomerInput) => apiFetch<Customer>('/customers', { method: 'POST', body: JSON.stringify(c) }),
  update: (id: string, c: CustomerInput) =>
    apiFetch<Customer>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(c) }),
  /** Desactivar (soft) por defecto; con hard=true elimina de verdad. */
  remove: (id: string, hard = false) =>
    apiFetch(`/customers/${id}${hard ? '?hard=true' : ''}`, { method: 'DELETE' }),
  /** Activar / desactivar un cliente. */
  setActive: (id: string, is_active: boolean) =>
    apiFetch<Customer>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify({ is_active }) }),
};

// Catálogo de tipos de identificación Hacienda CR
export const ID_TYPES: { value: string; label: string }[] = [
  { value: '01', label: 'Cédula Física' },
  { value: '02', label: 'Cédula Jurídica' },
  { value: '03', label: 'DIMEX' },
  { value: '04', label: 'NITE' },
  { value: '05', label: 'Extranjero (sin ID)' },
];
