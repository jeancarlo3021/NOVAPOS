import { apiFetch } from '@/lib/api';
import type { UserPermissionMatrix } from '@/types/Types_Users';

export const rolePermissionsService = {
  async getRolePermissions(role: string): Promise<UserPermissionMatrix> {
    return apiFetch<UserPermissionMatrix>(`/users/roles/${role}/permissions`);
  },

  async updateRolePermissions(role: string, permissions: UserPermissionMatrix): Promise<void> {
    await apiFetch(`/users/roles/${role}/permissions`, {
      method: 'PUT',
      body: JSON.stringify(permissions),
    });
  },
};
