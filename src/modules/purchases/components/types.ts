import React from 'react';
import { Clock, CheckCircle2, XCircle } from 'lucide-react';

// ── Shared types ──────────────────────────────────────────────────────────────

export type Status = 'pending' | 'received' | 'cancelled';

export interface ReviewItem {
  id: string;
  product_id: string;
  product_name: string;
  qty_ordered: number;
  qty_received: number;
  price_ordered: number;
  price_received: number;
}

export const STATUS_CONFIG: Record<Status, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  pending:   { label: 'Pendiente', icon: Clock,        color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200'   },
  received:  { label: 'Recibida',  icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  cancelled: { label: 'Cancelada', icon: XCircle,      color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200'     },
};

export const fmt     = (n: number) => `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;
export const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString('es-CR', { dateStyle: 'short' }) : '—';
