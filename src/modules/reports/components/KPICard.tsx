import React from 'react';

// ── Shared KPI card used across multiple report views ─────────────────────────

export interface KPICardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
  /** When true renders with an emerald highlight background */
  highlight?: boolean;
}

export function KPICard({ icon: Icon, label, value, sub, color, highlight }: KPICardProps) {
  return (
    <div className={`rounded-2xl p-5 border shadow-sm flex items-center gap-4 ${
      highlight ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100'
    }`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className={`text-xl font-black leading-tight truncate ${highlight ? 'text-emerald-700' : 'text-gray-900'}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
