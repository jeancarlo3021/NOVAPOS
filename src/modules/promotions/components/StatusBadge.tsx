import React from 'react';
import { STATUS_CFG, type StatusBadgeProps } from './types';

export function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = STATUS_CFG[status];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      {cfg.label}
    </span>
  );
}
