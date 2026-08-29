import { apiFetch } from '@/lib/api';

/**
 * Portal del contador.
 *
 * Su cartera son los negocios a los que tiene acceso en `user_tenants`, el mismo
 * mecanismo de las sucursales: entra a cada uno con el selector de empresa. Esta
 * pantalla le da lo que ese selector no: el estado de la FE de TODOS sus clientes
 * de un vistazo, sin entrar uno por uno.
 */

export interface AccountantQuota {
  unlimited?: boolean;
  included?: number;
  used?: number;
  available?: number;
  quota_start?: string;
  expires_at?: string;
}

/** Datos del negocio que el contador puede corregir. */
export interface ClientBusiness {
  business_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  identification?: string | null;
}

export interface ClientPlan {
  id: string; name: string; price: number; billing_cycle: string;
}

export interface ClientFePlan {
  id: string; name: string; monthly_quota: number; monthly_price: number;
  current_usage: number; active: boolean;
}

/** Comprobantes emitidos. `rejected` es la alarma: no valen ante Hacienda. */
export interface FeCounters {
  total: number; accepted: number; rejected: number; pending: number;
  this_month: number; credit_notes: number; debit_notes: number;
}

export interface AccountantClient {
  tenant_id: string;
  name: string;
  status?: string;
  fe_enabled: boolean;
  fe_provider?: string | null;
  environment: 'production' | 'sandbox';
  emisor_name?: string | null;
  emisor_identification?: string | null;
  has_certificate: boolean;
  certificate_name?: string | null;
  /** Qué falta para poder emitir. Vacío = listo. */
  missing: string[];
  ready: boolean;
  quota: AccountantQuota | null;
  business?: ClientBusiness;
  created_at?: string | null;
  plan?: ClientPlan | null;
  subscription?: { status: string; ends_at: string | null } | null;
  fe_plan?: ClientFePlan | null;
  counters?: FeCounters;
}

/** Resultado del alta/actualización de la empresa en Alanube. */
export interface AlanubeSync {
  ok: boolean;
  message: string;
  company_id?: string | null;
  missing?: string[];
}

/** Datos de Hacienda y credenciales con los que se da de alta a un cliente. */
export interface NewClientPayload {
  name: string;
  plan_id?: string | null;
  fe_plan_id?: string | null;
  hacienda?: {
    identification?: string;
    identification_type?: string;
    name?: string;
    commercial_name?: string;
    email?: string;
    phone?: string;
    address?: string;
    economic_activity_code?: string;
    /** PIN del certificado .p12 */
    p12_password?: string;
    atv_username?: string;
    atv_password?: string;
    environment?: 'production' | 'sandbox';
  };
  /** Último consecutivo YA emitido en el sistema anterior (se sigue desde ahí). */
  consecutivos?: {
    factura?: number;
    tiquete?: number;
    nota_credito?: number;
  };
  access?: { username: string; password: string; full_name?: string };
}

export interface NewClientResult {
  ok: boolean;
  tenant_id?: string;
  user_email?: string | null;
  alanube?: AlanubeSync | null;
}

export const accountantService = {
  clients: () => apiFetch<AccountantClient[]>('/accountant/clients'),

  /**
   * Enlaza un negocio YA EXISTENTE usando el código que el negocio generó.
   *
   * El contador no puede engancharse solo: la autorización sale del negocio.
   */
  link: (code: string) =>
    apiFetch<{ tenant_id: string; business_name: string | null }>('/accountant/link', {
      method: 'POST', body: JSON.stringify({ code }),
    }),

  /** El NEGOCIO genera el código para dárselo a su contador. */
  linkCode: () =>
    apiFetch<{ code: string; expires_at: string }>('/accountant/link-code', { method: 'POST' }),

  /** Da de alta un cliente nuevo en la cartera del contador. */
  createClient: (payload: NewClientPayload) =>
    apiFetch<NewClientResult>('/accountant/clients', {
      method: 'POST', body: JSON.stringify(payload),
    }),

  /** Crea o actualiza la empresa del cliente en Alanube. */
  syncAlanube: (tenantId: string) =>
    apiFetch<{ ok: boolean; company_id?: string | null; message: string }>(
      `/accountant/clients/${tenantId}/alanube`, { method: 'POST' }),

  /** Corrige los datos del negocio (nombre, contacto, dirección, cédula). */
  saveBusiness: (tenantId: string, business: ClientBusiness) =>
    apiFetch<{ ok: boolean }>(`/accountant/clients/${tenantId}/business`, {
      method: 'PUT', body: JSON.stringify({ business }),
    }),

  feConfig: (tenantId: string) =>
    apiFetch<Record<string, any>>(`/accountant/clients/${tenantId}/fe-config`),

  saveFeConfig: (tenantId: string, fe: Record<string, any>) =>
    apiFetch<{ ok: boolean; alanube?: AlanubeSync | null }>(`/accountant/clients/${tenantId}/fe-config`, {
      method: 'PUT', body: JSON.stringify({ fe }),
    }),

  /** Sube la llave criptográfica (.p12) del cliente. */
  uploadCertificate: (tenantId: string, data: {
    file_base64: string; filename: string; p12_password?: string;
    environment?: 'production' | 'sandbox';
  }) => apiFetch<{ ok: boolean; environment: string; certificate: any; alanube?: AlanubeSync | null }>(
    `/accountant/clients/${tenantId}/certificate`,
    { method: 'POST', body: JSON.stringify(data) },
  ),

  invoices: (tenantId: string, from?: string, to?: string) => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    const qs = p.toString();
    return apiFetch<any[]>(`/accountant/clients/${tenantId}/invoices${qs ? '?' + qs : ''}`);
  },
};

export default accountantService;
