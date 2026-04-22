import React, { useState, useEffect } from 'react';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { plansService, Plan } from '@/services/users/plansService';
import { useAuth } from '@/context/AuthContext';
import { Link } from 'react-router-dom';
import { Plus, Trash2, AlertCircle, CheckCircle, Calendar, Settings, Mail, Lock, Building2 } from 'lucide-react';

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
  const { refreshPlan } = useAuth();
  const [owners, setOwners] = useState<OwnerData[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    businessName: '',
    planId: '',
    withDemo: false,
  });

  const [formErrors, setFormErrors] = useState({
    email: '',
    password: '',
    businessName: '',
  });

  useEffect(() => {
    fetchOwners();
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setPlans(await plansService.getAllPlans());
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
          id, name, owner_id, is_demo, status, created_at,
          subscriptions(status, ends_at, subscription_plans(name, price))
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setOwners(
        (data ?? []).map((tenant: any) => ({
          id: tenant.id,
          name: tenant.name,
          owner_id: tenant.owner_id,
          is_demo: tenant.is_demo,
          status: tenant.status,
          created_at: tenant.created_at,
          plan_name: tenant.subscriptions?.[0]?.subscription_plans?.name ?? 'Sin plan',
          plan_price: tenant.subscriptions?.[0]?.subscription_plans?.price ?? 0,
          subscription_status: tenant.subscriptions?.[0]?.status ?? 'inactiva',
          ends_at: tenant.subscriptions?.[0]?.ends_at,
        }))
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Validar email simple
 const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

  // Validar formulario
  const validateForm = (): boolean => {
    const errors = { email: '', password: '', businessName: '' };
    let isValid = true;

    if (!formData.email.trim()) {
      errors.email = 'El email es requerido';
      isValid = false;
    } else if (!isValidEmail(formData.email)) {
      errors.email = 'Por favor ingresa un email válido (ej: usuario@gmail.com)';
      isValid = false;
    }

    if (!formData.password.trim()) {
      errors.password = 'La contraseña es requerida';
      isValid = false;
    } else if (formData.password.length < 6) {
      errors.password = 'La contraseña debe tener al menos 6 caracteres';
      isValid = false;
    }

    if (!formData.businessName.trim()) {
      errors.businessName = 'El nombre del negocio es requerido';
      isValid = false;
    }

    setFormErrors(errors);
    return isValid;
  };

const handleCreateOwner = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);
  setError('');
  setSuccess('');

  if (!validateForm()) {
    setLoading(false);
    return;
  }

  try {
    console.log('📧 Creando usuario con email:', formData.email);

    // ✅ Validar que supabaseAdmin esté disponible
    if (!supabaseAdmin) {
      throw new Error('❌ Service Role Key no configurada. No se puede crear usuarios.');
    }

    // 1. ✅ Crear usuario en Auth (Usando supabaseAdmin)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: formData.email,
      password: formData.password,
      email_confirm: true, // ✅ Confirmar email automáticamente
      user_metadata: {
        full_name: formData.businessName,
        role: 'owner'
      }
    });

    if (authError) throw new Error(`❌ Auth error: ${authError.message}`);
    if (!authData.user) throw new Error('❌ No user created');

    const userId = authData.user.id;
    console.log('✅ Usuario creado en Auth:', userId);

    // 2. Esperar a que el trigger se ejecute
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3. Verificar si fue insertado en public.users
    const { data: userExists, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (!userExists && !checkError) {
      console.log('⚠️ Usuario no encontrado en public.users, insertando manualmente...');
      
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: userId,
          email: formData.email,
          full_name: formData.businessName,
          role: 'owner',
          business_name: formData.businessName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('❌ Error insertando en public.users:', insertError);
        throw new Error(`Insert error: ${insertError.message}`);
      }
      console.log('✅ Usuario insertado manualmente en public.users');
    } else if (userExists) {
      console.log('✅ Usuario ya existe en public.users');
    }

    // 4. Crear tenant (owner)
    const schemaName = `tenant_${userId.replace(/-/g, '_')}`;
    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        name: formData.businessName,
        owner_id: userId,
        is_demo: formData.withDemo,
        status: 'active',
        schema_name: schemaName
      })
      .select()
      .single();

    if (tenantError) throw new Error(`Tenant error: ${tenantError.message}`);
    console.log('✅ Tenant creado:', tenantData.id);

    // 5. Crear suscripción si hay plan
    if (formData.planId) {
      const subscriptionStatus = formData.withDemo ? 'inactive' : 'active';
      
      console.log('📋 Creando suscripción con status:', subscriptionStatus);
      
      const { error: subError } = await supabase
        .from('subscriptions')
        .insert({
          tenant_id: tenantData.id,
          plan_id: formData.planId,
          status: subscriptionStatus,
          started_at: new Date().toISOString(),
          ends_at: formData.withDemo 
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            : null,
          auto_renew: true
        });

      if (subError) throw new Error(`Subscription error: ${subError.message}`);
      console.log('✅ Suscripción creada');
    }

    setSuccess(`✅ Owner creado exitosamente!\\n📧 Email: ${formData.email}\n✅ Email confirmado automáticamente`);
    setFormData({ email: '', password: '', businessName: '', planId: '', withDemo: false });
    setShowForm(false);
    
    // Recargar lista
    await new Promise(resolve => setTimeout(resolve, 1000));
    fetchOwners();

  } catch (err: any) {
    console.error('❌ Error detallado:', err);
    setError(err.message || 'Error al crear owner');
  } finally {
    setLoading(false);
  }
};

const handleDeleteOwner = async (tenantId: string, ownerId: string) => {
  if (!window.confirm('¿Eliminar este owner y todos sus datos? Esta acción no se puede deshacer.')) return;
  
  setLoading(true);
  setError('');
  
  try {
    console.log('🗑️ Iniciando eliminación del owner:', ownerId);

    // 1. Eliminar suscripciones
    console.log('📋 Eliminando suscripciones...');
    const { error: subErr } = await supabase
      .from('subscriptions')
      .delete()
      .eq('tenant_id', tenantId);
    if (subErr) throw new Error(`Error eliminando suscripciones: ${subErr.message}`);
    console.log('✅ Suscripciones eliminadas');

    // 2. Eliminar tenant
    console.log('🏢 Eliminando tenant...');
    const { error: tErr } = await supabase
      .from('tenants')
      .delete()
      .eq('id', tenantId);
    if (tErr) throw new Error(`Error eliminando tenant: ${tErr.message}`);
    console.log('✅ Tenant eliminado');

    // 3. Eliminar de public.users
    console.log('👤 Eliminando de public.users...');
    const { error: userErr } = await supabase
      .from('users')
      .delete()
      .eq('id', ownerId);
    if (userErr) throw new Error(`Error eliminando de public.users: ${userErr.message}`);
    console.log('✅ Usuario eliminado de public.users');

    // 4. ✅ ELIMINAR DE AUTH (Usando supabaseAdmin)
    console.log('🔐 Eliminando de Auth...');
    if (!supabaseAdmin) {
      throw new Error('❌ Service Role Key no configurada. No se puede eliminar de Auth.');
    }
    
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(ownerId);
    if (authErr) throw new Error(`Error eliminando de Auth: ${authErr.message}`);
    console.log('✅ Usuario eliminado de Auth');

    setSuccess('✅ Owner y todos sus datos eliminados exitosamente');
    
    // Recargar lista
    await new Promise(resolve => setTimeout(resolve, 1000));
    fetchOwners();

  } catch (err: any) {
    console.error('❌ Error detallado:', err);
    setError(err.message || 'Error al eliminar owner');
  } finally {
    setLoading(false);
  }
};

  const handleChangePlan = async (tenantId: string, newPlanId: string) => {
    if (!newPlanId) return;
    try {
      console.log('🔄 Iniciando cambio de plan...');
      await plansService.changePlan(tenantId, newPlanId);
      console.log('✅ changePlan() completado');
      
      await refreshPlan(tenantId);
      console.log('✅ refreshPlan() completado');
      
      setSuccess('Plan actualizado exitosamente');
      fetchOwners();
    } catch (err: any) {
      console.error('❌ Error:', err);
      setError(err.message);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-3xl font-bold text-gray-900">Gestión de Owners</h1>
        <div className="flex items-center gap-3">
          <Link
            to="/plans"
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-semibold transition"
          >
            <Settings size={18} /> Gestionar Planes
          </Link>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg transition text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Nuevo Owner
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <p className="text-sm text-green-700 whitespace-pre-line">{success}</p>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Crear Nuevo Owner</h2>
          <form onSubmit={handleCreateOwner} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => {
                    setFormData({ ...formData, email: e.target.value });
                    if (formErrors.email) setFormErrors({ ...formErrors, email: '' });
                  }}
                  placeholder="owner@gmail.com"
                  className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                    formErrors.email
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-300 focus:ring-emerald-500'
                  }`}
                  required
                />
              </div>
              {formErrors.email && (
                <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>
              )}
            </div>

            {/* Contraseña */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={formData.password}
                  onChange={e => {
                    setFormData({ ...formData, password: e.target.value });
                    if (formErrors.password) setFormErrors({ ...formErrors, password: '' });
                  }}
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                    formErrors.password
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-300 focus:ring-emerald-500'
                  }`}
                  required
                />
              </div>
              {formErrors.password && (
                <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>
              )}
            </div>

            {/* Nombre del Negocio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nombre del Negocio</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={formData.businessName}
                  onChange={e => {
                    setFormData({ ...formData, businessName: e.target.value });
                    if (formErrors.businessName) setFormErrors({ ...formErrors, businessName: '' });
                  }}
                  placeholder="Mi Restaurante"
                  className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                    formErrors.businessName
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-300 focus:ring-emerald-500'
                  }`}
                  required
                />
              </div>
              {formErrors.businessName && (
                <p className="text-red-500 text-xs mt-1">{formErrors.businessName}</p>
              )}
            </div>

            {/* Plan */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Plan</label>
              <select
                value={formData.planId}
                onChange={e => setFormData({ ...formData, planId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="">Seleccionar plan (opcional)</option>
                {plans.map(plan => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} — ${plan.price}
                  </option>
                ))}
              </select>
            </div>

            {/* Demo Checkbox */}
            <div className="md:col-span-2 flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
              <input
                type="checkbox"
                id="withDemo"
                checked={formData.withDemo}
                onChange={e => setFormData({ ...formData, withDemo: e.target.checked })}
                className="w-4 h-4 text-emerald-500 rounded"
              />
              <label htmlFor="withDemo" className="text-sm text-gray-700">
                Crear como tenant de DEMO (30 días de prueba)
              </label>
            </div>

            {/* Botones */}
            <div className="md:col-span-2 flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-400 text-white font-semibold py-2 rounded-lg transition"
              >
                {loading ? 'Creando...' : 'Crear Owner'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 rounded-lg transition"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto" />
        </div>
      ) : owners.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-500">No hay owners registrados</p>
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
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Vence</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Creado</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {owners.map(owner => (
                <tr key={owner.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{owner.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{owner.plan_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">${owner.plan_price}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                      owner.subscription_status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {owner.subscription_status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                      owner.is_demo ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                    }`}>
                      {owner.is_demo ? 'DEMO' : 'PAGO'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {owner.ends_at ? (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(owner.ends_at).toLocaleDateString('es-ES')}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(owner.created_at).toLocaleDateString('es-ES')}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <select
                        onChange={e => handleChangePlan(owner.id, e.target.value)}
                        defaultValue=""
                        className="text-xs px-2 py-1 border border-gray-300 rounded bg-white"
                      >
                        <option value="">Cambiar plan</option>
                        {plans.map(plan => (
                          <option key={plan.id} value={plan.id}>{plan.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleDeleteOwner(owner.id, owner.owner_id)}
                        className="text-red-500 hover:text-red-700 transition p-1"
                        title="Eliminar owner"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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

export default CreateOwner;