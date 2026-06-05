import { useState, useEffect } from 'react';
import {
  Edit2, Plus, X, ShoppingCart, Package, BarChart2,
  TrendingDown, Settings, Users, CreditCard, Smartphone,
  Percent, ClipboardList, Check, ChevronRight, Wallet,
  BookOpen, UserCog, Tag, LayoutGrid,
  Layers, Box, Truck, AlertTriangle, Sliders, Monitor,
  Banknote, FileX, TrendingUp, Clock, DollarSign,
  Activity, Shield, CalendarDays, History,
  FileText, User, Search, Building,
} from 'lucide-react';
import { subscriptionPlansService, SubscriptionPlan } from '@/services/users/subscriptionPlansService';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { PlanFeatures, DEFAULT_FEATURES, useAuth } from '@/context/AuthContext';

// ── Toggle component ──────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-40 ${
        checked ? 'bg-emerald-500' : 'bg-gray-200'
      }`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  );
}

// ── Feature row ───────────────────────────────────────────────────────────────

function FeatureRow({
  icon: Icon, color, title, description, checked, onChange, children,
}: {
  icon: React.ElementType; color: string; title: string; description: string;
  checked: boolean; onChange: (v: boolean) => void; children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border-2 transition-colors ${checked ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-100 bg-gray-50'}`}>
      <div className="flex items-center gap-4 p-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          <Icon size={19} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm">{title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
        <Toggle checked={checked} onChange={onChange} />
      </div>
      {checked && children && (
        <div className="px-4 pb-4 space-y-2 border-t border-emerald-100 pt-3 ml-14">
          {children}
        </div>
      )}
    </div>
  );
}

function SubFeatureRow({
  icon: Icon, color, title, description, checked, onChange,
}: {
  icon: React.ElementType; color: string; title: string; description: string;
  checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${checked ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'}`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={14} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Plans() {
  const { tenant, refreshPlan } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showFeaturesModal, setShowFeaturesModal] = useState(false);
  const [formData, setFormData] = useState<Partial<SubscriptionPlan>>({});
  const [features, setFeatures] = useState<PlanFeatures>(DEFAULT_FEATURES);
  const [saving, setSaving] = useState(false);
  useOfflineSync();

  useEffect(() => { fetchPlans(); }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      setPlans(await subscriptionPlansService.getAllPlans());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditPlan = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setFormData(plan);
    setShowModal(true);
  };

  const handleOpenFeatures = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setFeatures({ ...DEFAULT_FEATURES, ...(plan.features as Partial<PlanFeatures> || {}) });
    setShowFeaturesModal(true);
  };

  const handleSave = async () => {
    if (!selectedPlan) return;
    setSaving(true);
    try {
      await subscriptionPlansService.updatePlan(selectedPlan.id, formData);
      setShowModal(false);
      setPlans(plans.map(p => p.id === selectedPlan.id ? { ...p, ...formData } as SubscriptionPlan : p));
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleSaveFeatures = async () => {
    if (!selectedPlan) return;
    setSaving(true);
    try {
      // Normaliza: cada flag se guarda como booleano explícito (los undefined
      // que JSON.stringify dropearía causaban que el toggle "off" no persistiera).
      const explicit = { ...DEFAULT_FEATURES, ...features } as PlanFeatures;
      await subscriptionPlansService.updatePlan(selectedPlan.id, { features: explicit });
      setShowFeaturesModal(false);
      setPlans(plans.map(p => p.id === selectedPlan.id ? { ...p, features: explicit } as SubscriptionPlan : p));

      // Si el plan editado es el del tenant actual, refresca el AuthContext
      // para que los cambios se reflejen sin tener que recargar / reloguear.
      if (tenant?.id && selectedPlan.id === tenant.plan_id) {
        try { await refreshPlan(tenant.id); } catch {}
      }
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleToggleStatus = async (plan: SubscriptionPlan) => {
    try {
      await subscriptionPlansService.togglePlanStatus(plan.id, !plan.is_active);
      setPlans(plans.map(p => p.id === plan.id ? { ...p, is_active: !p.is_active } : p));
    } catch (err: any) { setError(err.message); }
  };

  const feat = (plan: SubscriptionPlan) =>
    ({ ...DEFAULT_FEATURES, ...(plan.features as Partial<PlanFeatures> || {}) });

  const featureSummary = (pf: PlanFeatures): string[] => {
    const a: string[] = [];
    if (pf.pos) {
      a.push('POS');
      if (pf.pos_card) a.push('Datáfono');
      if (pf.pos_sinpe) a.push('SINPE');
      if (pf.pos_discount) a.push('Descuentos');
    }
    if (pf.inventory) {
      a.push(pf.inventory_products_only ? 'Inventario básico' : 'Inventario completo');
      if (pf.inventory_mixed_stock) a.push('Stock mixto');
    }
    if (pf.reports) a.push(pf.reports_basic ? 'Reportes básicos' : 'Reportes completos');
    if (pf.expenses) a.push('Gastos');
    if (pf.purchases) a.push('Compras');
    if (pf.accounts_payable) a.push('Cuentas por Pagar');
    if ((pf as any).multi_branch) {
      a.push('Sucursales');
      if ((pf as any).multi_branch_transfers) a.push('Transferencias');
    }
    if (pf.promotions) a.push('Promociones');
    if (pf.tables)     a.push('Mapa de Mesas');
    if (pf.recipes) a.push('Recetas');
    if (pf.hr) a.push('Recursos Humanos');
    if (pf.settings) a.push('Configuración');
    if (pf.users) a.push('Usuarios');
    return a;
  };

  const set = (patch: Partial<PlanFeatures>) => setFeatures(prev => ({ ...prev, ...patch }));

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando planes...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Gestión de Planes</h1>
          <p className="text-gray-400 text-sm mt-0.5">{plans.length} planes configurados</p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl transition">
          <Plus size={18} /> Nuevo Plan
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex justify-between">
          {error}
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {plans.map(plan => {
          const pf = feat(plan);
          const summary = featureSummary(pf);
          return (
            <div key={plan.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
              {/* Card header */}
              <div className="px-5 pt-5 pb-4 border-b border-gray-50">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-black text-gray-900">{plan.name}</h3>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    plan.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {plan.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{plan.description}</p>
                <div className="mt-3">
                  <span className="text-3xl font-black text-blue-600">${plan.price}</span>
                  <span className="text-gray-400 text-sm ml-1">/{plan.billing_cycle}</span>
                </div>
              </div>

              {/* Limits */}
              <div className="px-5 py-3 text-xs text-gray-500 space-y-1 border-b border-gray-50">
                <div className="flex justify-between"><span>Usuarios</span><span className="font-bold text-gray-700">{plan.max_users ?? '∞'}</span></div>
                <div className="flex justify-between"><span>Productos</span><span className="font-bold text-gray-700">{plan.max_products ?? '∞'}</span></div>
                <div className="flex justify-between"><span>Órdenes</span><span className="font-bold text-gray-700">{plan.max_orders ?? '∞'}</span></div>
              </div>

              {/* Features chips */}
              <div className="px-5 py-3 flex-1">
                {summary.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Sin características</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {summary.map(f => (
                      <span key={f} className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded-full">
                        <Check size={10} /> {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="px-5 pb-5 pt-3 border-t border-gray-50 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleEditPlan(plan)}
                    className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition"
                  >
                    <Edit2 size={13} /> Editar
                  </button>
                  <button
                    onClick={() => handleOpenFeatures(plan)}
                    className="flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition"
                  >
                    <ChevronRight size={13} /> Módulos
                  </button>
                </div>
                <button
                  onClick={() => handleToggleStatus(plan)}
                  className={`w-full text-xs font-bold px-3 py-2 rounded-lg transition ${
                    plan.is_active
                      ? 'bg-red-50 text-red-600 hover:bg-red-100'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  {plan.is_active ? 'Desactivar plan' : 'Activar plan'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── MODAL: Editar plan ── */}
      {showModal && selectedPlan && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h2 className="text-lg font-black text-gray-900">Editar Plan</h2>
                <p className="text-xs text-gray-400">{selectedPlan.name}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nombre del Plan</label>
                <input type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Descripción</label>
                <textarea value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })}
                  rows={2} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Precio</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input type="number" value={formData.price || ''} onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                      step="0.01" className="w-full border border-gray-200 rounded-xl pl-7 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Ciclo</label>
                  <select value={formData.billing_cycle || ''} onChange={e => setFormData({ ...formData, billing_cycle: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm bg-white">
                    <option value="monthly">Mensual</option>
                    <option value="yearly">Anual</option>
                    <option value="lifetime">Vitalicio</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Máx. Usuarios', key: 'max_users' },
                  { label: 'Máx. Productos', key: 'max_products' },
                  { label: 'Máx. Órdenes', key: 'max_orders' },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
                    <input type="number" value={(formData as any)[key] || ''} onChange={e => setFormData({ ...formData, [key]: parseInt(e.target.value) })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm" />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white font-bold py-2.5 rounded-xl transition text-sm">
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
              <button onClick={() => setShowModal(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl transition text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Características (layout horizontal) ── */}
      {showFeaturesModal && selectedPlan && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[92vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-lg font-black text-gray-900">Módulos del Plan</h2>
                <p className="text-xs text-gray-400">{selectedPlan.name} · control total sobre lo que ofreces</p>
              </div>
              <button onClick={() => setShowFeaturesModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition">
                <X size={20} />
              </button>
            </div>

            {/* Body — grid horizontal por categoría */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">

                {/* ── Columna 1: Ventas / POS ────────────────────────────── */}
                <section className="space-y-3">
                  <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-wider px-1">Ventas</h3>

                  <FeatureRow icon={ShoppingCart} color="bg-blue-500" title="Punto de Venta (POS)"
                    description="Caja y ventas" checked={features.pos} onChange={v => set({ pos: v })}>
                    <SubFeatureRow icon={CreditCard} color="bg-blue-400" title="Datáfono / Tarjeta"
                      description="Cobro con tarjeta" checked={features.pos_card} onChange={v => set({ pos_card: v })} />
                    <SubFeatureRow icon={Smartphone} color="bg-violet-500" title="SINPE Móvil"
                      description="Cobro por SINPE" checked={features.pos_sinpe} onChange={v => set({ pos_sinpe: v })} />
                    <SubFeatureRow icon={Percent} color="bg-orange-400" title="Descuentos"
                      description="Aplicar descuentos por producto" checked={features.pos_discount} onChange={v => set({ pos_discount: v })} />
                    <SubFeatureRow icon={Banknote} color="bg-emerald-400" title="Gestión de Caja"
                      description="Apertura y cierre de caja" checked={!!features.pos_cash_management} onChange={v => set({ pos_cash_management: v })} />
                    <SubFeatureRow icon={Monitor} color="bg-cyan-500" title="Display de Cliente"
                      description="Pantalla secundaria para el cliente" checked={!!features.pos_customer_display} onChange={v => set({ pos_customer_display: v })} />
                    <SubFeatureRow icon={FileX} color="bg-red-400" title="Anular Facturas"
                      description="Permite anular facturas emitidas" checked={!!features.pos_void_invoice} onChange={v => set({ pos_void_invoice: v })} />
                    <SubFeatureRow icon={FileText} color="bg-blue-500" title="N° Próxima Factura"
                      description="Muestra el consecutivo siguiente en modo escritorio" checked={!!features.pos_invoice_preview} onChange={v => set({ pos_invoice_preview: v })} />
                    <SubFeatureRow icon={User} color="bg-emerald-500" title="Campo de Cliente"
                      description="Permite asociar un cliente a la factura" checked={!!features.pos_customer_field} onChange={v => set({ pos_customer_field: v })} />
                    <SubFeatureRow icon={Search} color="bg-violet-500" title="Buscar por Código / Nombre"
                      description="Tabs separados de búsqueda en modo escritorio" checked={!!features.pos_search_tabs} onChange={v => set({ pos_search_tabs: v })} />
                  </FeatureRow>

                  <FeatureRow icon={Tag} color="bg-violet-500" title="Promociones"
                    description="Descuentos y ofertas en el POS" checked={features.promotions ?? false} onChange={v => set({ promotions: v })} />

                  <FeatureRow icon={LayoutGrid} color="bg-blue-500" title="Mapa de Mesas"
                    description="Canvas de mesas para restaurantes" checked={features.tables ?? false} onChange={v => set({ tables: v })} />

                  <FeatureRow icon={BookOpen} color="bg-lime-500" title="Recetas"
                    description="Recetas e ingredientes" checked={features.recipes ?? false} onChange={v => set({ recipes: v })} />
                </section>

                {/* ── Columna 2: Inventario y Operaciones ─────────────── */}
                <section className="space-y-3">
                  <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-wider px-1">Inventario y Operaciones</h3>

                  <FeatureRow icon={Package} color="bg-emerald-500" title="Inventario"
                    description="Productos y stock" checked={features.inventory} onChange={v => set({ inventory: v })}>
                    <SubFeatureRow icon={Box} color="bg-emerald-400" title="Solo Productos"
                      description="Sin control de stock ni compras" checked={features.inventory_products_only} onChange={v => set({ inventory_products_only: v })} />
                    <SubFeatureRow icon={Layers} color="bg-blue-400" title="Stock Mixto"
                      description="Productos con/sin stock convivientes" checked={!!features.inventory_mixed_stock} onChange={v => set({ inventory_mixed_stock: v })} />
                    <SubFeatureRow icon={Layers} color="bg-emerald-400" title="Categorías"
                      description="Tab de categorías" checked={features.inventory_categories ?? true} onChange={v => set({ inventory_categories: v })} />
                    <SubFeatureRow icon={Box} color="bg-emerald-400" title="Tipos de Unidad"
                      description="Tab de tipos de unidad" checked={features.inventory_unit_types ?? true} onChange={v => set({ inventory_unit_types: v })} />
                    <SubFeatureRow icon={Truck} color="bg-amber-500" title="Proveedores"
                      description="Tab de proveedores" checked={features.inventory_suppliers ?? true} onChange={v => set({ inventory_suppliers: v })} />
                    <SubFeatureRow icon={Box} color="bg-blue-500" title="Vista de Stock"
                      description="Tab de stock con ajustes" checked={features.inventory_stock_view ?? true} onChange={v => set({ inventory_stock_view: v })} />
                    <SubFeatureRow icon={AlertTriangle} color="bg-orange-400" title="Alertas Stock Bajo"
                      description="Tab de alertas y mínimos" checked={features.inventory_low_stock_alerts ?? true} onChange={v => set({ inventory_low_stock_alerts: v })} />
                    <SubFeatureRow icon={Sliders} color="bg-amber-500" title="Ajustes con Motivo"
                      description="Modal de ajuste manual con razones" checked={features.inventory_stock_adjustments ?? true} onChange={v => set({ inventory_stock_adjustments: v })} />
                  </FeatureRow>

                  <FeatureRow icon={ClipboardList} color="bg-cyan-500" title="Órdenes de Compra"
                    description="Compras a proveedores" checked={features.purchases ?? false} onChange={v => set({ purchases: v })} />

                  <FeatureRow icon={Wallet} color="bg-rose-500" title="Cuentas por Pagar"
                    description="Crédito de proveedores" checked={features.accounts_payable ?? false} onChange={v => set({ accounts_payable: v })} />

                  <FeatureRow icon={TrendingDown} color="bg-red-400" title="Gastos"
                    description="Registro y gestión" checked={features.expenses} onChange={v => set({ expenses: v })} />

                  <FeatureRow icon={Building} color="bg-indigo-600" title="Sucursales y Bodegas"
                    description="Manejar varias sucursales y bodegas"
                    checked={features.multi_branch ?? false} onChange={v => set({ multi_branch: v })}>
                    <SubFeatureRow icon={Truck} color="bg-cyan-500" title="Transferencias entre bodegas"
                      description="Mover stock de una bodega a otra"
                      checked={features.multi_branch_transfers ?? false}
                      onChange={v => set({ multi_branch_transfers: v })} />
                  </FeatureRow>
                </section>

                {/* ── Columna 3: Reportes y Administración ────────────── */}
                <section className="space-y-3">
                  <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-wider px-1">Reportes y Administración</h3>

                  <FeatureRow icon={BarChart2} color="bg-indigo-500" title="Reportes"
                    description="Análisis y estadísticas" checked={features.reports} onChange={v => set({ reports: v })}>
                    <SubFeatureRow icon={BarChart2} color="bg-indigo-400" title="Ventas Básicas"
                      description="Reporte simple de ventas" checked={features.reports_basic} onChange={v => set({ reports_basic: v })} />
                    <SubFeatureRow icon={TrendingUp} color="bg-indigo-500" title="Ventas Avanzadas"
                      description="Métricas detalladas" checked={features.report_advanced_sales ?? true} onChange={v => set({ report_advanced_sales: v })} />
                    <SubFeatureRow icon={Clock} color="bg-violet-500" title="Ventas por Hora"
                      description="Distribución horaria" checked={features.report_hourly_sales ?? true} onChange={v => set({ report_hourly_sales: v })} />
                    <SubFeatureRow icon={DollarSign} color="bg-emerald-500" title="Utilidad"
                      description="Margen y ganancia" checked={features.report_profit ?? true} onChange={v => set({ report_profit: v })} />
                    <SubFeatureRow icon={Users} color="bg-amber-500" title="Vendedores"
                      description="Ranking de cajeros" checked={features.report_sellers ?? true} onChange={v => set({ report_sellers: v })} />
                    <SubFeatureRow icon={Package} color="bg-blue-500" title="Productos"
                      description="Detalle por producto" checked={features.report_product_detail ?? true} onChange={v => set({ report_product_detail: v })} />
                    <SubFeatureRow icon={Box} color="bg-cyan-500" title="Stock"
                      description="Inventario y motivos" checked={features.report_stock ?? true} onChange={v => set({ report_stock: v })} />
                    <SubFeatureRow icon={Sliders} color="bg-amber-500" title="Ajustes de Stock"
                      description="Historial de ajustes" checked={features.report_stock_adjustments ?? true} onChange={v => set({ report_stock_adjustments: v })} />
                    <SubFeatureRow icon={Banknote} color="bg-emerald-500" title="Cierres de Caja"
                      description="Sesiones de caja" checked={features.report_cash_sessions ?? true} onChange={v => set({ report_cash_sessions: v })} />
                    <SubFeatureRow icon={TrendingDown} color="bg-red-400" title="Gastos"
                      description="Reporte de gastos" checked={features.report_expenses ?? true} onChange={v => set({ report_expenses: v })} />
                    <SubFeatureRow icon={ClipboardList} color="bg-cyan-500" title="Compras"
                      description="Reporte de compras" checked={features.report_purchases ?? true} onChange={v => set({ report_purchases: v })} />
                  </FeatureRow>

                  <FeatureRow icon={Users} color="bg-amber-500" title="Usuarios"
                    description="Gestión de cuentas" checked={features.users} onChange={v => set({ users: v })}>
                    <SubFeatureRow icon={Shield} color="bg-purple-500" title="Roles"
                      description="Permisos por rol" checked={features.users_roles ?? true} onChange={v => set({ users_roles: v })} />
                    <SubFeatureRow icon={Users} color="bg-blue-500" title="Equipos"
                      description="Grupos de trabajo" checked={features.users_teams ?? true} onChange={v => set({ users_teams: v })} />
                    <SubFeatureRow icon={CalendarDays} color="bg-emerald-500" title="Turnos"
                      description="Calendario de turnos" checked={features.users_shifts ?? true} onChange={v => set({ users_shifts: v })} />
                    <SubFeatureRow icon={History} color="bg-violet-500" title="Actividad"
                      description="Historial de acciones" checked={features.users_activity ?? true} onChange={v => set({ users_activity: v })} />
                  </FeatureRow>

                  <FeatureRow icon={UserCog} color="bg-violet-500" title="Recursos Humanos"
                    description="Empleados y nómina" checked={features.hr ?? false} onChange={v => set({ hr: v })} />

                  <FeatureRow icon={Settings} color="bg-gray-500" title="Configuración"
                    description="Ajustes del sistema" checked={features.settings} onChange={v => set({ settings: v })} />
                </section>

              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
              <button onClick={handleSaveFeatures} disabled={saving}
                className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-200 text-white font-bold py-2.5 rounded-xl transition text-sm">
                {saving ? 'Guardando...' : 'Guardar Módulos'}
              </button>
              <button onClick={() => setShowFeaturesModal(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl transition text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
