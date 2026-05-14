import { apiFetch } from '@/lib/api';

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
  async getAllUnitTypes(_tenantId: string): Promise<UnitType[]> {
    return apiFetch<UnitType[]>('/unit-types');
  },

  /**
   * Obtener un tipo de unidad por ID
   */
  async getUnitTypeById(unitId: string): Promise<UnitType> {
    return apiFetch<UnitType>('/unit-types/' + unitId);
  },

  /**
   * Crear tipo de unidad
   */
  async createUnitType(
    _tenantId: string,
    unit: Omit<UnitType, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>
  ): Promise<UnitType> {
    return apiFetch<UnitType>('/unit-types', {
      method: 'POST',
      body: JSON.stringify(unit),
    });
  },

  /**
   * Actualizar tipo de unidad
   */
  async updateUnitType(
    unitId: string,
    updates: Partial<UnitType>
  ): Promise<UnitType> {
    return apiFetch<UnitType>('/unit-types/' + unitId, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  /**
   * Eliminar tipo de unidad
   */
  async deleteUnitType(unitId: string): Promise<void> {
    await apiFetch('/unit-types/' + unitId, { method: 'DELETE' });
  },
};
