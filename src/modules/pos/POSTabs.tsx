import React, { useEffect, useState } from 'react';
import { Plus, X, Pencil, Check, AlertTriangle, ShoppingBag, Trash2 } from 'lucide-react';
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
  const [confirmTab, setConfirmTab] = useState<POSTab | null>(null);

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

  const requestClose = (tab: POSTab) => {
    if (tab.cartItems.length > 0) {
      setConfirmTab(tab);    // abre el modal de confirmación
    } else {
      onClose(tab.id);       // cerrar sin items: directo
    }
  };

  const confirmClose = () => {
    if (confirmTab) onClose(confirmTab.id);
    setConfirmTab(null);
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
                onClick={e => { e.stopPropagation(); requestClose(tab); }}
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

      {confirmTab && (
        <CloseTabModal
          tab={confirmTab}
          total={computeTotal ? computeTotal(confirmTab) : confirmTab.cartItems.reduce((s, i) => s + (i.subtotal ?? 0), 0)}
          onConfirm={confirmClose}
          onCancel={() => setConfirmTab(null)}
        />
      )}
    </div>
  );
};

// ── Modal de confirmación para cerrar pestaña con venta en espera ──────────
const CloseTabModal: React.FC<{
  tab: POSTab;
  total: number;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ tab, total, onConfirm, onCancel }) => {
  // Cerrar con Escape, confirmar con Enter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter')  onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, onConfirm]);

  const itemCount = tab.cartItems.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-linear-to-r from-red-500 to-rose-600 text-white px-5 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
            <AlertTriangle size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-black text-lg leading-tight">Cerrar venta en espera</h3>
            <p className="text-xs text-red-100">Esta acción no se puede deshacer</p>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition"
          >
            <X size={16} className="text-white" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-700">
            La pestaña <span className="font-black text-gray-900">"{tab.label}"</span> tiene una venta en progreso que vas a descartar:
          </p>

          {/* Resumen */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-700">
                <ShoppingBag size={14} className="text-gray-500" />
                {itemCount} producto{itemCount === 1 ? '' : 's'}
              </span>
              <span className="text-lg font-black text-gray-900 tabular-nums">
                ₡{Math.round(total).toLocaleString('es-CR')}
              </span>
            </div>

            {/* Lista compacta de items (máx 5) */}
            <ul className="text-xs text-gray-500 space-y-0.5 pt-2 border-t border-gray-200">
              {tab.cartItems.slice(0, 5).map(it => (
                <li key={it.product_id} className="flex justify-between gap-2">
                  <span className="truncate">{it.quantity}× {it.product?.name ?? 'Producto'}</span>
                  <span className="tabular-nums shrink-0">₡{Math.round(it.subtotal).toLocaleString('es-CR')}</span>
                </li>
              ))}
              {tab.cartItems.length > 5 && (
                <li className="italic text-gray-400">…y {tab.cartItems.length - 5} más</li>
              )}
            </ul>

            {tab.customerName && (
              <p className="text-xs text-gray-500 pt-2 border-t border-gray-200">
                Cliente: <span className="font-semibold text-gray-700">{tab.customerName}</span>
              </p>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <p className="font-bold">¿Querés guardar la venta antes de cerrar?</p>
            <p className="mt-1 text-amber-700">
              Tocá <span className="font-bold">Cancelar</span>, cambiá a esa pestaña y cobrala. Si la cerrás, los productos se descartan.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-100 px-5 py-3 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 font-bold text-sm transition"
            autoFocus
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-black text-sm transition shadow-sm"
          >
            <Trash2 size={14} /> Sí, cerrar venta
          </button>
        </div>
      </div>
    </div>
  );
};

export default POSTabs;
