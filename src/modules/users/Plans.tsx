import { useState, useEffect } from 'react';
import { Edit2, Plus, X, ChevronDown } from 'lucide-react';
import { subscriptionPlansService, SubscriptionPlan } from '@/services/users/subscriptionPlansService';
import { offlineSyncService } from '@/services/offlineSyncService';
import { useOfflineSync } from '@/hooks/useOfflineSync';

import { PlanFeatures, DEFAULT_FEATURES } from '@/context/AuthContext';

export default function Plans() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showFeaturesModal, setShowFeaturesModal] = useState(false);
  const [formData, setFormData] = useState<Partial<SubscriptionPlan>>({});
  const [features, setFeatures] = useState<PlanFeatures>(DEFAULT_FEATURES);
  const { isOnline } = useOfflineSync();

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const data = await subscriptionPlansService.getAllPlans();
      setPlans(data);
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
    try {
      if (!selectedPlan) return;

      const updateData = {
        ...selectedPlan,
        ...formData,
      };

      if (isOnline) {
        await subscriptionPlansService.updatePlan(selectedPlan.id, formData);
      } else {
        await offlineSyncService.addOperation({
          type: 'update',
          table: 'subscription_plans',
          data: updateData,
        });
      }

      setShowModal(false);
      setPlans(plans.map(p => p.id === selectedPlan.id ? updateData as SubscriptionPlan : p));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSaveFeatures = async () => {
    try {
      if (!selectedPlan) return;

      const updateData = {
        ...selectedPlan,
        features,
      };

      if (isOnline) {
        await subscriptionPlansService.updatePlan(selectedPlan.id, { features });
      } else {
        await offlineSyncService.addOperation({
          type: 'update',
          table: 'subscription_plans',
          data: updateData,
        });
      }

      setShowFeaturesModal(false);
      setPlans(plans.map(p => p.id === selectedPlan.id ? updateData as SubscriptionPlan : p));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async (plan: SubscriptionPlan) => {
    try {
      const updated = { ...plan, is_active: !plan.is_active };

      if (isOnline) {
        await subscriptionPlansService.togglePlanStatus(plan.id, !plan.is_active);
      } else {
        await offlineSyncService.addOperation({
          type: 'update',
          table: 'subscription_plans',
          data: updated,
        });
      }

      setPlans(plans.map(p => p.id === plan.id ? updated : p));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getActiveFeatures = (planFeatures: PlanFeatures): string[] => {
    const active = [];
    if (planFeatures.pos) {
      active.push('POS');
      if (planFeatures.pos_card)     active.push('  · Datáfono');
      if (planFeatures.pos_sinpe)    active.push('  · SINPE');
      if (planFeatures.pos_discount) active.push('  · Descuentos');
    }
    if (planFeatures.inventory) {
      if (planFeatures.inventory_products_only) {
        active.push('Inventario (Solo Productos)');
      } else {
        active.push('Inventario Completo');
      }
    }
    if (planFeatures.reports) {
      if (planFeatures.reports_basic) {
        active.push('Reportes Básicos');
      } else {
        active.push('Reportes Completos');
      }
    }
    if (planFeatures.expenses) active.push('Gastos');
    if (planFeatures.settings) active.push('Configuración');
    if (planFeatures.users) active.push('Usuarios');
    return active;
  };

  if (loading) return <div className="p-8 text-center">Cargando planes...</div>;

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Gestión de Planes</h1>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700">
          <Plus size={20} /> Nuevo Plan
        </button>
      </div>

      {error && <div className="bg-red-100 text-red-700 p-4 rounded mb-4">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map((plan) => (
          <div key={plan.id} className="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <p className="text-gray-600 text-sm">{plan.description}</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-semibold ${plan.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                {plan.is_active ? 'Activo' : 'Inactivo'}
              </span>
            </div>

            <div className="mb-4">
              <p className="text-3xl font-bold text-blue-600">${plan.price}</p>
              <p className="text-gray-600 text-sm">/{plan.billing_cycle}</p>
            </div>

            <div className="bg-gray-50 rounded p-3 mb-4 text-sm">
              <p className="text-gray-700"><strong>Usuarios:</strong> {plan.max_users}</p>
              <p className="text-gray-700"><strong>Productos:</strong> {plan.max_products}</p>
              <p className="text-gray-700"><strong>Órdenes:</strong> {plan.max_orders}</p>
            </div>

            {/* ✅ NUEVO: Mostrar características activas */}
            <div className="bg-blue-50 rounded p-3 mb-4 text-xs">
              <p className="font-semibold text-blue-900 mb-2">Características:</p>
              <div className="space-y-1">
                {getActiveFeatures({ ...DEFAULT_FEATURES, ...(plan.features as Partial<PlanFeatures> || {}) }).length > 0 ? (
                  getActiveFeatures({ ...DEFAULT_FEATURES, ...(plan.features as Partial<PlanFeatures> || {}) }).map((feat, idx) => (
                    <p key={idx} className="text-blue-700">✓ {feat}</p>
                  ))
                ) : (
                  <p className="text-gray-500">Sin características</p>
                )}
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleEditPlan(plan)}
                className="flex-1 min-w-25 bg-blue-600 text-white px-3 py-2 rounded flex items-center justify-center gap-2 hover:bg-blue-700 text-sm"
              >
                <Edit2 size={16} /> Editar
              </button>
              <button
                onClick={() => handleOpenFeatures(plan)}
                className="flex-1 min-w-25 bg-purple-600 text-white px-3 py-2 rounded flex items-center justify-center gap-2 hover:bg-purple-700 text-sm"
              >
                <ChevronDown size={16} /> Características
              </button>
              <button
                onClick={() => handleToggleStatus(plan)}
                className={`flex-1 min-w-25 px-3 py-2 rounded flex items-center justify-center gap-2 text-sm ${plan.is_active ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
              >
                {plan.is_active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL: Editar Plan */}
      {showModal && selectedPlan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-2xl font-bold">Editar Plan: {selectedPlan.name}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Nombre</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Descripción</label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1">Precio</label>
                  <input
                    type="number"
                    value={formData.price || ''}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                    className="w-full border rounded px-3 py-2"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">Ciclo de Facturación</label>
                  <select
                    value={formData.billing_cycle || ''}
                    onChange={(e) => setFormData({ ...formData, billing_cycle: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="monthly">Mensual</option>
                    <option value="yearly">Anual</option>
                    <option value="lifetime">Vitalicio</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1">Máx. Usuarios</label>
                  <input
                    type="number"
                    value={formData.max_users || ''}
                    onChange={(e) => setFormData({ ...formData, max_users: parseInt(e.target.value) })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">Máx. Productos</label>
                  <input
                    type="number"
                    value={formData.max_products || ''}
                    onChange={(e) => setFormData({ ...formData, max_products: parseInt(e.target.value) })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">Máx. Órdenes</label>
                  <input
                    type="number"
                    value={formData.max_orders || ''}
                    onChange={(e) => setFormData({ ...formData, max_orders: parseInt(e.target.value) })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSave}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-semibold"
                >
                  {isOnline ? 'Guardar Cambios' : 'Guardar Localmente'}
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-gray-300 text-gray-800 px-4 py-2 rounded hover:bg-gray-400 font-semibold"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Características ✅ NUEVO */}
      {showFeaturesModal && selectedPlan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-2xl font-bold">Características: {selectedPlan.name}</h2>
              <button onClick={() => setShowFeaturesModal(false)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Punto de Venta */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <label className="flex items-center gap-3 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={features.pos}
                    onChange={(e) => setFeatures({ ...features, pos: e.target.checked })}
                    className="w-5 h-5 text-blue-600 rounded"
                  />
                  <div>
                    <p className="font-semibold text-gray-900">Punto de Venta (POS)</p>
                    <p className="text-sm text-gray-600">Acceso al módulo de punto de venta</p>
                  </div>
                </label>

                {features.pos && (
                  <div className="ml-8 space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer p-2 bg-white border-l-4 border-blue-400 rounded">
                      <input
                        type="checkbox"
                        checked={features.pos_card}
                        onChange={(e) => setFeatures({ ...features, pos_card: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">Datáfono (Tarjeta)</p>
                        <p className="text-xs text-gray-600">Cobro con tarjeta de crédito/débito</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer p-2 bg-white border-l-4 border-violet-400 rounded">
                      <input
                        type="checkbox"
                        checked={features.pos_sinpe}
                        onChange={(e) => setFeatures({ ...features, pos_sinpe: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">SINPE Móvil</p>
                        <p className="text-xs text-gray-600">Cobro por SINPE con comprobante</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer p-2 bg-white border-l-4 border-orange-400 rounded">
                      <input
                        type="checkbox"
                        checked={features.pos_discount}
                        onChange={(e) => setFeatures({ ...features, pos_discount: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">Descuentos</p>
                        <p className="text-xs text-gray-600">Aplicar descuentos por producto</p>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              {/* Inventario */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <label className="flex items-center gap-3 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={features.inventory}
                    onChange={(e) => setFeatures({ ...features, inventory: e.target.checked })}
                    className="w-5 h-5 text-blue-600 rounded"
                  />
                  <div>
                    <p className="font-semibold text-gray-900">Inventario</p>
                    <p className="text-sm text-gray-600">Gestión de inventario</p>
                  </div>
                </label>

                {/* Sub-opción: Solo Productos */}
                {features.inventory && (
                  <div className="ml-8 mt-3 p-3 bg-white border-l-4 border-blue-400 rounded">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={features.inventory_products_only}
                        onChange={(e) => setFeatures({ ...features, inventory_products_only: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">Solo Ver Productos</p>
                        <p className="text-xs text-gray-600">Acceso limitado a solo visualizar productos</p>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              {/* Reportes */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <label className="flex items-center gap-3 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={features.reports}
                    onChange={(e) => setFeatures({ ...features, reports: e.target.checked })}
                    className="w-5 h-5 text-blue-600 rounded"
                  />
                  <div>
                    <p className="font-semibold text-gray-900">Reportes</p>
                    <p className="text-sm text-gray-600">Acceso a reportes</p>
                  </div>
                </label>

                {/* Sub-opción: Reportes Básicos */}
                {features.reports && (
                  <div className="ml-8 mt-3 p-3 bg-white border-l-4 border-blue-400 rounded">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={features.reports_basic}
                        onChange={(e) => setFeatures({ ...features, reports_basic: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">Solo Reportes Básicos</p>
                        <p className="text-xs text-gray-600">Acceso limitado a reportes básicos</p>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              {/* Gastos */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={features.expenses}
                    onChange={(e) => setFeatures({ ...features, expenses: e.target.checked })}
                    className="w-5 h-5 text-blue-600 rounded"
                  />
                  <div>
                    <p className="font-semibold text-gray-900">Gastos</p>
                    <p className="text-sm text-gray-600">Registro y gestión de gastos del negocio</p>
                  </div>
                </label>
              </div>

              {/* Configuración */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={features.settings}
                    onChange={(e) => setFeatures({ ...features, settings: e.target.checked })}
                    className="w-5 h-5 text-blue-600 rounded"
                  />
                  <div>
                    <p className="font-semibold text-gray-900">Configuración</p>
                    <p className="text-sm text-gray-600">Acceso a configuración del sistema</p>
                  </div>
                </label>
              </div>

              {/* Gestión de Usuarios */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={features.users}
                    onChange={(e) => setFeatures({ ...features, users: e.target.checked })}
                    className="w-5 h-5 text-blue-600 rounded"
                  />
                  <div>
                    <p className="font-semibold text-gray-900">Gestión de Usuarios</p>
                    <p className="text-sm text-gray-600">Crear y gestionar usuarios</p>
                  </div>
                </label>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button
                  onClick={handleSaveFeatures}
                  className="flex-1 bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 font-semibold"
                >
                  {isOnline ? 'Guardar Características' : 'Guardar Localmente'}
                </button>
                <button
                  onClick={() => setShowFeaturesModal(false)}
                  className="flex-1 bg-gray-300 text-gray-800 px-4 py-2 rounded hover:bg-gray-400 font-semibold"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}