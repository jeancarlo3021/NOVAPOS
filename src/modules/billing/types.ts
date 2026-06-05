// Tipos del módulo de cobro por mesas / sillas.
// Se apoya en MapItem (mesa, freeTable, seat) del módulo tables.

import type { ItemKind } from '@/modules/tables/types';

// Una "spot" es cualquier elemento del mapa que puede tener cuenta.
export type CobrableKind = Extract<ItemKind, 'table' | 'freeTable' | 'seat'>;

export interface SpotRef {
  id: string;          // id del MapItem
  kind: CobrableKind;
}

export interface BillItem {
  id: string;
  product_id?: string;
  name: string;
  unit_price: number;
  quantity: number;
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
  // Color asignado para destacar los spots de esta cuenta en el mapa.
  color: string;
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
  return b.items.reduce((s, it) => s + it.unit_price * it.quantity, 0);
}
