import React from 'react';

// ── Props ─────────────────────────────────────────────────────────────────────

interface KPICardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function KPICard({ icon: Icon, label, value, color }: KPICardProps) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-black text-gray-900 leading-tight truncate">{value}</p>
      </div>
    </div>
  );
}
