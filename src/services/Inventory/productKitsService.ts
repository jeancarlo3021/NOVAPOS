import { apiFetch } from '@/lib/api';

/** Un producto que entra dentro de un kit. */
export interface KitItem {
  id?: string;
  component_id: string;
  quantity: number;
  /** Datos del componente, que devuelve el backend para pintar la lista. */
  name?: string;
  sku?: string | null;
  price?: number;
  cost_price?: number;
  stock_quantity?: number;
  tracks_stock?: boolean;
  /** El componente es OTRO KIT: adentro todavía hay más. */
  is_kit?: boolean;
}

export interface ProductKit {
  id: string;
  name: string;
  sku?: string | null;
  price: number;
  cost_price?: number;
  image_url?: string | null;
  items: KitItem[];
  /** Suma de los costos de los componentes. */
  components_cost?: number;
  /** Lo que costaría comprando cada cosa por separado. */
  loose_price?: number;
  /** Cuántos kits se pueden armar hoy (null = componentes sin stock limitado). */
  buildable?: number | null;
  /** Niveles de kit dentro de kit. 1 = solo productos sueltos. */
  depth?: number;
  /** Lo que de verdad baja del inventario al vender uno (toda la cadena). */
  leaves?: KitLeaf[];
}

/** Un producto real al final de la cadena de sub-kits. */
export interface KitLeaf {
  product_id: string;
  name: string;
  quantity: number;
  stock_quantity: number;
  tracks_stock: boolean;
}

export const productKitsService = {
  list: () => apiFetch<ProductKit[]>('/product-kits'),
  get: (id: string) => apiFetch<ProductKit>(`/product-kits/${id}`),
  /** Reemplaza la composición del kit. */
  setItems: (id: string, items: Array<{ component_id: string; quantity: number }>) =>
    apiFetch<ProductKit>(`/product-kits/${id}/items`, {
      method: 'PUT', body: JSON.stringify({ items }),
    }),
  /** Marca (o desmarca) un producto existente como kit. */
  convert: (id: string, isKit: boolean) =>
    apiFetch<any>(`/product-kits/${id}/convert`, {
      method: 'POST', body: JSON.stringify({ is_kit: isKit }),
    }),
};

export default productKitsService;
