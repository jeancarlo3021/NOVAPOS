import React, { useState } from 'react';
import { Plus, X, Pencil, Check } from 'lucide-react';
import type { POSTab } from '@/hooks/POS/usePOSTabs';

interface Props {
  tabs: POSTab[];
  activeId: string;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onClose: (id: string) => void;
  onRename: (id: string, label: string) => void;
  /** Función para calcular el total preview de un tab. */
  computeTotal?: (tab: POSTab) => number;
}

const fmt = (n: number) =>
  `₡${Math.round(n).toLocaleString('es-CR')}`;

export const POSTabs: React.FC<Props> = ({
  tabs, activeId, onSwitch, onNew, onClose, onRename, computeTotal,
}) => {
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editLabel, setEditLabel]   = useState('');

  const startEdit = (tab: POSTab) => {
    setEditingId(tab.id);
    setEditLabel(tab.label);
  };

  const commitEdit = () => {
    if (editingId && editLabel.trim()) {
      onRename(editingId, editLabel.trim());
    }
    setEditingId(null);
    setEditLabel('');
  };

  const handleCloseConfirm = (tab: POSTab) => {
    const itemCount = tab.cartItems.length;
    if (itemCount > 0) {
      const ok = confirm(
        `La pestaña "${tab.label}" tiene ${itemCount} producto${itemCount === 1 ? '' : 's'} en el carrito.\n\n` +
        '¿Cerrar y descartar la venta en espera?'
      );
      if (!ok) return;
    }
    onClose(tab.id);
  };

  return (
    <div className="bg-white border-b border-gray-200 px-2 py-1.5 flex items-center gap-1 overflow-x-auto shrink-0 scrollbar-hide">
      {tabs.map(tab => {
        const active     = tab.id === activeId;
        const itemCount  = tab.cartItems.length;
        const total      = computeTotal ? computeTotal(tab) : tab.cartItems.reduce((s, i) => s + (i.subtotal ?? 0), 0);
        const isEditing  = editingId === tab.id;

        return (
          <div
            key={tab.id}
            className={`group inline-flex items-center gap-1 rounded-t-lg border-b-2 px-2 py-1.5 transition shrink-0 ${
              active
                ? 'bg-emerald-50 border-emerald-500'
                : 'bg-gray-50 border-transparent hover:bg-gray-100 hover:border-gray-300 cursor-pointer'
            }`}
            onClick={() => !active && !isEditing && onSwitch(tab.id)}
          >
            {/* Label / Editor */}
            {isEditing ? (
              <input
                autoFocus
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitEdit();
                  if (e.key === 'Escape') { setEditingId(null); setEditLabel(''); }
                }}
                className="w-28 px-1.5 py-0.5 text-sm font-bold border border-emerald-400 rounded text-gray-900 bg-white focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onDoubleClick={e => { e.stopPropagation(); startEdit(tab); }}
                title="Doble clic para renombrar"
                className={`text-sm font-bold whitespace-nowrap ${active ? 'text-emerald-700' : 'text-gray-700'}`}
              >
                {tab.label}
              </button>
            )}

            {/* Item count badge */}
            {itemCount > 0 && (
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums ${
                active ? 'bg-emerald-500 text-white' : 'bg-gray-300 text-gray-700'
              }`}>
                {itemCount}
              </span>
            )}

            {/* Total preview cuando hay items */}
            {itemCount > 0 && (
              <span className={`text-xs font-semibold tabular-nums hidden md:inline ${
                active ? 'text-emerald-600' : 'text-gray-500'
              }`}>
                {fmt(total)}
              </span>
            )}

            {/* Edit + Close (sólo en hover si no es activo, siempre si es activo) */}
            <div className={`flex items-center gap-0.5 ml-1 ${active ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity'}`}>
              {!isEditing && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); startEdit(tab); }}
                  title="Renombrar"
                  className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-blue-600 hover:bg-blue-100"
                >
                  <Pencil size={11} />
                </button>
              )}
              {isEditing && (
                <button
                  type="button"
                  onClick={commitEdit}
                  className="w-5 h-5 flex items-center justify-center rounded text-emerald-500 hover:bg-emerald-100"
                >
                  <Check size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); handleCloseConfirm(tab); }}
                title="Cerrar pestaña"
                className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-100"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        );
      })}

      {/* Nueva pestaña */}
      <button
        type="button"
        onClick={onNew}
        title="Nueva venta en espera"
        className="inline-flex items-center gap-1 px-2.5 py-1.5 ml-1 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-700 text-xs font-bold transition shrink-0"
      >
        <Plus size={13} />
        <span className="hidden sm:inline">Nueva venta</span>
      </button>

      <div className="ml-auto text-[10px] text-gray-400 hidden lg:block px-2">
        Doble clic en una pestaña para renombrar
      </div>
    </div>
  );
};

export default POSTabs;
