import { supabase } from '@/lib/supabase';

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
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('price', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getPlanById(planId: string) {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (error) throw error;
    return data;
  },

  async updatePlan(planId: string, updates: Partial<SubscriptionPlan>) {
    const { data, error } = await supabase
      .from('subscription_plans')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId)
      .select();

    if (error) throw error;
    return data[0];
  },

  async togglePlanStatus(planId: string, isActive: boolean) {
    const { data, error } = await supabase
      .from('subscription_plans')
      .update({ is_active: isActive })
      .eq('id', planId)
      .select();

    if (error) throw error;
    return data[0];
  },
};
