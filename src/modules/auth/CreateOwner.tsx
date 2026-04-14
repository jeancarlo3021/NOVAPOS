import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { plansService, Plan } from '@/services/plansService';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Edit2, AlertCircle, CheckCircle, Calendar, Settings } from 'lucide-react';

interface OwnerData {
  id: string;
  name: string;
  owner_id: string;
  is_demo: boolean;
  status: string;
  created_at: string;
  plan_name?: string;
  plan_price?: number;
  subscription_status?: string;
  ends_at?: string;
}

export const CreateOwner: React.FC = () => {
  const [owners, setOwners] = useState<OwnerData[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingOwner, setEditingOwner] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    businessName: '',
    planId: '',
    withDemo: false,
  });

  useEffect(() => {
    fetchOwners();
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const data = await plansService.getAllPlans();
      setPlans(data);
    } catch (err: any) {
      console.error('Error al obtener planes:', err);
    }
  };

const fetchOwners = async () => {
  try {
    setLoading(true);
    const { data, error } = await supabase
      .from('tenants')
      .select(`
        id,
        name,
        owner_id,
        is_demo,
        status,
        created_at,
        subscriptions(
          status,
          ends_at,
          subscription_plans(name, price)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formattedData = data?.map((tenant: any) => ({
      id: tenant.id,
      name: tenant.name,
      owner_id: tenant.owner_id,
      is_demo: tenant.is_demo,
      status: tenant.status,
      created_at: tenant.created_at,
      plan_name: tenant.subscriptions?.[0]?.subscription_plans?.name || 'Sin plan',
      plan_price: tenant.subscriptions?.[0]?.subscription_plans?.price || 0,
      subscription_status: tenant.subscriptions?.[0]?.status || 'inactiva',
      ends_at: tenant.subscriptions?.[0]?.ends_at,
    })) || [];

    setOwners(formattedData);
  } catch (err: any) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};


  const handleCreateOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const email = `${formData.username}@nexoerp.local`;

      // Crear usuario en Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: formData.password,
        email_confirm: true,
      });

      if (authError) throw authError;

      // Crear registro en tabla users
      const { error: userError } = await supabase
        .from('users')
        .insert([
          {
            id: authData.user.id,
            email,
            role: 'owner',
            business_name: formData.businessName,
            full_name: formData.username,
          },
        ]);

      if (userError) throw userError;

      // Crear tenant
      const schemaName = `tenant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .insert([
          {
            owner_id: authData.user.id,
            name: formData.businessName,
            schema_name: schemaName,
            is_demo: formData.withDemo,
            status: formData.withDemo ? 'trial' : 'active',
            trial_ends_at: formData.withDemo ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
          },
        ])
        .select();

      if (tenantError) throw tenantError;

      // Crear suscripción
      const planId = formData.planId || (await plansService.getAllPlans()).find(p => p.name === 'Demo')?.id;
      if (planId) {
        await plansService.createSubscription(tenantData[0].id, planId, formData.withDemo);
      }

      // Actualizar usuario con tenant_id
      await supabase
        .from('users')
        .update({ tenant_id: tenantData[0].id })
        .eq('id', authData.user.id);

      setSuccess(`✅ Owner creado exitosamente!\n\nUsuario: ${formData.username}\nContraseña: ${formData.password}\nNegocio: ${formData.businessName}\nPlan: ${plans.find(p => p.id === formData.planId)?.name || 'Demo'}`);
      setFormData({ username: '', password: '', businessName: '', planId: '', withDemo: false });
      setShowForm(false);
      fetchOwners();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteOwner = async (tenantId: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este owner y todos sus datos?')) return;

    try {
      // Obtener owner_id del tenant
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('owner_id')
        .eq('id', tenantId)
        .single();

      if (tenantError) throw tenantError;

      // Eliminar usuario de auth
      await supabase.auth.admin.deleteUser(tenant.owner_id);

      // Eliminar tenant (cascada eliminará subscripciones)
      const { error } = await supabase
        .from('tenants')
        .delete()
        .eq('id', tenantId);

      if (error) throw error;

      setSuccess('✅ Owner eliminado');
      fetchOwners();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleChangePlan = async (tenantId: string, newPlanId: string) => {
    try {
      await plansService.changePlan(tenantId, newPlanId);
      setSuccess('✅ Plan actualizado');
      fetchOwners();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Gestión de Owners</h1>
        <Link 
  to="/plans" 
  className="bg-purple-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-purple-700"
>
  <Settings size={20} /> Gestionar Planes
</Link>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nuevo Owner
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-700 whitespace-pre-line">{success}</p>
        </div>
      )}

      {/* Formulario */}
      {showForm && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Crear Nuevo Owner</h2>
          <form onSubmit={handleCreateOwner} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Usuario
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="owner"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contraseña
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre del Negocio
              </label>
              <input
                type="text"
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                placeholder="Mi Restaurante"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Plan
              </label>
              <select
                value={formData.planId}
                onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Seleccionar plan</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} - ${plan.price}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2 flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
              <input
                type="checkbox"
                id="withDemo"
                checked={formData.withDemo}
                onChange={(e) => setFormData({ ...formData, withDemo: e.target.checked })}
                className="w-4 h-4 text-emerald-500 rounded"
              />
              <label htmlFor="withDemo" className="text-sm text-gray-700">
                Crear como tenant de DEMO (30 días de prueba)
              </label>
            </div>

            <div className="md:col-span-2 flex gap-2">
              <button
                type="submit"
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2 rounded-lg transition-colors"
              >
                Crear Owner
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-semibold py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabla de owners */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto"></div>
        </div>
      ) : owners.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-600">No hay owners registrados</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Negocio</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Plan</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Precio</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Estado</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Tipo</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Vencimiento</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Creado</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {owners.map((owner) => (
                <tr key={owner.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{owner.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{owner.plan_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">${owner.plan_price}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                      owner.subscription_status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {owner.subscription_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                      owner.is_demo
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {owner.is_demo ? 'DEMO' : 'PAGO'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {owner.ends_at ? (
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(owner.ends_at).toLocaleDateString('es-ES')}
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(owner.created_at).toLocaleDateString('es-ES')}
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end gap-2">
                    <select
                      onChange={(e) => handleChangePlan(owner.id, e.target.value)}
                      className="text-xs px-2 py-1 border border-gray-300 rounded bg-white"
                      defaultValue=""
                    >
                      <option value="">Cambiar plan</option>
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleDeleteOwner(owner.id)}
                      className="text-red-600 hover:text-red-900 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
