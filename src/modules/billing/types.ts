// Tipos del módulo de cobro por mesas / sillas.
// Se apoya en MapItem (mesa, freeTable, seat) del módulo tables.

import type { ItemKind } from '@/modules/tables/types';

// Una "spot" es cualquier elemento del mapa que puede tener cuenta.
export type CobrableKind = Extract<ItemKind, 'table' | 'freeTable' | 'seat'>;

export interface SpotRef {
  id: string;          // id del MapItem
  kind: CobrableKind;
}

export interface BillItemModifier {
  group: string;        // nombre del grupo (ej. "Salsas")
  name: string;         // opción elegida (ej. "Extra queso")
  price_delta: number;  // monto que suma al precio base
}

export interface BillItem {
  id: string;
  product_id?: string;
  category_id?: string;   // para rutear la comanda a la impresora de su estación
  name: string;
  unit_price: number;       // precio base del producto
  quantity: number;
  modifiers?: BillItemModifier[];  // adicionales elegidos
  notes?: string;                  // solicitud especial ("sin cebolla")
}

/** Precio total de un item = (base + suma de modifiers) × cantidad. */
export function billItemTotal(it: BillItem): number {
  const mods = (it.modifiers ?? []).reduce((s, m) => s + m.price_delta, 0);
  return (it.unit_price + mods) * it.quantity;
}

export type BillStatus = 'open' | 'paid' | 'cancelled';

export interface Bill {
  id: string;
  spots: SpotRef[];        // una o más: agrupa sillas/mesas en una cuenta
  customer_name?: string;
  notes?: string;
  items: BillItem[];
  opened_at: string;       // ISO
  closed_at?: string;      // ISO
  status: BillStatus;
  payment_method?: 'cash' | 'card' | 'sinpe';
  // Mesero RESPONSABLE de la cuenta = el PRIMERO que digitó (no cambia).
  responsible_name?: string;
  // Mesero que está digitando ahora (se puede cambiar por comanda).
  waiter_name?: string;
  // Delivery/para llevar → SIN el 10% de servicio (por defecto es mesa, con 10%).
  is_delivery?: boolean;
  // Color asignado para destacar los spots de esta cuenta en el mapa.
  color: string;
}

// Servicio de restaurante (propina legal del 10% en Costa Rica). Aplica en MESA;
// no aplica en delivery/para llevar.
export const SERVICE_RATE = 0.10;
export function billService(subtotal: number, isDelivery?: boolean): number {
  return isDelivery ? 0 : Math.round(subtotal * SERVICE_RATE);
}

// Paleta para distinguir cuentas activas en el mapa.
export const BILL_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#84cc16',
  '#06b6d4', '#3b82f6', '#a855f7', '#ec4899',
];

export function nextBillColor(taken: string[]): string {
  for (const c of BILL_COLORS) if (!taken.includes(c)) return c;
  return BILL_COLORS[taken.length % BILL_COLORS.length];
}

export function billSubtotal(b: Bill): number {
  return b.items.reduce((s, it) => s + billItemTotal(it), 0);
}
