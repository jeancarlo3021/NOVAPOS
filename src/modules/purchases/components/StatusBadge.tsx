import React from 'react';
import { Clock } from 'lucide-react';
import { Status, STATUS_CONFIG } from './types';

// ── Props ─────────────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: Status;
  pendingSync?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StatusBadge({ status, pendingSync }: StatusBadgeProps) {
  const cfg  = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      {pendingSync ? <Clock size={11} className="opacity-60" /> : <Icon size={11} />}
      {cfg.label}
      {pendingSync && <span className="opacity-60 text-xs">·</span>}
    </span>
  );
}
