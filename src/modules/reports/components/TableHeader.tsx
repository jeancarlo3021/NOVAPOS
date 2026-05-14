import React from 'react';
import { Package, Search, Download } from 'lucide-react';

// ── Table header with search + export, used in ProductDetailReport ────────────

export interface TableHeaderProps {
  title: string;
  count: number;
  search: string;
  onSearch: (v: string) => void;
  onExport: () => void;
  disabled: boolean;
  accentColor: 'emerald' | 'blue';
}

export function TableHeader({ title, count, search, onSearch, onExport, disabled, accentColor }: TableHeaderProps) {
  const btnClass = accentColor === 'emerald'
    ? 'bg-emerald-500 hover:bg-emerald-600'
    : 'bg-blue-500 hover:bg-blue-600';
  return (
    <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 flex-1 min-w-52">
        <Package size={18} className={accentColor === 'emerald' ? 'text-emerald-500' : 'text-blue-500'} />
        <h2 className="font-black text-gray-900">{title}</h2>
        <span className="text-xs text-gray-400">{count} productos</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
        </div>
        <button
          onClick={onExport}
          disabled={disabled}
          className={`flex items-center gap-1.5 px-3 py-1.5 ${btnClass} disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-lg transition`}
        >
          <Download size={14} /> CSV
        </button>
      </div>
    </div>
  );
}
