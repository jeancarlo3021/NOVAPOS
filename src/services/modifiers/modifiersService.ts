import { apiFetch } from '@/lib/api';

/**
 * Extras y modificadores de un producto (restaurante).
 *
 * Un producto puede tener varios GRUPOS ("Término", "Extras", "Sin…"), cada uno
 * con sus OPCIONES. El grupo define cuántas se pueden elegir:
 *   min_select = 0 → opcional · min_select ≥ 1 → obligatorio
 *   max_select = 1 → una sola (radio) · > 1 → varias (checkbox)
 * Cada opción puede sumar (o restar) al precio con `price_delta`.
 */

export interface Modifier {
  id?: string;
  group_id?: string;
  name: string;
  /** Cuánto suma al precio del plato (puede ser negativo o 0). */
  price_delta: number;
  sort_order?: number;
}

export interface ModifierGroup {
  id?: string;
  product_id: string;
  name: string;
  /** 0 = opcional. ≥1 = hay que elegir al menos esa cantidad. */
  min_select: number;
  /** 1 = una sola opción. >1 = se pueden elegir varias. */
  max_select: number;
  sort_order?: number;
  modifiers: Modifier[];
}

/** Opción ya elegida, tal como viaja con la línea del carrito. */
export interface SelectedModifier {
  group: string;
  name: string;
  price_delta: number;
}

export const modifiersService = {
  /** Todos los grupos del negocio, o los de UN producto. */
  list: (productId?: string) =>
    apiFetch<ModifierGroup[]>(`/modifiers${productId ? `?product_id=${productId}` : ''}`),

  /** Reemplaza TODOS los grupos y opciones de un producto. */
  saveForProduct: (productId: string, groups: ModifierGroup[]) =>
    apiFetch<{ ok: boolean }>(`/modifiers/product/${productId}`, {
      method: 'PUT', body: JSON.stringify({ groups }),
    }),
};

/** Índice product_id → grupos, para saber al vuelo si un plato pide modificadores. */
export function indexByProduct(groups: ModifierGroup[]): Map<string, ModifierGroup[]> {
  const map = new Map<string, ModifierGroup[]>();
  for (const g of groups) {
    map.set(g.product_id, [...(map.get(g.product_id) ?? []), g]);
  }
  for (const [, list] of map) list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return map;
}

/** Texto corto de las opciones elegidas, para el ticket y la comanda. */
export function modifiersLabel(mods?: SelectedModifier[] | null): string {
  if (!mods || mods.length === 0) return '';
  return mods.map(m => m.name).join(', ');
}

export default modifiersService;
