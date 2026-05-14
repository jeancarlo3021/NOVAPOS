import { apiFetch } from '@/lib/api';

export interface SubscriptionPlan {
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
  updated_at: string;
}

export const subscriptionPlansService = {
  async getAllPlans() {
    return apiFetch<SubscriptionPlan[]>('/plans');
  },

  async getPlanById(planId: string) {
    return apiFetch<SubscriptionPlan>('/plans/' + planId);
  },

  async updatePlan(planId: string, updates: Partial<SubscriptionPlan>) {
    return apiFetch<SubscriptionPlan>('/plans/' + planId, {
      method: 'PUT',
      body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
    });
  },

  async togglePlanStatus(planId: string, isActive: boolean) {
    return apiFetch<SubscriptionPlan>('/plans/' + planId, {
      method: 'PUT',
      body: JSON.stringify({ is_active: isActive }),
    });
  },
};
