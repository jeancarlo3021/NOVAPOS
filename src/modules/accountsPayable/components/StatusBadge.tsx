import React from 'react';
import { Clock, DollarSign, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { APStatus } from '@/services/accountsPayable/accountsPayableService';

const STATUS_CFG: Record<APStatus, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  pending:  { label: 'Pendiente', color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   icon: Clock         },
  partial:  { label: 'Parcial',   color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200',    icon: DollarSign    },
  paid:     { label: 'Pagado',    color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2  },
  overdue:  { label: 'Vencido',   color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     icon: AlertTriangle },
};

export interface StatusBadgeProps {
  status: APStatus;
  pendingSync?: boolean;
}

export function StatusBadge({ status, pendingSync }: StatusBadgeProps) {
  const cfg  = STATUS_CFG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      {pendingSync ? <Clock size={11} className="opacity-60" /> : <Icon size={11} />}
      {cfg.label}
    </span>
  );
}
