import { apiFetch } from '@/lib/api';

export interface ProductModifier {
  id?: string;
  group_id?: string;
  name: string;
  price_delta: number;
  sort_order?: number;
}

export interface ModifierGroup {
  id?: string;
  tenant_id?: string;
  product_id?: string;
  name: string;
  min_select: number;   // 0 = opcional
  max_select: number;   // 1 = elegir uno; >1 = varios
  sort_order?: number;
  modifiers: ProductModifier[];
}

export const modifiersService = {
  /** Grupos + opciones de un producto. */
  forProduct(productId: string): Promise<ModifierGroup[]> {
    return apiFetch<ModifierGroup[]>(`/modifiers?product_id=${productId}`);
  },

  /** Reemplaza todos los grupos+opciones de un producto. */
  saveForProduct(productId: string, groups: ModifierGroup[]): Promise<{ ok: boolean }> {
    return apiFetch(`/modifiers/product/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({ groups }),
    });
  },
};
