import { apiFetch } from '@/lib/api';

export const tenantsService = {
  // Obtener tenant actual del usuario
  async getCurrentTenant(_userId: string) {
    try {
      return await apiFetch('/tenants/me');
    } catch (error) {
      console.error('Error al obtener tenant:', error);
      return null;
    }
  },

  // Obtener todos los tenants del usuario
  async getUserTenants(_userId: string) {
    try {
      return await apiFetch<any[]>('/tenants/me');
    } catch (error) {
      console.error('Error al obtener tenants:', error);
      return [];
    }
  },

  // Crear nuevo tenant (negocio)
  async createTenant(
    ownerId: string,
    businessName: string,
    isDemoTenant: boolean = false
  ) {
    const schemaName = `tenant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return apiFetch<any>('/tenants', {
      method: 'POST',
      body: JSON.stringify({
        owner_id: ownerId,
        name: businessName,
        schema_name: schemaName,
        is_demo: isDemoTenant,
        status: isDemoTenant ? 'trial' : 'active',
        trial_ends_at: isDemoTenant ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
      }),
    });
  },

  // Obtener tenant por schema
  async getTenantBySchema(schemaName: string) {
    return apiFetch<any>('/tenants/by-schema/' + schemaName);
  },

  // Actualizar tenant
  async updateTenant(tenantId: string, updates: any) {
    return apiFetch<any>('/tenants/' + tenantId, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  // Crear tenant de demo
  async createDemoTenant(ownerId: string) {
    return await tenantsService.createTenant(
      ownerId,
      'Demo - Restaurante Ejemplo',
      true
    );
  },
};
