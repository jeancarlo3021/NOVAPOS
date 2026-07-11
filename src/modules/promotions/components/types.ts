import type { Promotion, PromotionPayload, getPromoStatus } from '@/services/promotions/promotionsService';

// ── Shared type aliases ───────────────────────────────────────────────────────

export type { Promotion, PromotionPayload };

export type FilterTab = 'all' | 'active' | 'scheduled' | 'expired';

export type PromoStatus = ReturnType<typeof getPromoStatus>;

// ── Shared constants ──────────────────────────────────────────────────────────

export const STATUS_CFG = {
  active:    { label: 'Activa hoy',  color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-200' },
  scheduled: { label: 'Programada', color: 'text-blue-700',    bg: 'bg-blue-100',    border: 'border-blue-200'    },
  expired:   { label: 'Vencida',    color: 'text-gray-500',    bg: 'bg-gray-100',    border: 'border-gray-200'    },
  inactive:  { label: 'Inactiva',   color: 'text-gray-400',    bg: 'bg-gray-50',     border: 'border-gray-200'    },
} as const;

export const TYPE_CFG = {
  percentage: { label: 'Porcentaje',  icon: '%', color: 'bg-violet-500' },
  fixed:      { label: 'Monto fijo',  icon: '₡', color: 'bg-blue-500'   },
  '2x1':      { label: '2×1',         icon: '2', color: 'bg-amber-500'  },
  combo:      { label: 'Combo',       icon: '🍔', color: 'bg-rose-500'  },
} as const;

// ── Shared helpers ────────────────────────────────────────────────────────────

// HOY en hora de Costa Rica (YYYY-MM-DD), no en UTC.
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

export const fmtDate = (s: string) =>
  new Date(s + 'T12:00:00').toLocaleDateString('es-CR', { dateStyle: 'medium' });

// ── Prop interfaces ───────────────────────────────────────────────────────────

export interface FormModalProps {
  editing: Promotion | null;
  tenantId: string;
  onClose: () => void;
  onSaved: () => void;
}

export interface StatusBadgeProps {
  status: PromoStatus;
}

export interface KPIProps {
  label: string;
  value: string | number;
  color: string;
}
