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

/**
 * Ingrediente que consume una opción.
 *
 * Sin esto un extra tenía precio pero no costo: "+ queso ₡500" sumaba ingreso
 * sin descontar queso ni saber si dejaba margen. Es opcional — un "término
 * medio" no consume nada.
 */
export interface ModifierIngredient {
  type: 'product' | 'subrecipe';
  product_id?: string | null;
  sub_recipe_id?: string | null;
  quantity: number;
  unit_code?: string | null;
  waste_pct?: number;
}

export interface Modifier {
  id?: string;
  group_id?: string;
  name: string;
  /** Cuánto suma al precio del plato (puede ser negativo o 0). */
  price_delta: number;
  sort_order?: number;
  ingredient?: ModifierIngredient | null;
}

export interface ModifierGroup {
  id?: string;
  /**
   * Opcional a propósito: en el formulario de producto se arman los grupos
   * ANTES de que el producto exista, y el id se conoce recién al guardar.
   */
  product_id?: string;
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

  /** Grupos de UN producto. Alias de `list(id)`, para leerse mejor en la llamada. */
  forProduct: (productId: string) =>
    apiFetch<ModifierGroup[]>(`/modifiers?product_id=${productId}`),

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
    // Un grupo sin producto es uno que todavía no se ha guardado: no tiene lugar
    // en un índice que existe para responder «¿este plato pide extras?».
    if (!g.product_id) continue;
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
