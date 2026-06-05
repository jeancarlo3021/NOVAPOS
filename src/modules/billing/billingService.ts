import type { Bill, SpotRef } from './types';
import { nextBillColor } from './types';

const KEY = (tenantId: string) => `novapos_bills_${tenantId}`;

function uid(prefix = 'bill') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const billingService = {
  load(tenantId: string): Bill[] {
    try {
      const raw = localStorage.getItem(KEY(tenantId));
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  },

  save(tenantId: string, bills: Bill[]) {
    try {
      localStorage.setItem(KEY(tenantId), JSON.stringify(bills));
    } catch { /* cuota */ }
  },

  // Crear una cuenta nueva asociada a uno o más spots.
  create(initialSpot: SpotRef, allBills: Bill[]): Bill {
    const usedColors = allBills.filter(b => b.status === 'open').map(b => b.color);
    return {
      id: uid('bill'),
      spots: [initialSpot],
      items: [],
      opened_at: new Date().toISOString(),
      status: 'open',
      color: nextBillColor(usedColors),
    };
  },
};

// Devuelve el bill abierto que contiene el spot dado, o null.
export function findOpenBillForSpot(spotId: string, bills: Bill[]): Bill | null {
  return bills.find(b => b.status === 'open' && b.spots.some(s => s.id === spotId)) ?? null;
}
