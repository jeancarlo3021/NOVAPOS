import { useState, useEffect } from 'react';
import {
  Edit2, Plus, X, ShoppingCart, Package, BarChart2,
  TrendingDown, Settings, Users, CreditCard, Smartphone,
  Percent, ClipboardList, Check, ChevronRight, Wallet,
  BookOpen, UserCog, Tag, LayoutGrid,
} from 'lucide-react';
import { subscriptionPlansService, SubscriptionPlan } from '@/services/users/subscriptionPlansService';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { PlanFeatures, DEFAULT_FEATURES } from '@/context/AuthContext';

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
      await subscriptionPlansService.updatePlan(selectedPlan.id, { features });
      setShowFeaturesModal(false);
      setPlans(plans.map(p => p.id === selectedPlan.id ? { ...p, features } as SubscriptionPlan : p));
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
    if (pf.inventory) a.push(pf.inventory_products_only ? 'Inventario básico' : 'Inventario completo');
    if (pf.reports) a.push(pf.reports_basic ? 'Reportes básicos' : 'Reportes completos');
    if (pf.expenses) a.push('Gastos');
    if (pf.purchases) a.push('Compras');
    if (pf.accounts_payable) a.push('Cuentas por Pagar');
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

      {/* ── MODAL: Características ── */}
      {showFeaturesModal && selectedPlan && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-lg font-black text-gray-900">Módulos del Plan</h2>
                <p className="text-xs text-gray-400">{selectedPlan.name}</p>
              </div>
              <button onClick={() => setShowFeaturesModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition">
                <X size={20} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">

              {/* POS */}
              <FeatureRow icon={ShoppingCart} color="bg-blue-500" title="Punto de Venta (POS)"
                description="Módulo de caja y ventas" checked={features.pos} onChange={v => set({ pos: v })}>
                <SubFeatureRow icon={CreditCard} color="bg-blue-400" title="Datáfono / Tarjeta"
                  description="Cobro con tarjeta de crédito/débito" checked={features.pos_card} onChange={v => set({ pos_card: v })} />
                <SubFeatureRow icon={Smartphone} color="bg-violet-500" title="SINPE Móvil"
                  description="Cobro por SINPE con comprobante" checked={features.pos_sinpe} onChange={v => set({ pos_sinpe: v })} />
                <SubFeatureRow icon={Percent} color="bg-orange-400" title="Descuentos"
                  description="Aplicar descuentos por producto" checked={features.pos_discount} onChange={v => set({ pos_discount: v })} />
              </FeatureRow>

              {/* Inventario */}
              <FeatureRow icon={Package} color="bg-emerald-500" title="Inventario"
                description="Productos, stock y categorías" checked={features.inventory} onChange={v => set({ inventory: v })}>
                <SubFeatureRow icon={Package} color="bg-emerald-400" title="Solo Productos"
                  description="Acceso limitado, sin stock ni compras" checked={features.inventory_products_only} onChange={v => set({ inventory_products_only: v })} />
              </FeatureRow>

              {/* Reportes */}
              <FeatureRow icon={BarChart2} color="bg-indigo-500" title="Reportes"
                description="Análisis de ventas y estadísticas" checked={features.reports} onChange={v => set({ reports: v })}>
                <SubFeatureRow icon={BarChart2} color="bg-indigo-400" title="Solo Reportes Básicos"
                  description="Limita el acceso a reportes avanzados" checked={features.reports_basic} onChange={v => set({ reports_basic: v })} />
              </FeatureRow>

              {/* Gastos */}
              <FeatureRow icon={TrendingDown} color="bg-red-400" title="Gastos"
                description="Registro y gestión de gastos" checked={features.expenses} onChange={v => set({ expenses: v })} />

              {/* Compras */}
              <FeatureRow icon={ClipboardList} color="bg-cyan-500" title="Órdenes de Compra"
                description="Gestión de compras a proveedores" checked={features.purchases ?? false} onChange={v => set({ purchases: v })} />

              {/* Cuentas por Pagar */}
              <FeatureRow icon={Wallet} color="bg-rose-500" title="Cuentas por Pagar"
                description="Control de pagos a proveedores con crédito" checked={features.accounts_payable ?? false} onChange={v => set({ accounts_payable: v })} />

              {/* Mapa de Mesas */}
              <FeatureRow icon={LayoutGrid} color="bg-blue-500" title="Mapa de Mesas"
                description="Canvas de mesas para restaurantes" checked={features.tables ?? false} onChange={v => set({ tables: v })} />

              {/* Promociones */}
              <FeatureRow icon={Tag} color="bg-violet-500" title="Promociones del día"
                description="Descuentos y ofertas en el POS" checked={features.promotions ?? false} onChange={v => set({ promotions: v })} />

              {/* Recetas */}
              <FeatureRow icon={BookOpen} color="bg-lime-500" title="Recetas"
                description="Módulo de recetas e ingredientes" checked={features.recipes ?? false} onChange={v => set({ recipes: v })} />

              {/* Recursos Humanos */}
              <FeatureRow icon={UserCog} color="bg-violet-500" title="Recursos Humanos"
                description="Gestión de empleados y nómina" checked={features.hr ?? false} onChange={v => set({ hr: v })} />

              {/* Configuración */}
              <FeatureRow icon={Settings} color="bg-gray-500" title="Configuración"
                description="Ajustes del sistema y negocio" checked={features.settings} onChange={v => set({ settings: v })} />

              {/* Usuarios */}
              <FeatureRow icon={Users} color="bg-amber-500" title="Gestión de Usuarios"
                description="Crear y administrar usuarios del negocio" checked={features.users} onChange={v => set({ users: v })} />
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
