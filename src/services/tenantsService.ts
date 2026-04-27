import { supabase } from '@/lib/supabase';

const TENANT_SELECT = `
  id, name, owner_id, is_demo, created_at, subscription_id, plan_id,
  subscription:subscriptions!tenants_subscription_id_fkey (
    id, status, started_at, ends_at, auto_renew,
    plan:plan_id (
      id, name, description, price, billing_cycle,
      max_users, max_products, max_orders, features
    )
  )
`;

export const tenantsService = {
  // Obtener tenant actual del usuario
  async getCurrentTenant(userId: string) {
    const { data, error } = await supabase
      .from('tenants')
      .select(TENANT_SELECT)
      .eq('owner_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error al obtener tenant:', error);
      return null;
    }
    return data;
  },

  // Obtener todos los tenants del usuario
  async getUserTenants(userId: string) {
    const { data, error } = await supabase
      .from('tenants')
      .select(TENANT_SELECT)
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error al obtener tenants:', error);
      return [];
    }
    return data || [];
  },

  // Crear nuevo tenant (negocio)
  async createTenant(
    ownerId: string,
    businessName: string,
    isDemoTenant: boolean = false
  ) {
    // Generar nombre de schema único
    const schemaName = `tenant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const { data, error } = await supabase
      .from('tenants')
      .insert([
        {
          owner_id: ownerId,
          name: businessName,
          schema_name: schemaName,
          is_demo: isDemoTenant,
          status: isDemoTenant ? 'trial' : 'active',
          trial_ends_at: isDemoTenant ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
        },
      ])
      .select();

    if (error) throw error;
    return data[0];
  },

  // Obtener tenant por schema
  async getTenantBySchema(schemaName: string) {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('schema_name', schemaName)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Actualizar tenant
  async updateTenant(tenantId: string, updates: any) {
    const { data, error } = await supabase
      .from('tenants')
      .update(updates)
      .eq('id', tenantId)
      .select();

    if (error) throw error;
    return data[0];
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
