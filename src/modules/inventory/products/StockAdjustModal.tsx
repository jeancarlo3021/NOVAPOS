'use client';

import React, { useState } from 'react';
import { X, TrendingUp, TrendingDown, Edit3, AlertTriangle, Package } from 'lucide-react';
import { stockAdjustmentsService, type AdjustmentType } from '@/services/Inventory/stockAdjustmentsService';
import { useAuth } from '@/context/AuthContext';

interface Props {
  product: { id: string; name: string; sku?: string; stock_quantity: number };
  onClose: () => void;
  onSuccess: (newStock: number) => void;
}

interface AdjReason {
  type: AdjustmentType;
  label: string;
  emoji: string;
  direction: 'in' | 'out' | 'set';
}

const REASONS: AdjReason[] = [
  { type: 'increase', label: 'Entrada de stock',     emoji: '📥', direction: 'in'  },
  { type: 'return',   label: 'Devolución de cliente', emoji: '↩️', direction: 'in'  },
  { type: 'count',    label: 'Conteo / Inventario',   emoji: '📋', direction: 'set' },
  { type: 'set',      label: 'Corrección manual',     emoji: '✏️', direction: 'set' },
  { type: 'damage',   label: 'Producto dañado',       emoji: '💥', direction: 'out' },
  { type: 'expired',  label: 'Producto vencido',      emoji: '⏰', direction: 'out' },
  { type: 'theft',    label: 'Robo / Pérdida',        emoji: '🚨', direction: 'out' },
  { type: 'decrease', label: 'Otra salida',           emoji: '📤', direction: 'out' },
];

export const StockAdjustModal: React.FC<Props> = ({ product, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [selectedReason, setSelectedReason] = useState<AdjReason | null>(null);
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const qty = parseFloat(quantity) || 0;
  const stockBefore = Number(product.stock_quantity ?? 0);

  // Calcular el stock después según el tipo
  let stockAfter = stockBefore;
  if (selectedReason && qty > 0) {
    if (selectedReason.direction === 'set') {
      stockAfter = qty;
    } else if (selectedReason.direction === 'in') {
      stockAfter = stockBefore + qty;
    } else {
      stockAfter = Math.max(0, stockBefore - qty);
    }
  }
  const diff = stockAfter - stockBefore;
  const isValid = selectedReason !== null && qty > 0;

  const handleSubmit = async () => {
    if (!isValid || !selectedReason) {
      setError(!selectedReason ? 'Selecciona un motivo' : 'Ingresa una cantidad válida');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await stockAdjustmentsService.create({
        product_id: product.id,
        type: selectedReason.type,
        quantity: qty,
        reason: selectedReason.label,
        notes: notes.trim() || undefined,
        user_email: user?.email ?? undefined,
      });
      onSuccess(stockAfter);
    } catch (err: any) {
      setError(err.message || 'Error al ajustar el stock');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 text-white">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Package size={20} />
            </div>
            <div>
              <h3 className="font-black text-lg leading-tight">Ajustar Stock</h3>
              <p className="text-white/80 text-xs line-clamp-1">{product.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Stock actual */}
          <div className="bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Stock actual</p>
              <p className="text-3xl font-black text-gray-900">{stockBefore}</p>
            </div>
            {selectedReason && qty > 0 && (
              <>
                <div className={`text-2xl font-black ${diff > 0 ? 'text-emerald-500' : diff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                  {diff > 0 ? '+' : ''}{diff}
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Nuevo stock</p>
                  <p className={`text-3xl font-black text-right ${stockAfter < stockBefore ? 'text-red-600' : 'text-emerald-600'}`}>
                    {stockAfter}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Motivos */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
              ⚠️ Motivo del ajuste (obligatorio)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {REASONS.map(r => {
                const isSelected = selectedReason?.type === r.type;
                const color =
                  r.direction === 'in'  ? 'emerald' :
                  r.direction === 'out' ? 'red'     : 'blue';
                return (
                  <button
                    key={r.type}
                    onClick={() => { setSelectedReason(r); setError(''); }}
                    className={`text-left p-2.5 rounded-lg border-2 transition ${
                      isSelected
                        ? `bg-${color}-50 border-${color}-500`
                        : 'bg-white border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">{r.emoji}</span>
                      <span className={`text-xs font-bold ${isSelected ? `text-${color}-800` : 'text-gray-700'}`}>
                        {r.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cantidad */}
          {selectedReason && (
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
                {selectedReason.direction === 'set' ? 'Nuevo stock total' : 'Cantidad'}
              </label>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={quantity}
                onChange={e => { setQuantity(e.target.value); setError(''); }}
                placeholder="0"
                autoFocus
                className="w-full text-right text-2xl font-black px-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none focus:border-amber-400"
              />
            </div>
          )}

          {/* Notas */}
          {selectedReason && (
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
                Notas (opcional)
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Detalles adicionales..."
                rows={2}
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-amber-400 resize-none"
              />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border-2 border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg font-semibold">
              ✗ {error}
            </div>
          )}

          {/* Info trazabilidad */}
          <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs text-blue-900">
            <p className="font-bold mb-0.5">💡 Trazabilidad</p>
            <p>Este ajuste quedará registrado con tu usuario ({user?.email}) y aparecerá en el reporte de movimientos de stock.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 px-4 py-3 grid grid-cols-2 gap-2 shrink-0">
          <button
            onClick={onClose}
            disabled={loading}
            className="h-12 rounded-xl border-2 border-gray-200 bg-white text-gray-600 font-bold text-sm hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !isValid}
            className="h-12 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-sm transition"
          >
            {loading ? 'Guardando...' : 'Confirmar Ajuste'}
          </button>
        </div>
      </div>
    </div>
  );
};
