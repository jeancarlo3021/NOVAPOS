import React from 'react';

// ── Profit waterfall row used in ProfitReport ─────────────────────────────────

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

export interface WaterfallRowProps {
  label: string;
  value: number;
  pct: number;
  color: string;
  bold?: boolean;
}

export function WaterfallRow({ label, value, pct, color, bold }: WaterfallRowProps) {
  return (
    <div className={`flex items-center gap-4 py-3 ${bold ? 'font-black' : ''}`}>
      <div className="w-36 shrink-0 text-sm text-gray-700">{label}</div>
      <div className="flex-1">
        <div className="bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${color}`}
            style={{ width: `${Math.min(100, Math.abs(pct))}%` }}
          />
        </div>
      </div>
      <div className={`w-28 text-right text-sm ${value < 0 ? 'text-red-600' : bold ? 'text-emerald-700' : 'text-gray-700'}`}>
        {value < 0 ? '-' : ''}{fmt(Math.abs(value))}
      </div>
      <div className="w-14 text-right text-xs text-gray-400">
        {pct.toFixed(1)}%
      </div>
    </div>
  );
}
