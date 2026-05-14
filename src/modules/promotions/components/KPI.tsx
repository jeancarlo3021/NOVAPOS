import React from 'react';
import type { KPIProps } from './types';

export function KPI({ label, value, color }: KPIProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
      <p className={`text-3xl font-black ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1 font-semibold">{label}</p>
    </div>
  );
}
