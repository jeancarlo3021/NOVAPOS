import { apiFetch } from '@/lib/api';

// ── Tipos ──────────────────────────────────────────────────────────────────
export interface TenantGroup {
  id: string;
  name: string;
  owner_id: string;
  billing_email?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FePlan {
  id: string;
  code: string;          // 'FE_100', 'FE_500', etc.
  name: string;          // 'FE Pequeño', 'FE Mediano'
  monthly_quota: number; // facturas/mes incluidas
  monthly_price: number; // ₡
  active: boolean;
}

export interface TenantFePlan {
  tenant_id: string;
  fe_plan_id: string;
  current_usage: number;
  reset_at: string;
  active: boolean;
  fe_plan?: FePlan | null;
}

export interface BranchMember {
  role: 'main' | 'branch';
  joined_at: string;
  tenant: {
    id: string;
    name: string;
    is_demo: boolean;
    status: string;
    created_at: string;
    subscription?: {
      id: string;
      status: string;
      started_at?: string | null;
      ends_at?: string | null;
      plan?: { id: string; name: string; price: number } | null;
    } | null;
  } | null;
  fe?: TenantFePlan | null;
}

export interface GroupBilling {
  group_id: string;
  group_name: string;
  branches: number;
  saas_per_branch: number;
  saas_total: number;
  fe_total: number;
  grand_total: number;
}

export interface GroupSalesRow {
  tenant_id: string;
  tenant_name: string;
  invoices: number;
  ventas: number;
  iva: number;
}

export interface MyTenant {
  tenant_id: string;
  tenant_name: string;
  is_demo: boolean;
  status: string;
  role: string;
  is_default: boolean;
  joined_at: string;
  group_id: string | null;
  group_name: string | null;
}

export interface CreateGroupPayload {
  name: string;
  billing_email?: string | null;
  notes?: string | null;
  main_tenant_id?: string | null;
  /** Si se omite, el creador del grupo queda como owner. */
  owner_id?: string | null;
}

export interface UserLite {
  id: string;
  email: string | null;
  full_name: string | null;
}

export interface AddBranchPayload {
  // Modo A: enlazar tenant existente
  tenant_id?: string;
  // Modo B: crear tenant nuevo desde cero
  new_tenant?: {
    name: string;
    owner_email?: string | null;
    /** Plan SaaS de módulos (subscription_plans.id) */
    plan_id?: string | null;
    is_demo?: boolean;
  };
  /** Plan de Facturación Electrónica (fe_plans.id) — opcional */
  fe_plan_id?: string | null;
}

// ── Service ────────────────────────────────────────────────────────────────
export const tenantGroupsService = {
  // ── Grupos ──
  /** scope='all' devuelve todos los grupos (solo para super-admin). */
  list(scope: 'own' | 'all' = 'own'): Promise<TenantGroup[]> {
    return apiFetch<TenantGroup[]>(`/tenant-groups?scope=${scope}`);
  },

  get(groupId: string): Promise<{
    group: TenantGroup;
    owner_info: { id: string; email: string | null; full_name: string | null } | null;
    members: BranchMember[];
    fe_by_tenant: Record<string, TenantFePlan>;
  }> {
    return apiFetch(`/tenant-groups/${groupId}`);
  },

  create(payload: CreateGroupPayload): Promise<TenantGroup> {
    return apiFetch<TenantGroup>('/tenant-groups', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  update(groupId: string, patch: Partial<Pick<TenantGroup, 'name' | 'billing_email' | 'notes'>>): Promise<TenantGroup> {
    return apiFetch<TenantGroup>(`/tenant-groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  remove(groupId: string): Promise<{ deleted: true }> {
    return apiFetch(`/tenant-groups/${groupId}`, { method: 'DELETE' });
  },

  // ── Transferir owner del grupo a otro usuario ──
  transferOwner(groupId: string, newOwnerId: string): Promise<{ transferred: true; new_owner_id: string }> {
    return apiFetch(`/tenant-groups/${groupId}/owner`, {
      method: 'PUT',
      body: JSON.stringify({ new_owner_id: newOwnerId }),
    });
  },

  // ── Lista compacta de usuarios para selector de owner ──
  usersLite(): Promise<UserLite[]> {
    return apiFetch<UserLite[]>('/admin/users-lite');
  },

  // ── Billing + reportes ──
  billing(groupId: string): Promise<GroupBilling> {
    return apiFetch<GroupBilling>(`/tenant-groups/${groupId}/billing`);
  },

  sales(groupId: string, from: string, to: string): Promise<GroupSalesRow[]> {
    const qs = new URLSearchParams({ from, to });
    return apiFetch<GroupSalesRow[]>(`/tenant-groups/${groupId}/sales?${qs.toString()}`);
  },

  // ── Sucursales ──
  addBranch(groupId: string, payload: AddBranchPayload): Promise<{ tenant_id: string; linked: true }> {
    return apiFetch(`/tenant-groups/${groupId}/branches`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  unlinkBranch(groupId: string, tenantId: string): Promise<{ unlinked: true }> {
    return apiFetch(`/tenant-groups/${groupId}/branches/${tenantId}`, { method: 'DELETE' });
  },

  setBranchFePlan(groupId: string, tenantId: string, fePlanId: string): Promise<TenantFePlan> {
    return apiFetch(`/tenant-groups/${groupId}/branches/${tenantId}/fe-plan`, {
      method: 'PUT',
      body: JSON.stringify({ fe_plan_id: fePlanId }),
    });
  },

  // ── FE plans catálogo ──
  feCatalog(): Promise<FePlan[]> {
    return apiFetch<FePlan[]>('/tenant-groups/fe-plans/catalog');
  },

  // ── Tenants del usuario (para TenantSwitcher) ──
  myTenants(): Promise<MyTenant[]> {
    return apiFetch<MyTenant[]>('/tenant-groups/my/tenants');
  },

  // ── Stats por sucursal del grupo (panel dashboard del owner) ──
  myBranchesStats(): Promise<BranchStats[]> {
    return apiFetch<BranchStats[]>('/tenant-groups/my/branches-stats');
  },

  // ── Reporte consolidado de todas las sucursales (rango de fechas) ──
  myBranchesReport(from?: string, to?: string): Promise<{ rows: BranchReportRow[]; totals: BranchReportTotals | null }> {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to)   p.set('to', to);
    const qs = p.toString();
    return apiFetch(`/tenant-groups/my/branches-report${qs ? '?' + qs : ''}`);
  },

  // ── FE + Kiosk config por tenant (admin) ──
  getFeConfig(tenantId: string): Promise<{ fe: any; kiosk: any }> {
    return apiFetch(`/admin/tenants/${tenantId}/fe-config`);
  },
  setFeConfig(tenantId: string, payload: { fe?: any; kiosk?: any }): Promise<{ ok: boolean }> {
    return apiFetch(`/admin/tenants/${tenantId}/fe-config`, {
      method: 'PUT', body: JSON.stringify(payload),
    });
  },

  // ── Crear bodega central en todas (o una) sucursales ──
  createCentralWarehouse(tenantId?: string): Promise<{ created: number; total_tenants: number }> {
    return apiFetch('/tenant-groups/my/central-warehouse', {
      method: 'POST',
      body: JSON.stringify(tenantId ? { tenant_id: tenantId } : {}),
    });
  },
};

export interface BranchStats {
  tenant_id:        string;
  tenant_name:      string;
  is_demo:          boolean;
  status:           string;
  users_count:      number;
  invoices_month:   number;
  invoices_total:   number;
  warehouses_count: number;
}

export interface BranchReportRow {
  tenant_id:    string;
  tenant_name:  string;
  is_demo:      boolean;
  status:       string;
  invoices:     number;
  sales_total:  number;
  tax_total:    number;
  avg_ticket:   number;
  expenses:     number;
  gross_profit: number;
}

export interface BranchReportTotals {
  invoices:     number;
  sales_total:  number;
  tax_total:    number;
  expenses:     number;
  gross_profit: number;
}
