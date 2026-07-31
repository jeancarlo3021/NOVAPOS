'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, PlusCircle, Package } from 'lucide-react';

interface Props {
  onAdd: (name: string, price: number, quantity: number, ivaRate: number) => void;
  onClose: () => void;
}

// Tarifas de IVA de Costa Rica (Hacienda).
const IVA_RATES = [13, 4, 2, 1, 0];

/**
 * Producto rápido / ad-hoc: agrega al carrito un producto que NO está en el
 * catálogo, con nombre, precio y cantidad. Atajo: Ctrl+P.
 */
export const QuickProductModal: React.FC<Props> = ({ onAdd, onClose }) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [ivaRate, setIvaRate] = useState(13);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const submit = () => {
    const p = parseFloat(price);
    const q = parseFloat(quantity) || 1;
    if (!name.trim()) { setError('Escribí el nombre del producto'); return; }
    if (isNaN(p) || p < 0) { setError('Escribí un precio válido'); return; }
    if (q <= 0) { setError('La cantidad debe ser mayor a 0'); return; }
    onAdd(name.trim(), p, q, ivaRate);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center"><Package size={18} className="text-white" /></div>
            <div>
              <h3 className="font-black text-gray-900 text-sm">Producto rápido</h3>
              <p className="text-xs text-gray-400">Se agrega al carrito sin crearlo en el catálogo</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 font-semibold">{error}</div>}

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Nombre del producto</label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              placeholder="Ej. Producto varios"
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Precio (₡)</label>
              <input
                type="number" inputMode="decimal" min="0" step="1"
                value={price}
                onChange={e => { setPrice(e.target.value); setError(''); }}
                placeholder="0"
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm text-right font-black focus:outline-none focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Cantidad</label>
              <input
                type="number" inputMode="decimal" min="0" step="1"
                value={quantity}
                onChange={e => { setQuantity(e.target.value); setError(''); }}
                placeholder="1"
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm text-right font-black focus:outline-none focus:border-emerald-400"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">IVA</label>
            <div className="grid grid-cols-5 gap-1.5">
              {IVA_RATES.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setIvaRate(r)}
                  className={`h-10 rounded-lg border-2 text-sm font-black transition ${
                    ivaRate === r
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300'
                  }`}
                >
                  {r === 0 ? 'Exento' : `${r}%`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border-2 border-gray-200 bg-white text-gray-600 font-bold text-sm hover:bg-gray-100">Cancelar</button>
          <button onClick={submit} className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center justify-center gap-2">
            <PlusCircle size={16} /> Agregar
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickProductModal;
