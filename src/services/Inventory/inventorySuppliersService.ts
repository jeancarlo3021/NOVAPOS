import { supabase } from '@/lib/supabase';

export interface InventorySupplier {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  contact_person: string | null;
  payment_terms: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const inventorySuppliersService = {
  // Obtener todos los proveedores
  async getAllSuppliers(tenantId: string) {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  // Obtener proveedor por ID
  async getSupplierById(id: string) {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    
    if (error) throw error;
    return data;
  },

  // Crear proveedor
  async createSupplier(tenantId: string, supplier: Omit<InventorySupplier, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await supabase
      .from('suppliers')
      .insert([{ ...supplier, tenant_id: tenantId }])
      .select()
      .maybeSingle();
    
    if (error) throw error;
    return data;
  },

  // Actualizar proveedor
  async updateSupplier(id: string, updates: Partial<InventorySupplier>) {
    const { data, error } = await supabase
      .from('suppliers')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();
    
    if (error) throw error;
    return data;
  },

  // Desactivar proveedor
  async deactivateSupplier(id: string) {
    return this.updateSupplier(id, { is_active: false });
  },

  // Eliminar proveedor
  async deleteSupplier(id: string): Promise<void> {
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) throw error;
  },

  // Buscar proveedores
  async searchSuppliers(tenantId: string, query: string) {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('tenant_id', tenantId)
      .or(`name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
      .eq('is_active', true);
    
    if (error) throw error;
    return data || [];
  },
};