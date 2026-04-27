import { supabase } from '@/lib/supabase';

export interface UnitType {
  id: string;
  tenant_id: string;
  name: string;
  abbreviation: string;
  requires_weight?: boolean;
  created_at: string;
  updated_at: string;
}

export const unitTypesService = {
  /**
   * Obtener todos los tipos de unidad del tenant
   */
  async getAllUnitTypes(tenantId: string): Promise<UnitType[]> {
    const { data, error } = await supabase
      .from('unit_types')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Obtener un tipo de unidad por ID
   */
  async getUnitTypeById(unitId: string): Promise<UnitType> {
    const { data, error } = await supabase
      .from('unit_types')
      .select('*')
      .eq('id', unitId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /**
   * Crear tipo de unidad
   */
  async createUnitType(
    tenantId: string,
    unit: Omit<UnitType, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>
  ): Promise<UnitType> {
    const { data, error } = await supabase
      .from('unit_types')
      .insert([
        {
          tenant_id: tenantId,
          ...unit,
        },
      ])
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /**
   * Actualizar tipo de unidad
   */
  async updateUnitType(
    unitId: string,
    updates: Partial<UnitType>
  ): Promise<UnitType> {
    const { data, error } = await supabase
      .from('unit_types')
      .update(updates)
      .eq('id', unitId)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /**
   * Eliminar tipo de unidad
   */
  async deleteUnitType(unitId: string): Promise<void> {
    const { error } = await supabase
      .from('unit_types')
      .delete()
      .eq('id', unitId);

    if (error) throw error;
  },
};