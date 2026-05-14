import { apiFetch } from '@/lib/api';

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
    return apiFetch<any[]>('/users/roles');
  },

  // Obtener permisos de un rol
  async getRolePermissions(role: string) {
    const data = await apiFetch<{ permissions: Record<string, any> }>('/users/roles/' + role);
    return data?.permissions || {};
  },

  // Verificar si un usuario tiene permiso
  async hasPermission(userId: string, permission: string) {
    try {
      const data = await apiFetch<{ has_permission: boolean }>(
        `/users/${userId}/permissions/${permission}`
      );
      return data?.has_permission ?? false;
    } catch {
      return false;
    }
  },

  // Obtener todos los usuarios de un negocio
  async getUsersByBusiness(_ownerId: string) {
    return apiFetch<any[]>('/users');
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
    return apiFetch('/users', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        role,
        full_name: fullName || username,
        owner_id: ownerId,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      }),
    });
  },

  // Actualizar rol de un usuario
  async updateUserRole(userId: string, newRole: string) {
    await apiFetch('/users/' + userId, {
      method: 'PUT',
      body: JSON.stringify({ role: newRole }),
    });
  },

  // Eliminar usuario
  async deleteUser(userId: string) {
    await apiFetch('/users/' + userId, { method: 'DELETE' });
  },
};
