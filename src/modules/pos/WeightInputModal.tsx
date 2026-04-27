import React, { useState, useEffect, useRef } from 'react';
import { Scale, X, Check } from 'lucide-react';
import { Product } from '@/types/Types_POS';

interface Props {
  product: Product;
  onConfirm: (weight: number) => void;
  onClose: () => void;
}

const PRESETS = [0.25, 0.5, 1, 2, 5];

const fmt = (n: number) =>
  n.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const WeightInputModal: React.FC<Props> = ({ product, onConfirm, onClose }) => {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const unitLabel = product.unit_type?.abbreviation ?? 'kg';
  const weight = parseFloat(input) || 0;
  const total = weight * product.unit_price;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && weight > 0) handleConfirm();
    if (e.key === 'Escape') onClose();
  };

  const handleConfirm = () => {
    if (weight <= 0) return;
    onConfirm(weight);
  };

  const handlePreset = (v: number) => {
    setInput(String(v));
    inputRef.current?.focus();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="bg-emerald-500 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
              <Scale size={20} className="text-white" />
            </div>
            <div>
              <p className="text-white font-black text-base leading-tight line-clamp-1">
                {product.name}
              </p>
              <p className="text-emerald-100 text-sm">
                ₡{fmt(product.unit_price)} / {unitLabel}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition"
          >
            <X size={16} className="text-white" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Weight input */}
          <div>
            <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wide">
              Cantidad ({unitLabel})
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="number"
                min="0"
                step="0.01"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="0.00"
                className="w-full text-4xl font-black text-gray-900 text-center border-2 border-gray-200 rounded-2xl py-4 px-4 focus:outline-none focus:border-emerald-400 transition"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">
                {unitLabel}
              </span>
            </div>
          </div>

          {/* Quick presets */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
              Acceso rápido
            </p>
            <div className="flex gap-2 flex-wrap">
              {PRESETS.map((v) => (
                <button
                  key={v}
                  onClick={() => handlePreset(v)}
                  className={`flex-1 min-w-[52px] py-2 rounded-xl font-bold text-sm transition border-2 ${
                    weight === v
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-emerald-300'
                  }`}
                >
                  {v}{unitLabel}
                </button>
              ))}
            </div>
          </div>

          {/* Price preview */}
          {weight > 0 && (
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl px-4 py-3 flex items-center justify-between">
              <span className="text-emerald-700 font-semibold text-sm">
                {fmt(weight)} {unitLabel} × ₡{fmt(product.unit_price)}
              </span>
              <span className="text-emerald-700 font-black text-xl">
                ₡{fmt(total)}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 rounded-2xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={weight <= 0}
              className="flex-1 py-3.5 rounded-2xl font-black text-white bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 transition flex items-center justify-center gap-2"
            >
              <Check size={18} />
              Agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
