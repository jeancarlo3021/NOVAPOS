import React, { useState } from 'react';
import { Bell, ChevronRight, Check } from 'lucide-react';
import { calcOverduePeriods } from '@/services/expenses/expensesService';
import { FREQUENCY_LABELS } from '@/types/Types_Expenses';
import type { RemindersBannerProps } from './types';

function RemindersBanner({ due, onRegister }: RemindersBannerProps) {
  const [expanded, setExpanded] = useState(true);
  if (due.length === 0) return null;

  const fmt = (n: number) => `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-100/50 transition text-left"
      >
        <Bell size={16} className="text-amber-600 shrink-0" />
        <span className="text-sm font-bold text-amber-800 flex-1">
          {due.length} gasto{due.length !== 1 ? 's' : ''} recurrente{due.length !== 1 ? 's' : ''} pendiente{due.length !== 1 ? 's' : ''} de registrar
        </span>
        <ChevronRight size={15} className={`text-amber-500 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-amber-200 divide-y divide-amber-100">
          {due.map(r => {
            const periods = calcOverduePeriods(r);
            return (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="text-xl shrink-0">{r.category?.icon ?? '💰'}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 text-sm truncate">{r.description}</p>
                  <p className="text-xs text-gray-500">
                    {FREQUENCY_LABELS[r.frequency]} · monto base: <strong>{fmt(r.default_amount)}</strong>
                    {periods > 1 && <span className="ml-1 text-amber-600 font-semibold">· {periods} períodos pendientes</span>}
                  </p>
                </div>
                <button
                  onClick={() => onRegister(r)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition shrink-0"
                >
                  <Check size={11} /> Registrar
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default RemindersBanner;
