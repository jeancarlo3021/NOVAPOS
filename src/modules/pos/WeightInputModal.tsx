import React, { useState, useEffect, useRef } from 'react';
import { Scale, X, Check } from 'lucide-react';
import { Product } from '@/types/Types_POS';

interface Props {
  product: Product;
  onConfirm: (weight: number) => void;
  onClose: () => void;
  /** Si el plan no controla stock, no se topa la cantidad. */
  ignoreStock?: boolean;
  /** Precio especial del cliente (si aplica). */
  customerPrice?: number;
}

const fmt = (n: number) =>
  n.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const WeightInputModal: React.FC<Props> = ({ product, onConfirm, onClose, ignoreStock, customerPrice }) => {
  const [mode, setMode] = useState<'weight' | 'amount'>('weight');
  const [input, setInput] = useState('');
  const [canClose, setCanClose] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const unitLabel = product.unit_type?.abbreviation ?? 'kg';
  const price = (customerPrice != null && customerPrice > 0) ? customerPrice : product.unit_price;

  // Tope: lo que hay en inventario (salvo que el plan no controle stock o sea infinito).
  const tracks = (product as any).tracks_stock !== false;
  const maxStock = (ignoreStock || !tracks) ? Infinity : Number(product.stock_quantity ?? Infinity);

  const num = parseFloat(input) || 0;
  let weight = mode === 'weight' ? num : (price > 0 ? num / price : 0);
  weight = Math.round(weight * 1000) / 1000;
  const capped = Math.min(weight, maxStock);
  const exceeds = weight > maxStock;
  const total = capped * price;

  useEffect(() => {
    inputRef.current?.focus();
    const timer = setTimeout(() => setCanClose(true), 400);
    return () => clearTimeout(timer);
  }, []);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && capped > 0) handleConfirm();
    if (e.key === 'Escape') onClose();
  };

  const handleConfirm = () => {
    if (capped <= 0) return;
    onConfirm(capped);
  };

  const presets = mode === 'weight' ? [0.25, 0.5, 1, 2, 5] : [1000, 2000, 5000, 10000];

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={(e) => canClose && e.target === e.currentTarget && onClose()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="bg-emerald-500 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
              <Scale size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-black text-base leading-tight line-clamp-1">{product.name}</p>
              <p className="text-emerald-100 text-sm">
                ₡{fmt(price)} / {unitLabel}{maxStock !== Infinity ? ` · disp. ${fmt(maxStock)} ${unitLabel}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition shrink-0">
            <X size={16} className="text-white" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Modo: por peso o por monto */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setMode('weight'); setInput(''); inputRef.current?.focus(); }}
              className={`py-2.5 rounded-xl text-sm font-black transition ${mode === 'weight' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
              Por peso ({unitLabel})
            </button>
            <button onClick={() => { setMode('amount'); setInput(''); inputRef.current?.focus(); }}
              className={`py-2.5 rounded-xl text-sm font-black transition ${mode === 'amount' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
              Por monto (₡)
            </button>
          </div>

          {/* Input */}
          <div className="relative">
            <input
              ref={inputRef}
              type="number"
              min="0"
              step="0.01"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={mode === 'weight' ? '0.00' : '₡0'}
              className="w-full text-4xl font-black text-gray-900 text-center border-2 border-gray-200 rounded-2xl py-4 px-4 focus:outline-none focus:border-emerald-400 transition"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">
              {mode === 'weight' ? unitLabel : '₡'}
            </span>
          </div>

          {/* Quick presets */}
          <div className="flex gap-2 flex-wrap">
            {presets.map((v) => (
              <button key={v} onClick={() => { setInput(String(v)); inputRef.current?.focus(); }}
                className="flex-1 min-w-14 py-2 rounded-xl font-bold text-sm bg-gray-50 text-gray-700 border-2 border-gray-200 hover:border-emerald-300">
                {mode === 'weight' ? `${v}${unitLabel}` : `₡${fmt(v)}`}
              </button>
            ))}
          </div>

          {/* Vista previa */}
          {capped > 0 && (
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl px-4 py-3 flex items-center justify-between">
              <span className="text-emerald-700 font-semibold text-sm">
                {fmt(capped)} {unitLabel} × ₡{fmt(price)}
              </span>
              <span className="text-emerald-700 font-black text-xl">₡{fmt(total)}</span>
            </div>
          )}
          {exceeds && (
            <p className="text-amber-600 text-xs font-bold text-center">
              Solo hay {fmt(maxStock)} {unitLabel} en inventario — se ajustó a ese máximo.
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-3.5 rounded-2xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition">
              Cancelar
            </button>
            <button onClick={handleConfirm} disabled={capped <= 0}
              className="flex-1 py-3.5 rounded-2xl font-black text-white bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 transition flex items-center justify-center gap-2">
              <Check size={18} /> Agregar {capped > 0 ? `${fmt(capped)} ${unitLabel}` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
