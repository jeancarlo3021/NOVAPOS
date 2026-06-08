import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { plansService, Plan } from '@/services/users/plansService';
import { useAuth } from '@/context/AuthContext';
import { Link } from 'react-router-dom';
import {
  Plus, Trash2, AlertCircle, CheckCircle, Settings, Mail, Lock,
  Building2, Calendar, RefreshCw, Power,
  Clock, TrendingUp, Users, AlertTriangle, X, Receipt, FileText, Search, Sparkles,
} from 'lucide-react';
import { DaysTag } from './components/DaysTag';
import { RenewModal } from './components/RenewModal';
import type { OwnerData } from './components/RenewModal';
import { PaymentReceiptsView } from './components/PaymentReceiptsView';
import { PrinterSandbox } from './components/PrinterSandbox';

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

type AdminTab = 'businesses' | 'receipts' | 'sandbox';

export const CreateOwner: React.FC = () => {
  const { refreshPlan } = useAuth();
  const [owners,    setOwners]    = useState<OwnerData[]>([]);
  const [plans,     setPlans]     = useState<Plan[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');
  const [showForm,  setShowForm]  = useState(false);
  const [renewing,  setRenewing]  = useState<OwnerData | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('businesses');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    email: '', password: '', businessName: '', planId: '', withDemo: false,
  });
  const [formErrors, setFormErrors] = useState({ email: '', password: '', businessName: '' });

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
        apiFetch<Array<{ tenant_id: string; count: number }>>('/admin/invoices-monthly'),
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
          plan_price:          plan?.price ?? 0,
          plan_billing_cycle:  plan?.billing_cycle ?? 'monthly',
          is_admin_plan:       ((plan?.features as any)?.admin_dashboard === true),
          subscription_id:     row.sub_id ?? null,
          subscription_status: row.sub_status ?? '—',
          started_at:          row.started_at ?? null,
          ends_at:             row.ends_at ?? null,
          monthly_invoices:    countMap.get(row.id) ?? 0,
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
      setSuccess(`✅ Negocio creado — Email: ${formData.email}`);
      setFormData({ email: '', password: '', businessName: '', planId: '', withDemo: false });
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
            { id: 'receipts'   as AdminTab, label: 'Comprobantes', icon: Receipt },
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

      {activeTab === 'businesses' && (
      <div className="max-w-7xl mx-auto p-6 space-y-6">

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
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Plan · Precio</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase"><span className="flex items-center gap-1"><Calendar size={11} /> Activación</span></th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Próximo cobro</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Días restantes</th>
                    <th className="text-center px-5 py-3 text-xs font-bold text-gray-500 uppercase" title="Facturas no anuladas emitidas este mes — para tracking de Facturación Electrónica">
                      <span className="inline-flex items-center gap-1"><FileText size={11} /> Facturas (mes)</span>
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-bold text-gray-500 uppercase">Estado</th>
                    <th className="text-center px-5 py-3 text-xs font-bold text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(() => {
                    const t = searchTerm.trim().toLowerCase();
                    const filtered = !t
                      ? owners
                      : owners.filter(o =>
                          o.name?.toLowerCase().includes(t)
                          || o.plan_name?.toLowerCase().includes(t)
                          || o.subscription_status?.toLowerCase().includes(t),
                        );
                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={8} className="px-5 py-10 text-center text-gray-400 text-sm">
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
                    return (
                      <tr key={o.id} className={`hover:bg-gray-50/50 transition ${!isActive ? 'opacity-60' : ''} ${days !== null && days < 0 && isActive ? 'bg-red-50/20' : ''}`}>
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
                            <DaysTag days={days} />
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
                        {/* Estado */}
                        <td className="px-5 py-4 text-center">
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                            isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {isActive ? '● Activo' : '● Suspendido'}
                          </span>
                        </td>
                        {/* Acciones */}
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            {/* Renovar */}
                            <button onClick={() => setRenewing(o)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100 transition"
                              title="Renovar suscripción">
                              <RefreshCw size={11} /> Renovar
                            </button>
                            {/* Activar/Desactivar */}
                            <button onClick={() => handleToggleStatus(o)} disabled={isBusy}
                              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg border transition disabled:opacity-40 ${
                                isActive
                                  ? 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100'
                                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                              }`}
                              title={isActive ? 'Desactivar' : 'Activar'}>
                              {isBusy ? <RefreshCw size={11} className="animate-spin" /> : <Power size={11} />}
                              {isActive ? 'Desactivar' : 'Activar'}
                            </button>
                            {/* Cambiar plan */}
                            <select onChange={e => handleChangePlan(o.id, e.target.value)} defaultValue=""
                              className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white text-gray-600 hover:border-gray-300 transition">
                              <option value="">Cambiar plan</option>
                              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            {/* Eliminar */}
                            <button
                              onClick={() => handleDeleteOwner(o.id, o.owner_id, o.name)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-600 hover:text-white hover:border-red-600 transition"
                              title="Eliminar negocio (requiere confirmación con nombre)"
                            >
                              <Trash2 size={11} /> Eliminar
                            </button>
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

      {/* Renew modal */}
      {renewing && (
        <RenewModal
          owner={renewing}
          onClose={() => setRenewing(null)}
          onDone={fetchOwners}
        />
      )}
    </div>
  );
};

export default CreateOwner;
