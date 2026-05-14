import { apiFetch } from '@/lib/api';

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
    return apiFetch<Plan[]>('/plans');
  },

  // Obtener plan por ID
  async getPlanById(planId: string) {
    return apiFetch<Plan>('/plans/' + planId);
  },

  // Obtener suscripción de un tenant
  async getTenantSubscription(_tenantId: string) {
    try {
      return await apiFetch('/plans/current');
    } catch {
      return null;
    }
  },

  // Crear suscripción
  async createSubscription(tenantId: string, planId: string, isDemo: boolean = false) {
    return apiFetch('/plans/subscribe', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: tenantId, plan_id: planId, is_demo: isDemo }),
    });
  },

  // Cambiar plan de un tenant
  async changePlan(tenantId: string, newPlanId: string) {
    console.log('🔄 [changePlan] Iniciando...');
    console.log('  tenantId:', tenantId);
    console.log('  newPlanId:', newPlanId);

    try {
      await apiFetch('/plans/change', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: tenantId, plan_id: newPlanId }),
      });
      console.log('✅ [changePlan] Completado exitosamente');
    } catch (error) {
      console.error('❌ [changePlan] Error:', error);
      throw error;
    }
  },

  // Cancelar suscripción
  async cancelSubscription(subscriptionId: string) {
    await apiFetch('/plans/cancel', {
      method: 'POST',
      body: JSON.stringify({ subscription_id: subscriptionId }),
    });
  },

  // Obtener estadísticas de tenants
  async getTenantStats() {
    return apiFetch<any[]>('/plans/tenant-stats');
  },
};
