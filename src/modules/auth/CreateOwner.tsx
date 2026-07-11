import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { plansService, Plan } from '@/services/users/plansService';
import { useAuth } from '@/context/AuthContext';
import { Link } from 'react-router-dom';
import {
  Plus, Trash2, AlertCircle, CheckCircle, Settings, Mail, Lock,
  Building2, Calendar, RefreshCw, Power,
  Clock, TrendingUp, Users, Users2, AlertTriangle, X, Receipt, FileText, Search, Sparkles, Layers, Truck, Pencil, MoreHorizontal, KeyRound,
} from 'lucide-react';
import { Users as UsersModule } from '@/modules/users/Users';
import { DaysTag } from './components/DaysTag';
import { RenewModal } from './components/RenewModal';
import { TenantUsersModal } from './components/TenantUsersModal';
import { TenantModulesModal } from './components/TenantModulesModal';
import { TenantFeDataModal } from './components/TenantFeDataModal';
import type { OwnerData } from './components/RenewModal';
import { PaymentReceiptsView } from './components/PaymentReceiptsView';
import { CustomInvoiceModal } from './components/CustomInvoiceModal';
import { PrinterSandbox } from './components/PrinterSandbox';
import { TenantGroupView } from './components/TenantGroupView';
import { AdminFeKioskView } from './components/AdminFeKioskView';
import { GroupDocCount } from './components/GroupDocCount';
import { CabysImport } from './components/CabysImport';
import { BulkProductImportModal } from '@/modules/inventory/products/BulkProductImportModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

const fmtDate = (s: string | undefined) =>
  s ? new Date(s + (s.includes('T') ? '' : 'T12:00:00')).toLocaleDateString('es-CR', { dateStyle: 'medium' }) : '—';

function daysUntil(dateStr: string | undefined | null): number | null {
  if (!dateStr) return null;
  const d = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00');
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

// ── Fecha efectiva de próximo cobro ────────────────────────────────────────
// Si la suscripción tiene `ends_at`, lo usamos tal cual (autoritativo).
// Si no, calculamos sumando el ciclo al `started_at` (fallback: `created_at`).
// Por defecto asumimos 30 días (mensual) si no se conoce el ciclo.
function effectiveEndsAt(o: {
  ends_at?: string | null;
  started_at?: string | null;
  created_at?: string;
  plan_billing_cycle?: string;
}): { date: string | null; computed: boolean } {
  if (o.ends_at) return { date: o.ends_at, computed: false };
  const base = o.started_at ?? o.created_at;
  if (!base) return { date: null, computed: false };
  const start = base.includes('T') ? new Date(base) : new Date(base + 'T00:00:00');
  const cycle = (o.plan_billing_cycle ?? 'monthly').toLowerCase();
  const daysToAdd = cycle === 'yearly' ? 365 : 30;
  const end = new Date(start.getTime() + daysToAdd * 86400000);
  return { date: end.toISOString(), computed: true };
}

// ── Main component ────────────────────────────────────────────────────────────

type AdminTab = 'businesses' | 'groups' | 'fe_kiosk' | 'receipts' | 'sandbox' | 'team';

export const CreateOwner: React.FC = () => {
  const { refreshPlan } = useAuth();
  const [owners,    setOwners]    = useState<OwnerData[]>([]);
  const [plans,     setPlans]     = useState<Plan[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');
  const [showForm,  setShowForm]  = useState(false);
  const [renewing,  setRenewing]  = useState<OwnerData | null>(null);
  const [invoiceFor, setInvoiceFor] = useState<OwnerData | null>(null);
  const [manageUsersFor, setManageUsersFor] = useState<OwnerData | null>(null);
  const [manageModulesFor, setManageModulesFor] = useState<OwnerData | null>(null);
  const [importProductsFor, setImportProductsFor] = useState<OwnerData | null>(null);
  const [manageFeFor, setManageFeFor] = useState<OwnerData | null>(null);
  const [testingAlanube, setTestingAlanube] = useState(false);
  const [creatingAlanubeId, setCreatingAlanubeId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showCabys, setShowCabys] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('businesses');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  // Por defecto ocultamos las sucursales (group_role='branch') — la matriz
  // del grupo ya las representa. Toggle para mostrarlas si hace falta.
  const [showBranches, setShowBranches] = useState(false);

  const [formData, setFormData] = useState({
    email: '', password: '', businessName: '', planId: '', withDemo: false, fePlanId: '',
  });
  const [formErrors, setFormErrors] = useState({ email: '', password: '', businessName: '' });

  // Catálogo de planes FE (para asignar en alta y en acciones).
  const [fePlans, setFePlans] = useState<Array<{ id: string; name: string; docsPerMonth: number | null; extraDocPrice: number; is_active: boolean }>>([]);
  useEffect(() => {
    apiFetch<any[]>('/admin/fe-plans').then(l => setFePlans(Array.isArray(l) ? l : [])).catch(() => {});
  }, []);

  // Bolsa de comprobantes FE por negocio (límite, usados, vencimiento a 1 año).
  const [feQuotas, setFeQuotas] = useState<Record<string, { included?: number; used?: number; available?: number; expires_at?: string; unlimited?: boolean }>>({});
  useEffect(() => {
    apiFetch<Record<string, any>>('/admin/fe-quotas').then(q => setFeQuotas(q ?? {})).catch(() => {});
  }, []);

  const setEmisorApiKey = async (o: OwnerData) => {
    try {
      const cur = await apiFetch<any>(`/admin/tenants/${o.id}/fe-config`).catch(() => ({}));
      const existing = cur?.fe ?? {};
      const key = window.prompt(`ApiKey del emisor (Facturemos) para "${o.name}":`, existing.api_key_emisor ?? '');
      if (key === null) return;
      await apiFetch(`/admin/tenants/${o.id}/fe-config`, {
        method: 'PUT',
        body: JSON.stringify({ fe: { ...existing, api_key_emisor: key.trim() } }),
      });
      setSuccess('ApiKey del emisor guardada');
    } catch (err: any) { setError(err.message || 'No se pudo guardar la ApiKey'); }
  };

  // Habilitar / deshabilitar la emisión electrónica del negocio (ej. después de
  // que el cliente paga el módulo de FE). Preserva el resto de la config.
  const toggleFeEnabled = async (o: OwnerData) => {
    try {
      const cur = await apiFetch<any>(`/admin/tenants/${o.id}/fe-config`).catch(() => ({}));
      const existing = cur?.fe ?? {};
      const next = !existing.enabled;
      if (next && !String(existing.api_key_emisor ?? '').trim()) {
        if (!window.confirm(`"${o.name}" no tiene ApiKey del emisor configurada. ¿Habilitar FE igual? (podés ponerla después con "ApiKey del emisor")`)) return;
      } else if (!window.confirm(`${next ? 'Habilitar' : 'Deshabilitar'} facturación electrónica para "${o.name}"?`)) {
        return;
      }
      await apiFetch(`/admin/tenants/${o.id}/fe-config`, {
        method: 'PUT',
        body: JSON.stringify({ fe: { ...existing, enabled: next } }),
      });
      setSuccess(next ? 'Facturación electrónica habilitada' : 'Facturación electrónica deshabilitada');
    } catch (err: any) { setError(err.message || 'No se pudo cambiar el estado de FE'); }
  };

  const assignFePlan = async (tenantId: string, fePlanId: string) => {
    try {
      await apiFetch(`/admin/tenants/${tenantId}/fe-plan`, { method: 'PUT', body: JSON.stringify({ fe_plan_id: fePlanId || null }) });
      setSuccess(fePlanId ? 'Plan FE asignado' : 'Plan FE quitado');
      fetchOwners();
    } catch (err: any) { setError(err.message || 'Error al asignar el plan FE'); }
  };

  // Da de alta la empresa (emisor) en Alanube con los datos de FE del tenant.
  const createAlanubeCompany = async (o: any) => {
    setCreatingAlanubeId(o.id);
    try {
      const r = await apiFetch<any>(`/admin/tenants/${o.id}/alanube/company`, { method: 'POST' });
      if (r?.company_id) {
        showToast(`Empresa creada en Alanube · id ${r.company_id} · ${r?.env ?? ''}`, 'success');
      } else {
        // No se encontró el id automáticamente: mostramos la respuesta cruda.
        console.log('[Alanube createCompany] respuesta:', r?.result);
        showToast(`Creada pero SIN id detectado. Respuesta: ${JSON.stringify(r?.result ?? {}).slice(0, 300)}`, 'error');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo crear la empresa en Alanube', 'error');
    } finally { setCreatingAlanubeId(null); }
  };

  const fetchOwners = useCallback(async () => {
    /*
      ── SQL migration — ejecutar UNA VEZ en Supabase SQL Editor ─────────────────

      -- Bypass RLS to let the admin read all tenants + their latest subscription.
      CREATE OR REPLACE FUNCTION admin_get_owners()
      RETURNS TABLE(
        id uuid, name text, owner_id uuid, is_demo boolean, status text,
        created_at timestamptz, plan_id uuid, subscription_id uuid,
        sub_id uuid, sub_plan_id uuid, sub_status text,
        started_at timestamptz, ends_at timestamptz
      )
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT
          t.id, t.name, t.owner_id, t.is_demo, t.status,
          t.created_at, t.plan_id, t.subscription_id,
          s.id         AS sub_id,
          s.plan_id    AS sub_plan_id,
          s.status     AS sub_status,
          s.started_at,
          s.ends_at
        FROM tenants t
        LEFT JOIN LATERAL (
          SELECT * FROM subscriptions
          WHERE tenant_id = t.id
          ORDER BY created_at DESC
          LIMIT 1
        ) s ON true
        ORDER BY t.created_at DESC;
      $$;

      GRANT EXECUTE ON FUNCTION admin_get_owners() TO authenticated;
    */
    try {
      setLoading(true);

      // Carga en paralelo y RESILIENTE: si una de las llamadas falla (timeout,
      // endpoint no desplegado, backend caído), las otras se muestran igual.
      // Antes usábamos Promise.all → cualquier fallo abortaba la carga entera
      // y la tabla quedaba vacía con "NetworkError".
      const [plansR, ownersR, invR] = await Promise.allSettled([
        plansService.getAllPlans(),
        apiFetch<any[]>('/admin/owners'),
        apiFetch<Array<{ tenant_id: string; count: number; distribution_count?: number }>>('/admin/invoices-monthly'),
      ]);

      const allPlans     = plansR.status  === 'fulfilled' ? plansR.value   : [];
      const ownersData   = ownersR.status === 'fulfilled' ? ownersR.value  : [];
      const invCounts    = invR.status    === 'fulfilled' ? invR.value     : [];

      // Reportar fallas individuales como warning (no detiene la UI)
      const failures: string[] = [];
      if (plansR.status  === 'rejected') failures.push(`planes (${plansR.reason?.message ?? 'error'})`);
      if (ownersR.status === 'rejected') failures.push(`negocios (${ownersR.reason?.message ?? 'error'})`);
      // El de facturas mensuales NO se reporta — es opcional/futuro.
      if (failures.length > 0) {
        setError(`No se pudieron cargar: ${failures.join(', ')}. Reintentá en unos segundos.`);
      }

      setPlans(allPlans);

      const countMap = new Map<string, number>(
        (invCounts ?? []).map(r => [r.tenant_id, r.count]),
      );
      const distCountMap = new Map<string, number>(
        (invCounts ?? []).map(r => [r.tenant_id, r.distribution_count ?? 0]),
      );

      setOwners((ownersData ?? []).map((row: any) => {
        const planId = row.sub_plan_id ?? row.plan_id;
        const plan   = allPlans.find(p => p.id === planId);
        return {
          id:                  row.id,
          name:                row.name,
          owner_id:            row.owner_id,
          is_demo:             row.is_demo,
          status:              row.status ?? 'active',
          created_at:          row.created_at,
          plan_id:             planId ?? null,
          plan_name:           plan?.name ?? 'Sin plan',
          plan_price:          row.custom_price ?? plan?.price ?? 0,
          custom_price:        row.custom_price ?? null,
          plan_billing_cycle:  plan?.billing_cycle ?? 'monthly',
          is_admin_plan:       ((plan?.features as any)?.admin_dashboard === true),
          group_id:            row.group_id ?? null,
          group_name:          row.group_name ?? null,
          group_role:          row.group_role ?? null,
          group_billing:       row.group_billing ?? null,
          subscription_id:     row.sub_id ?? null,
          subscription_status: row.sub_status ?? '—',
          started_at:          row.started_at ?? null,
          ends_at:             row.ends_at ?? null,
          monthly_invoices:    countMap.get(row.id) ?? 0,
          distribution_invoices: distCountMap.get(row.id) ?? 0,
        };
      }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOwners(); }, [fetchOwners]);

  // ── Toggle active/suspended ────────────────────────────────────────────────

  const handleToggleStatus = async (owner: OwnerData) => {
    const newStatus = owner.status === 'active' ? 'suspended' : 'active';
    const label = newStatus === 'suspended' ? 'desactivar' : 'activar';
    if (!confirm(`¿${label} el negocio "${owner.name}"?`)) return;
    setTogglingId(owner.id);
    try {
      await apiFetch(`/admin/tenants/${owner.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: newStatus,
          subscription_id: owner.subscription_id ?? undefined,
        }),
      });
      setOwners(prev => prev.map(o => o.id === owner.id ? { ...o, status: newStatus } : o));
      setSuccess(`✅ Negocio "${owner.name}" ${newStatus === 'active' ? 'activado' : 'desactivado'}`);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTogglingId(null);
    }
  };

  // ── Enviar correos del SaaS (comprobante de alta / recordatorio de pago) ─────
  const [emailingId, setEmailingId] = useState<string | null>(null);
  // Toast flotante de confirmación/error.
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };
  // ── Enviar correo de cambio de contraseña (lo cambia el cliente vía Supabase) ─
  const [pwdSendingId, setPwdSendingId] = useState<string | null>(null);
  const sendPasswordReset = async (owner: OwnerData) => {
    if (!confirm(`¿Enviar un correo de cambio de contraseña al dueño de "${owner.name}"?`)) return;
    setPwdSendingId(owner.id);
    try {
      await apiFetch('/admin/send-password-reset', {
        method: 'POST',
        body: JSON.stringify({ ownerId: owner.owner_id, tenantId: owner.id }),
      });
      showToast(`Correo de cambio de contraseña enviado a "${owner.name}"`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'No se pudo enviar el correo', 'error');
    } finally {
      setPwdSendingId(null);
    }
  };

  const sendAdminEmail = async (owner: OwnerData, kind: 'new-business' | 'payment-reminder') => {
    setEmailingId(owner.id);
    try {
      await apiFetch(`/email/${kind}`, {
        method: 'POST',
        body: JSON.stringify({ tenant_id: owner.id }),
      });
      showToast(kind === 'new-business' ? 'Comprobante mandado' : 'Recordatorio mandado', 'success');
    } catch (err: any) {
      showToast(err?.message || 'No se pudo enviar el correo', 'error');
    } finally {
      setEmailingId(null);
    }
  };

  // ── Change plan ────────────────────────────────────────────────────────────

  const handleChangePlan = async (tenantId: string, newPlanId: string) => {
    if (!newPlanId) return;
    try {
      await apiFetch('/admin/change-plan', {
        method: 'POST',
        body: JSON.stringify({ tenantId, newPlanId }),
      });
      await refreshPlan(tenantId);
      setSuccess('Plan actualizado');
      fetchOwners();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ── Ajustar monto de venta del plan por negocio ─────────────────────────────
  const handleEditPrice = async (o: OwnerData) => {
    const current = o.custom_price ?? o.plan_price ?? 0;
    const input = window.prompt(
      `Monto de venta del plan para "${o.name}" (₡/mes).\nDejá vacío para volver al precio del plan.`,
      String(current),
    );
    if (input === null) return;   // canceló
    const trimmed = input.trim();
    const price = trimmed === '' ? null : Number(trimmed);
    if (price != null && (isNaN(price) || price < 0)) { showToast('Monto inválido', 'error'); return; }
    try {
      await apiFetch('/admin/set-subscription-price', {
        method: 'POST',
        body: JSON.stringify({ tenantId: o.id, price }),
      });
      showToast(price == null ? 'Monto restablecido al del plan' : `Monto actualizado: ₡${price.toLocaleString('es-CR')}`, 'success');
      fetchOwners();
    } catch (err: any) {
      showToast(err?.message || 'No se pudo actualizar el monto', 'error');
    }
  };

  // ── Ajustar días restantes de la suscripción ───────────────────────────────
  const handleEditDays = async (o: OwnerData) => {
    const current = o.is_admin_plan ? '' : String(Math.max(0, daysUntil(effectiveEndsAt(o).date) ?? 0));
    const input = window.prompt(
      `Días restantes para "${o.name}".\nLa fecha de vencimiento se fija en hoy + estos días.`,
      current,
    );
    if (input === null) return;   // canceló
    const days = Number(input.trim());
    if (isNaN(days) || days < 0 || days > 3650) { showToast('Días inválidos (0 a 3650)', 'error'); return; }
    try {
      await apiFetch('/admin/set-subscription-days', {
        method: 'POST',
        body: JSON.stringify({ tenantId: o.id, days }),
      });
      showToast(`Días restantes actualizados: ${days}`, 'success');
      fetchOwners();
    } catch (err: any) {
      showToast(err?.message || 'No se pudieron actualizar los días', 'error');
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDeleteOwner = async (tenantId: string, ownerId: string, businessName: string) => {
    // Doble confirmación: 1) confirm normal, 2) pedir que escriban el nombre.
    if (!confirm(
      `Vas a ELIMINAR el negocio "${businessName}" y TODOS sus datos:\n\n` +
      `· Facturas, productos, gastos, compras, sesiones de caja, usuarios.\n\n` +
      `Esta acción NO se puede deshacer.\n\n¿Continuar?`,
    )) return;
    const typed = prompt(`Para confirmar, escribí el nombre exacto del negocio:\n\n"${businessName}"`);
    if (typed === null) return;
    if (typed.trim() !== businessName.trim()) {
      setError(`El nombre no coincide. Esperaba: "${businessName}". Recibí: "${typed}"`);
      return;
    }
    setLoading(true);
    try {
      await apiFetch('/admin/delete-owner', {
        method: 'POST',
        body: JSON.stringify({ tenantId, ownerId }),
      });
      setSuccess(`✅ Negocio "${businessName}" eliminado`);
      fetchOwners();
    } catch (err: any) {
      setError(err.message || 'Error al eliminar');
    } finally {
      setLoading(false);
    }
  };

  // ── Create owner ───────────────────────────────────────────────────────────

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const validateForm = () => {
    const e = { email: '', password: '', businessName: '' };
    let ok = true;
    if (!formData.email.trim())               { e.email        = 'El email es requerido'; ok = false; }
    else if (!isValidEmail(formData.email))   { e.email        = 'Email inválido'; ok = false; }
    if (!formData.password.trim())            { e.password     = 'La contraseña es requerida'; ok = false; }
    else if (formData.password.length < 6)   { e.password     = 'Mínimo 6 caracteres'; ok = false; }
    if (!formData.businessName.trim())        { e.businessName = 'El nombre del negocio es requerido'; ok = false; }
    setFormErrors(e);
    return ok;
  };

  const handleCreateOwner = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    setError(''); setSuccess('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('admin-create-owner', {
        body: { email: formData.email, password: formData.password, businessName: formData.businessName, planId: formData.planId, withDemo: formData.withDemo },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      // Asignar plan FE si se eligió (si queda vacío, el negocio no usa FE).
      if (formData.fePlanId) {
        try {
          const tenantId = data?.tenant_id ?? data?.tenant?.id;
          let tid = tenantId;
          if (!tid) {
            const list = await apiFetch<any[]>('/admin/owners').catch(() => []);
            tid = (list ?? []).find(o => (o.email ?? '').toLowerCase() === formData.email.toLowerCase())?.id;
          }
          if (tid) await apiFetch(`/admin/tenants/${tid}/fe-plan`, { method: 'PUT', body: JSON.stringify({ fe_plan_id: formData.fePlanId }) });
        } catch { /* no bloquear la creación por el FE */ }
      }
      setSuccess(`✅ Negocio creado — Email: ${formData.email}`);
      setFormData({ email: '', password: '', businessName: '', planId: '', withDemo: false, fePlanId: '' });
      setShowForm(false);
      await new Promise(r => setTimeout(r, 800));
      fetchOwners();
    } catch (err: any) {
      setError(err.message || 'Error al crear');
    } finally {
      setLoading(false);
    }
  };

  // ── KPIs ───────────────────────────────────────────────────────────────────

  const activeOwners   = owners.filter(o => o.status === 'active');
  // El plan Admin NO factura — no debe contar en vencidos ni en alertas.
  const overdueOwners  = owners.filter(o => {
    if (o.is_admin_plan) return false;
    const d = daysUntil(effectiveEndsAt(o).date);
    return d !== null && d < 0 && o.status === 'active';
  });
  const dueSoonOwners  = owners.filter(o => {
    if (o.is_admin_plan) return false;
    const d = daysUntil(effectiveEndsAt(o).date);
    return d !== null && d >= 0 && d <= 7 && o.status === 'active';
  });
  const monthlyRevenue = activeOwners.reduce((s, o) => s + (o.plan_price ?? 0), 0);
  const totalMonthlyInvoices = owners.reduce((s, o) => s + (o.monthly_invoices ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-5 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center">
              <Building2 size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900">Panel Admin</h1>
              <p className="text-gray-400 text-sm">Control de negocios y cobros</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCabys(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition">
              <FileText size={15} /> CABYS
            </button>
            <button onClick={async () => {
                setTestingAlanube(true);
                try {
                  const r = await apiFetch<any>('/admin/alanube/ping');
                  showToast(`Alanube OK · ${r?.env ?? ''} · ${r?.note ?? 'token válido'}`, 'success');
                } catch (e) {
                  showToast(e instanceof Error ? e.message : 'Falló la conexión con Alanube', 'error');
                } finally { setTestingAlanube(false); }
              }}
              disabled={testingAlanube}
              className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition">
              <Sparkles size={15} /> {testingAlanube ? 'Probando…' : 'Probar Alanube'}
            </button>
            <Link to="/plans"
              className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition">
              <Settings size={15} /> Planes
            </Link>
            <button onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition">
              <Plus size={15} /> Nuevo negocio
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white sticky top-19.5 z-10">
        <div className="max-w-7xl mx-auto px-6 flex">
          {[
            { id: 'businesses' as AdminTab, label: 'Negocios',     icon: Building2 },
            { id: 'groups'     as AdminTab, label: 'Grupos',       icon: Layers },
            { id: 'fe_kiosk'   as AdminTab, label: 'FE & Kiosk',   icon: FileText },
            { id: 'receipts'   as AdminTab, label: 'Comprobantes', icon: Receipt },
            { id: 'team'       as AdminTab, label: 'Equipo',       icon: Users2 },
            { id: 'sandbox'    as AdminTab, label: 'Sandbox',      icon: Sparkles },
          ].map(t => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3 font-bold text-sm transition relative ${
                  active ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-gray-500 hover:text-gray-900'
                }`}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'receipts' && (
        <div className="max-w-7xl mx-auto p-6">
          <PaymentReceiptsView owners={owners} />
        </div>
      )}

      {activeTab === 'sandbox' && (
        <div className="max-w-5xl mx-auto p-6">
          <PrinterSandbox />
        </div>
      )}

      {activeTab === 'team' && (
        <div className="max-w-7xl mx-auto p-6">
          <div className="mb-3">
            <h2 className="text-lg font-black text-gray-900">Equipo del sistema</h2>
            <p className="text-sm text-gray-500">Usuarios internos, roles y permisos del panel de administración.</p>
          </div>
          <div className="mb-4 flex items-start gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
            <Users2 size={16} className="text-indigo-600 mt-0.5 shrink-0" />
            <p className="text-sm text-indigo-800">
              <strong>Cuentas del sistema.</strong> Estas son las cuentas del <b>equipo interno</b> con acceso al Panel Admin.
              No son los usuarios de los negocios (esos se gestionan dentro de cada negocio).
            </p>
          </div>
          <UsersModule />
        </div>
      )}

      {activeTab === 'groups' && (
        <div className="max-w-7xl mx-auto p-6">
          <TenantGroupView />
        </div>
      )}

      {activeTab === 'fe_kiosk' && (
        <div className="max-w-7xl mx-auto p-6">
          <AdminFeKioskView />
        </div>
      )}

      {activeTab === 'businesses' && (
      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* Recuento de documentos emitidos por el grupo */}
        <GroupDocCount />

        {/* Alerts */}
        {error   && <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm"><AlertCircle size={16} className="shrink-0 mt-0.5" /><span>{error}</span><button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button></div>}
        {success && <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-700 text-sm"><CheckCircle size={16} /><span>{success}</span></div>}

        {/* Due/overdue alert strip */}
        {(overdueOwners.length > 0 || dueSoonOwners.length > 0) && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2">
              <AlertTriangle size={15} /> Requieren atención
            </p>
            <div className="space-y-2">
              {overdueOwners.map(o => (
                <div key={o.id} className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-red-500 rounded-full shrink-0" />
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{o.name}</p>
                      <p className="text-xs text-gray-500">{o.plan_name} · {o.plan_price ? fmt(o.plan_price) : '—'}/mes</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DaysTag days={daysUntil(effectiveEndsAt(o).date)} />
                    <button onClick={() => setRenewing(o)}
                      className="flex items-center gap-1 px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition">
                      <RefreshCw size={11} /> Renovar
                    </button>
                  </div>
                </div>
              ))}
              {dueSoonOwners.map(o => (
                <div key={o.id} className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-amber-500 rounded-full shrink-0" />
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{o.name}</p>
                      <p className="text-xs text-gray-500">{o.plan_name} · {o.plan_price ? fmt(o.plan_price) : '—'}/mes</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DaysTag days={daysUntil(effectiveEndsAt(o).date)} />
                    <button onClick={() => setRenewing(o)}
                      className="flex items-center gap-1 px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition">
                      <RefreshCw size={11} /> Renovar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { icon: Users,        label: 'Negocios activos',  value: String(activeOwners.length),  color: 'bg-blue-500'    },
            { icon: AlertTriangle,label: 'Vencidos',          value: String(overdueOwners.length), color: overdueOwners.length > 0 ? 'bg-red-500' : 'bg-gray-400' },
            { icon: Clock,        label: 'Vencen esta semana',value: String(dueSoonOwners.length), color: dueSoonOwners.length > 0 ? 'bg-amber-500' : 'bg-gray-400' },
            { icon: TrendingUp,   label: 'Ingreso mensual',   value: fmt(monthlyRevenue),          color: 'bg-emerald-500' },
            { icon: FileText,     label: 'Facturas del mes',  value: String(totalMonthlyInvoices), color: 'bg-violet-500' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center shrink-0`}>
                <Icon size={20} className="text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{label}</p>
                <p className="text-2xl font-black text-gray-900">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Create form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-black text-gray-900 mb-5 flex items-center gap-2">
              <Plus size={18} className="text-emerald-500" /> Crear nuevo negocio
            </h2>
            <form onSubmit={handleCreateOwner} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Email *</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-2.5 text-gray-400" />
                  <input type="email" value={formData.email}
                    onChange={e => { setFormData({ ...formData, email: e.target.value }); if (formErrors.email) setFormErrors({ ...formErrors, email: '' }); }}
                    placeholder="owner@gmail.com"
                    className={`w-full pl-9 pr-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 ${formErrors.email ? 'border-red-400 focus:ring-red-400' : 'border-gray-200 focus:ring-emerald-400'}`} />
                </div>
                {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
              </div>
              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Contraseña *</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-2.5 text-gray-400" />
                  <input type="password" value={formData.password}
                    onChange={e => { setFormData({ ...formData, password: e.target.value }); if (formErrors.password) setFormErrors({ ...formErrors, password: '' }); }}
                    placeholder="Mínimo 6 caracteres"
                    className={`w-full pl-9 pr-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 ${formErrors.password ? 'border-red-400 focus:ring-red-400' : 'border-gray-200 focus:ring-emerald-400'}`} />
                </div>
                {formErrors.password && <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>}
              </div>
              {/* Business name */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Nombre del negocio *</label>
                <div className="relative">
                  <Building2 size={15} className="absolute left-3 top-2.5 text-gray-400" />
                  <input type="text" value={formData.businessName}
                    onChange={e => { setFormData({ ...formData, businessName: e.target.value }); if (formErrors.businessName) setFormErrors({ ...formErrors, businessName: '' }); }}
                    placeholder="Mi Restaurante"
                    className={`w-full pl-9 pr-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 ${formErrors.businessName ? 'border-red-400 focus:ring-red-400' : 'border-gray-200 focus:ring-emerald-400'}`} />
                </div>
                {formErrors.businessName && <p className="text-red-500 text-xs mt-1">{formErrors.businessName}</p>}
              </div>
              {/* Plan */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Plan</label>
                <select value={formData.planId} onChange={e => setFormData({ ...formData, planId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                  <option value="">Sin plan (opcional)</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name} — {fmt(p.price)}/mes</option>)}
                </select>
              </div>
              {/* Plan de Facturación Electrónica (opcional) */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Plan Facturación Electrónica</label>
                <select value={formData.fePlanId} onChange={e => setFormData({ ...formData, fePlanId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                  <option value="">Sin FE (dejar vacío)</option>
                  {fePlans.filter(p => p.is_active).map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.docsPerMonth == null ? ' — ilimitado' : ` — ${p.docsPerMonth}/mes`}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2 flex items-center gap-2 bg-blue-50 rounded-xl p-3">
                <input type="checkbox" id="withDemo" checked={formData.withDemo}
                  onChange={e => setFormData({ ...formData, withDemo: e.target.checked })}
                  className="w-4 h-4 text-emerald-500 rounded" />
                <label htmlFor="withDemo" className="text-sm text-gray-700 font-medium">
                  Crear como DEMO (30 días de prueba)
                </label>
              </div>
              <div className="md:col-span-2 flex gap-3">
                <button type="submit" disabled={loading}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-xl transition text-sm">
                  {loading ? 'Creando...' : 'Crear negocio'}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl transition text-sm">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 flex-wrap">
            <p className="font-black text-gray-800 shrink-0">
              {(() => {
                const filteredCount = owners.filter(o => {
                  const t = searchTerm.trim().toLowerCase();
                  if (!t) return true;
                  return o.name?.toLowerCase().includes(t)
                      || o.plan_name?.toLowerCase().includes(t)
                      || o.subscription_status?.toLowerCase().includes(t);
                }).length;
                return searchTerm
                  ? `${filteredCount} de ${owners.length} negocio${owners.length !== 1 ? 's' : ''}`
                  : `${owners.length} negocio${owners.length !== 1 ? 's' : ''} registrado${owners.length !== 1 ? 's' : ''}`;
              })()}
            </p>

            {/* Buscador */}
            <div className="relative flex-1 min-w-48 max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre, plan…"
                className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  title="Limpiar"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Toggle para mostrar/ocultar sucursales (branches) */}
            {owners.some(o => o.group_role === 'branch') && (
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer transition">
                <input
                  type="checkbox"
                  checked={showBranches}
                  onChange={e => setShowBranches(e.target.checked)}
                  className="w-3.5 h-3.5 rounded"
                />
                Mostrar sucursales
                <span className="text-[10px] font-bold text-gray-400">
                  ({owners.filter(o => o.group_role === 'branch').length})
                </span>
              </label>
            )}

            <button onClick={fetchOwners} disabled={loading}
              className="p-2 border border-gray-200 rounded-xl hover:border-gray-300 text-gray-500 transition"
              title="Recargar">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
              <RefreshCw size={18} className="animate-spin" /> Cargando...
            </div>
          ) : owners.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Building2 size={36} className="text-gray-200" />
              <p className="text-gray-400 text-sm">No hay negocios registrados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Negocio</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">
                      <span className="inline-flex items-center gap-1"><Layers size={11} /> Grupo · Cuota mes</span>
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Plan · Precio</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase"><span className="flex items-center gap-1"><Calendar size={11} /> Activación</span></th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Próximo cobro</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Días restantes</th>
                    <th className="text-center px-5 py-3 text-xs font-bold text-gray-500 uppercase" title="Facturas no anuladas emitidas este mes — para tracking de Facturación Electrónica">
                      <span className="inline-flex items-center gap-1"><FileText size={11} /> Facturas (mes)</span>
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-bold text-gray-500 uppercase" title="Bolsa de comprobantes electrónicos: quedan / límite · vence al año del inicio">
                      <span className="inline-flex items-center gap-1"><FileText size={11} /> Docs FE · Vence</span>
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-bold text-gray-500 uppercase" title="Facturas hechas por Distribución (ruta/camión) este mes">
                      <span className="inline-flex items-center gap-1"><Truck size={11} /> Distribución</span>
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-bold text-gray-500 uppercase">Estado</th>
                    <th className="text-center px-5 py-3 text-xs font-bold text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(() => {
                    const t = searchTerm.trim().toLowerCase();
                    // Filtrá las sucursales (branches) por defecto: la matriz
                    // del grupo ya las representa en la vista consolidada.
                    const baseList = showBranches
                      ? owners
                      : owners.filter(o => o.group_role !== 'branch');
                    const filtered = !t
                      ? baseList
                      : baseList.filter(o =>
                          o.name?.toLowerCase().includes(t)
                          || o.plan_name?.toLowerCase().includes(t)
                          || o.subscription_status?.toLowerCase().includes(t),
                        );
                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={10} className="px-5 py-10 text-center text-gray-400 text-sm">
                            No se encontraron negocios con "{searchTerm}"
                          </td>
                        </tr>
                      );
                    }
                    return filtered.map(o => {
                    const eff       = effectiveEndsAt(o);
                    // El plan Admin no factura: ocultamos próximo cobro / días.
                    const days      = o.is_admin_plan ? null : daysUntil(eff.date);
                    const isActive  = o.status === 'active';
                    const isBusy    = togglingId === o.id;
                    // Bolsa FE por vencer/agotada → resaltar la fila.
                    const fq = feQuotas[o.id];
                    const feExpDays = (fq && !fq.unlimited && fq.expires_at)
                      ? Math.ceil((new Date(fq.expires_at).getTime() - Date.now()) / 86400000) : null;
                    const feAlert = !!fq && !fq.unlimited && isActive &&
                      (((fq.available ?? 0) <= 0) || (feExpDays !== null && feExpDays <= 30));
                    return (
                      <tr key={o.id} className={`hover:bg-gray-50/50 transition ${!isActive ? 'opacity-60' : ''} ${days !== null && days < 0 && isActive ? 'bg-red-50/20' : feAlert ? 'bg-amber-50/40' : ''}`}>
                        {/* Negocio */}
                        <td className="px-5 py-4">
                          <p className="font-bold text-gray-900">{o.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {o.is_admin_plan ? (
                              <span className="text-xs px-1.5 py-0.5 rounded-full font-black bg-amber-100 text-amber-800 uppercase tracking-wider">
                                ⭐ Admin
                              </span>
                            ) : (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${o.is_demo ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`}>
                                {o.is_demo ? 'DEMO' : 'PAGO'}
                              </span>
                            )}
                          </div>
                        </td>
                        {/* Grupo · Cuota mensual */}
                        <td className="px-5 py-4">
                          {o.group_name ? (
                            <>
                              <p className="inline-flex items-center gap-1 text-xs font-bold text-cyan-700">
                                <Layers size={11} />
                                <span className="truncate max-w-32">{o.group_name}</span>
                                {o.group_role === 'main' && (
                                  <span className="text-[9px] font-black px-1 py-0.5 rounded bg-amber-100 text-amber-800 uppercase">
                                    Matriz
                                  </span>
                                )}
                              </p>
                              {o.group_billing != null && o.group_billing > 0 && (
                                <p className="text-sm font-black text-emerald-700 tabular-nums mt-0.5">
                                  {fmt(o.group_billing)}/mes
                                </p>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-gray-300">Sin grupo</span>
                          )}
                        </td>
                        {/* Plan */}
                        <td className="px-5 py-4">
                          <p className="font-semibold text-gray-800">{o.plan_name}</p>
                          <p className="text-xs text-gray-400">{o.plan_price ? fmt(o.plan_price) + '/mes' : '—'}</p>
                        </td>
                        {/* Activación */}
                        <td className="px-5 py-4 text-gray-600 text-xs">{fmtDate(o.started_at ?? o.created_at)}</td>
                        {/* Próximo cobro — usa fecha efectiva (real o calculada del ciclo) */}
                        <td className="px-5 py-4">
                          {o.is_admin_plan ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                              ∞ Sin vencimiento
                            </span>
                          ) : (
                            <>
                              <p className={`text-sm font-semibold ${days !== null && days < 0 ? 'text-red-600' : days !== null && days <= 7 ? 'text-amber-600' : 'text-gray-700'}`}>
                                {fmtDate(eff.date ?? undefined)}
                              </p>
                              {eff.computed && (
                                <p className="text-[10px] text-gray-400 italic mt-0.5" title="No hay fecha de fin en la suscripción; se calculó a partir de la activación y el ciclo del plan.">
                                  estimado
                                </p>
                              )}
                            </>
                          )}
                        </td>
                        {/* Días */}
                        <td className="px-5 py-4">
                          {o.is_admin_plan ? (
                            <span className="text-xs text-gray-400">—</span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <DaysTag days={days} />
                              <button onClick={() => handleEditDays(o)} title="Cambiar días restantes"
                                className="p-1 rounded-md text-gray-400 hover:text-cyan-700 hover:bg-cyan-50">
                                <Pencil size={12} />
                              </button>
                            </div>
                          )}
                        </td>
                        {/* Facturas del mes — para Facturación Electrónica futura */}
                        <td className="px-5 py-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold tabular-nums ${
                              (o.monthly_invoices ?? 0) === 0
                                ? 'bg-gray-100 text-gray-500'
                                : 'bg-violet-100 text-violet-700'
                            }`}
                            title={`${o.monthly_invoices ?? 0} facturas emitidas este mes (excluye anuladas)`}
                          >
                            <FileText size={11} />
                            {(o.monthly_invoices ?? 0).toLocaleString('es-CR')}
                          </span>
                        </td>
                        {/* Docs electrónicos: bolsa (quedan/límite) + vencimiento a 1 año */}
                        <td className="px-5 py-4 text-center">
                          {(() => {
                            const q = feQuotas[o.id];
                            // Sin FE del todo → aviso claro (no un simple guion).
                            if (!q) return <span className="text-[11px] font-semibold text-gray-400" title="Este negocio no tiene facturación electrónica activa">Sin FE</span>;
                            // FE activa pero sin límite de bolsa.
                            if (q.unlimited) return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700" title="Facturación electrónica ilimitada (sin bolsa)"><FileText size={11} /> Ilimitado</span>;
                            const available = q.available ?? 0;
                            const included = q.included ?? 0;
                            const daysToExp = q.expires_at ? Math.ceil((new Date(q.expires_at).getTime() - Date.now()) / 86400000) : null;
                            const lowDocs = available <= 10;
                            const soon = daysToExp !== null && daysToExp <= 30;
                            const expired = daysToExp !== null && daysToExp < 0;
                            return (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold tabular-nums ${
                                  available <= 0 ? 'bg-red-100 text-red-700' : lowDocs ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                                }`} title={`${available} disponibles de ${included} · usados ${q.used ?? 0}`}>
                                  <FileText size={11} />
                                  {Math.max(0, available).toLocaleString('es-CR')}/{included.toLocaleString('es-CR')}
                                </span>
                                <span className={`text-[10px] font-semibold ${expired ? 'text-red-600' : soon ? 'text-amber-600' : 'text-gray-400'}`}
                                  title="Vence al año del inicio de la bolsa">
                                  {expired ? '⚠ venció ' : soon ? `⚠ vence en ${daysToExp}d · ` : 'vence '}
                                  {q.expires_at ? new Date(q.expires_at).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        {/* Facturas por Distribución */}
                        <td className="px-5 py-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold tabular-nums ${
                              (o.distribution_invoices ?? 0) === 0
                                ? 'bg-gray-100 text-gray-500'
                                : 'bg-cyan-100 text-cyan-700'
                            }`}
                            title={`${o.distribution_invoices ?? 0} facturas hechas por Distribución este mes`}
                          >
                            <Truck size={11} />
                            {(o.distribution_invoices ?? 0).toLocaleString('es-CR')}
                          </span>
                        </td>
                        {/* Estado */}
                        <td className="px-5 py-4 text-center">
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                            isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {isActive ? '● Activo' : '● Suspendido'}
                          </span>
                        </td>
                        {/* Acciones — menú desplegable */}
                        <td className="px-5 py-4">
                          <div className="relative flex justify-center">
                            <button onClick={() => setOpenMenuId(openMenuId === o.id ? null : o.id)}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition">
                              <MoreHorizontal size={14} /> Acciones
                            </button>
                            {openMenuId === o.id && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
                                <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 text-left">
                                  <button onClick={() => { setOpenMenuId(null); setRenewing(o); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50">
                                    <RefreshCw size={13} /> Renovar suscripción
                                  </button>
                                  <button onClick={() => { setOpenMenuId(null); handleEditDays(o); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-cyan-700 hover:bg-cyan-50">
                                    <Calendar size={13} /> Cambiar días restantes
                                  </button>
                                  <button onClick={() => { setOpenMenuId(null); handleToggleStatus(o); }} disabled={isBusy}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold disabled:opacity-40 ${isActive ? 'text-orange-700 hover:bg-orange-50' : 'text-emerald-700 hover:bg-emerald-50'}`}>
                                    <Power size={13} /> {isActive ? 'Desactivar' : 'Activar'}
                                  </button>
                                  <button onClick={() => { setOpenMenuId(null); handleEditPrice(o); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                                    <Receipt size={13} /> Ajustar monto {o.custom_price != null && '✎'}
                                  </button>
                                  <div className="px-3 py-1.5">
                                    <select onChange={e => { handleChangePlan(o.id, e.target.value); setOpenMenuId(null); }} defaultValue=""
                                      className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-600">
                                      <option value="">Cambiar plan…</option>
                                      {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                  </div>
                                  <div className="px-3 py-1.5">
                                    <select onChange={e => { if (e.target.value) { assignFePlan(o.id, e.target.value === '__none__' ? '' : e.target.value); setOpenMenuId(null); } }} defaultValue=""
                                      className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-600">
                                      <option value="">Plan FE…</option>
                                      <option value="__none__">— Quitar FE —</option>
                                      {fePlans.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                  </div>
                                  <button onClick={() => { setOpenMenuId(null); setManageFeFor(o); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50">
                                    <FileText size={13} /> Datos de FE (ApiKey + emisor)
                                  </button>
                                  <button onClick={() => { setOpenMenuId(null); createAlanubeCompany(o); }} disabled={creatingAlanubeId === o.id}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-cyan-700 hover:bg-cyan-50 disabled:opacity-40">
                                    <Sparkles size={13} /> {creatingAlanubeId === o.id ? 'Creando en Alanube…' : 'Crear empresa en Alanube'}
                                  </button>
                                  <button onClick={() => { setOpenMenuId(null); setEmisorApiKey(o); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50">
                                    <KeyRound size={13} /> ApiKey del emisor (rápido)
                                  </button>
                                  <button onClick={() => { setOpenMenuId(null); toggleFeEnabled(o); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-teal-700 hover:bg-teal-50">
                                    <FileText size={13} /> Habilitar / deshabilitar FE
                                  </button>
                                  <button onClick={() => { setOpenMenuId(null); setManageUsersFor(o); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-50">
                                    <Users2 size={13} /> Usuarios de la empresa
                                  </button>
                                  <button onClick={() => { setOpenMenuId(null); setManageModulesFor(o); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-50">
                                    <Layers size={13} /> Módulos personalizados
                                  </button>
                                  <button onClick={() => { setOpenMenuId(null); setImportProductsFor(o); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50">
                                    <FileText size={13} /> Importar productos (Excel)
                                  </button>
                                  <div className="my-1 border-t border-gray-100" />
                                  <button onClick={() => { setOpenMenuId(null); sendAdminEmail(o, 'new-business'); }} disabled={emailingId === o.id}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-40">
                                    <Mail size={13} /> Comprobante de alta
                                  </button>
                                  <button onClick={() => { setOpenMenuId(null); setInvoiceFor(o); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50">
                                    <Mail size={13} /> Cobro personalizado
                                  </button>
                                  <button onClick={() => { setOpenMenuId(null); sendAdminEmail(o, 'payment-reminder'); }} disabled={emailingId === o.id}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-40">
                                    <Mail size={13} /> Recordatorio de pago
                                  </button>
                                  <button onClick={() => { setOpenMenuId(null); sendPasswordReset(o); }} disabled={pwdSendingId === o.id}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-40">
                                    <Lock size={13} /> Cambiar clave
                                  </button>
                                  <div className="my-1 border-t border-gray-100" />
                                  <button onClick={() => { setOpenMenuId(null); handleDeleteOwner(o.id, o.owner_id, o.name); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50">
                                    <Trash2 size={13} /> Eliminar negocio
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  });
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      )}

      {showCabys && <CabysImport onClose={() => setShowCabys(false)} />}

      {/* Renew modal */}
      {renewing && (
        <RenewModal
          owner={renewing}
          onClose={() => setRenewing(null)}
          onDone={fetchOwners}
        />
      )}

      {/* Cobro personalizado */}
      {invoiceFor && (
        <CustomInvoiceModal
          owner={invoiceFor}
          onClose={() => setInvoiceFor(null)}
          onSent={(msg) => { setInvoiceFor(null); showToast(msg, 'success'); }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {/* Usuarios de la empresa */}
      {manageUsersFor && (
        <TenantUsersModal
          owner={manageUsersFor}
          onClose={() => setManageUsersFor(null)}
          onToast={showToast}
        />
      )}

      {/* Módulos personalizados por empresa */}
      {manageModulesFor && (
        <TenantModulesModal
          owner={manageModulesFor}
          onClose={() => setManageModulesFor(null)}
          onToast={showToast}
        />
      )}

      {/* Importar productos por Excel para una empresa (modo admin) */}
      {importProductsFor && (
        <BulkProductImportModal
          adminMode
          tenantId={importProductsFor.id}
          onClose={() => setImportProductsFor(null)}
          onDone={(count) => {
            setImportProductsFor(null);
            showToast(count > 0 ? `${count} producto(s) importado(s)` : 'No se importó ningún producto', count > 0 ? 'success' : 'error');
          }}
        />
      )}

      {/* Datos de Facturación Electrónica por empresa */}
      {manageFeFor && (
        <TenantFeDataModal
          owner={manageFeFor}
          onClose={() => setManageFeFor(null)}
          onToast={showToast}
        />
      )}

      {/* Toast flotante */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] animate-[slideIn_.2s_ease-out]">
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-bold text-white ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}>
            {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            <span>{toast.msg}</span>
            <button onClick={() => setToast(null)} className="ml-1 opacity-80 hover:opacity-100"><X size={15} /></button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateOwner;
