import { supabase } from '@/lib/supabase';

export interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  billing_cycle: string;
  max_users: number;
  max_products: number;
  max_orders: number;
  features: Record<string, any>;
  is_active: boolean;
  created_at: string;
}

export interface Subscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: string;
  started_at: string;
  ends_at?: string;
  auto_renew: boolean;
  created_at: string;
  updated_at: string;
}

export const plansService = {
  // Obtener todos los planes
  async getAllPlans() {
    const { data, error } = await supabase
      .from('subscription_plans')  // ← Cambiar aquí
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  // Obtener plan por ID
  async getPlanById(planId: string) {
    const { data, error } = await supabase
      .from('subscription_plans')  // ← Cambiar aquí
      .select('*')
      .eq('id', planId)
      .single();

    if (error) throw error;
    return data;
  },

  // Obtener suscripción de un tenant
  async getTenantSubscription(tenantId: string) {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*, plans(*)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .single();

    if (error) return null;
    return data;
  },

  // Crear suscripción
  async createSubscription(tenantId: string, planId: string, isDemo: boolean = false) {
    const plan = await plansService.getPlanById(planId);

    let endsAt = null;
    if (isDemo) {
      // Demo por 30 días
      endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (plan.billing_cycle === 'monthly') {
      endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (plan.billing_cycle === 'yearly') {
      endsAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .insert([
        {
          tenant_id: tenantId,
          plan_id: planId,
          status: 'active',
          ends_at: endsAt,
          auto_renew: !isDemo,
        },
      ])
      .select();

    if (error) throw error;

    // Actualizar tenant con subscription_id
    await supabase
      .from('tenants')
      .update({ subscription_id: data[0].id, plan_id: planId })
      .eq('id', tenantId);

    return data[0];
  },

  // Cambiar plan de un tenant
  async changePlan(tenantId: string, newPlanId: string) {
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .single();

    if (subError) throw subError;

    // Actualizar suscripción
    const { error } = await supabase
      .from('subscriptions')
      .update({ plan_id: newPlanId, updated_at: new Date().toISOString() })
      .eq('id', subscription.id);

    if (error) throw error;

    // Actualizar tenant
    await supabase
      .from('tenants')
      .update({ plan_id: newPlanId })
      .eq('id', tenantId);
  },

  // Cancelar suscripción
  async cancelSubscription(subscriptionId: string) {
    const { error } = await supabase
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('id', subscriptionId);

    if (error) throw error;
  },

  // Obtener estadísticas de tenants
  async getTenantStats() {
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
          plans(name, price)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },
};
