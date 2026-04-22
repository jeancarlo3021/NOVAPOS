import { supabase } from '@/lib/supabase';

export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  GERENTE: 'gerente',
  ASISTENTE_1: 'asistente_1',
  ASISTENTE_2: 'asistente_2',
  ASISTENTE_3: 'asistente_3',
  COCINERO: 'cocinero',
  MESERO: 'mesero',
  CAJERO: 'cajero',
  ALMACENERO: 'almacenero',
  CONTADOR: 'contador',
};

export const ROLE_LABELS = {
  owner: 'Propietario',
  admin: 'Administrador',
  gerente: 'Gerente',
  asistente_1: 'Asistente 1',
  asistente_2: 'Asistente 2',
  asistente_3: 'Asistente 3',
  cocinero: 'Cocinero',
  mesero: 'Mesero',
  cajero: 'Cajero',
  almacenero: 'Almacenero',
  contador: 'Contador',
};

export const rolesService = {
  // Obtener todos los roles disponibles
  async getAllRoles() {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('*')
      .order('role', { ascending: true });

    if (error) throw error;
    return data;
  },

  // Obtener permisos de un rol
  async getRolePermissions(role: string) {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('permissions')
      .eq('role', role)
      .maybeSingle();

    if (error) throw error;
    return data?.permissions || {};
  },

  // Verificar si un usuario tiene permiso
  async hasPermission(userId: string, permission: string) {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (userError || !userData) return false;

    // Owner tiene todos los permisos
    if (userData.role === 'owner') return true;

    const { data: roleData, error: roleError } = await supabase
      .from('role_permissions')
      .select('permissions')
      .eq('role', userData.role)
      .maybeSingle();

    if (roleError) return false;

    const permissions = roleData?.permissions || {};
    return permissions[permission] === true || permissions.all === true;
  },

  // Obtener todos los usuarios de un negocio
  async getUsersByBusiness(ownerId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, created_at')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Crear nuevo usuario (solo owner/admin)
  async createUser(
    username: string,
    password: string,
    role: string,
    ownerId: string,
    fullName?: string,
    tenantId?: string
  ) {
    const email = `${username}@nexoerp.local`;

    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) throw authError;
    if (!authData.user) throw new Error('No se pudo crear el usuario');

    const { error: userError } = await supabase
      .from('users')
      .insert([
        {
          id: authData.user.id,
          email,
          role,
          full_name: fullName || username,
          owner_id: ownerId,
          ...(tenantId ? { tenant_id: tenantId } : {}),
        },
      ]);

    if (userError) throw userError;

    return authData.user;
  },

  // Actualizar rol de un usuario
  async updateUserRole(userId: string, newRole: string) {
    const { error } = await supabase
      .from('users')
      .update({ role: newRole })
      .eq('id', userId);

    if (error) throw error;
  },

  // Eliminar usuario
  async deleteUser(userId: string) {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) throw error;
  },
};
