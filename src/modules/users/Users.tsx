import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { rolesService, ROLE_LABELS } from '@/services/rolesService';
import { Plus, Trash2, AlertCircle, CheckCircle } from 'lucide-react';

interface UserData {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
}

export const Users: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    fullName: '',
    role: 'asistente_1',
  });

  useEffect(() => {
    if (user?.role === 'owner' || user?.role === 'admin') {
      fetchUsers();
    }
  }, [user]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, role, created_at')
        .eq('owner_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const email = `${formData.username}@nexoerp.local`;

      // Crear usuario en Auth
      const { data, error: authError } = await supabase.auth.admin.createUser({
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
            id: data.user.id,
            email,
            role: formData.role,
            full_name: formData.fullName || formData.username,
            owner_id: user!.id,
            tenant_id: user!.tenant_id,
          },
        ]);

      if (userError) throw userError;

      setSuccess('✅ Usuario creado exitosamente');
      setFormData({ username: '', password: '', fullName: '', role: 'asistente_1' });
      setShowForm(false);
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este usuario?')) return;

    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (error) throw error;
      setSuccess('✅ Usuario eliminado');
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (user?.role !== 'owner' && user?.role !== 'admin') {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <p className="text-yellow-700">No tienes permiso para acceder a esta página</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Gestión de Usuarios</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nuevo Usuario
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
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}

      {/* Formulario */}
      {showForm && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Crear Nuevo Usuario</h2>
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Usuario
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="usuario"
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
                Nombre Completo
              </label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="Juan Pérez"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rol
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="asistente_1">Asistente 1</option>
                <option value="asistente_2">Asistente 2</option>
                <option value="asistente_3">Asistente 3</option>
                <option value="cocinero">Cocinero</option>
                <option value="mesero">Mesero</option>
                <option value="cajero">Cajero</option>
                <option value="almacenero">Almacenero</option>
                <option value="contador">Contador</option>
                <option value="gerente">Gerente</option>
                <option value="admin">Administrador</option>
              </select>
            </div>

            <div className="md:col-span-2 flex gap-2">
              <button
                type="submit"
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2 rounded-lg transition-colors"
              >
                Crear Usuario
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

      {/* Tabla de usuarios */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto"></div>
        </div>
      ) : users.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-600">No hay usuarios registrados</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Usuario</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Nombre</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Rol</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Fecha Creación</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">{u.email.split('@')[0]}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{u.full_name}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className="inline-block bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-semibold">
                      {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(u.created_at).toLocaleDateString('es-ES')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDeleteUser(u.id)}
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
