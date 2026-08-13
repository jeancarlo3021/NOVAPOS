'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, PlusCircle, Package } from 'lucide-react';
import { closedPriceBase } from '@/utils/priceUtils';
import { cacheGet, cacheKey } from '@/utils/offlineCache';
import { useTenantId } from '@/hooks/useTenant';

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
  const { tenantId } = useTenantId();
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [ivaRate, setIvaRate] = useState(13);
  /**
   * El precio escrito ya trae el IVA adentro.
   *
   * Arranca igual que el POS: si la caja muestra precios con IVA, quien digita
   * un producto rápido está pensando en el precio FINAL. Antes ese número se
   * tomaba como base y se le sumaba el impuesto encima, así que escribir ₡1 000
   * terminaba cobrando ₡1 130 — y el cajero lo descubría al dar el vuelto.
   */
  const [priceHasIva, setPriceHasIva] = useState(() => {
    try {
      const c = cacheGet<any>(cacheKey(tenantId ?? '', 'settings_general'))
        ?? cacheGet<any>(cacheKey(tenantId ?? '', 'general_settings'));
      const cfg = c?.config ?? c;
      return cfg?.taxEnabled !== false && cfg?.showPricesWithTax !== false;
    } catch { return true; }
  });
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  /**
   * Qué se cobra con lo escrito.
   *
   * Se calcula con la MISMA función que usa el guardado, así que el número que
   * se ve acá es exactamente el que va a salir en el ticket. Duplicar la fórmula
   * garantizaría que en algún redondeo dejaran de coincidir.
   */
  const preview = (() => {
    const p = parseFloat(price);
    if (isNaN(p) || p <= 0) return null;
    const qty = Math.max(1, parseFloat(quantity) || 1);
    if (ivaRate <= 0) return { base: p, iva: 0, total: p, qty };
    if (priceHasIva) {
      const r = closedPriceBase(p, ivaRate);
      return { base: r.base, iva: r.iva, total: r.total, qty };
    }
    const iva = Math.round(p * ivaRate) / 100;
    return { base: p, iva, total: p + iva, qty };
  })();

  const money = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR', { maximumFractionDigits: 2 })}`;

  const submit = () => {
    const p = parseFloat(price);
    const q = parseFloat(quantity) || 1;
    if (!name.trim()) { setError('Escribí el nombre del producto'); return; }
    if (isNaN(p) || p < 0) { setError('Escribí un precio válido'); return; }
    if (q <= 0) { setError('La cantidad debe ser mayor a 0'); return; }
    // El carrito trabaja siempre con la BASE: el IVA lo suma él. Si el precio
    // venía con IVA incluido, se despeja acá y no en el carrito, para que el
    // total cobrado sea EXACTAMENTE el número que se escribió.
    const base = priceHasIva && ivaRate > 0 ? closedPriceBase(p, ivaRate).base : p;
    onAdd(name.trim(), base, q, ivaRate);
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

          {/* Cómo se lee el precio escrito, y cuánto se cobra de verdad.
              Sin esto, la diferencia entre lo digitado y lo cobrado aparecía
              recién al dar el vuelto. */}
          <div className="rounded-xl border-2 border-gray-100 bg-gray-50 px-3 py-2.5 space-y-2">
            <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
              <input type="checkbox" checked={priceHasIva}
                onChange={e => setPriceHasIva(e.target.checked)}
                className="w-4 h-4 accent-emerald-600" />
              El precio ya incluye el IVA
            </label>
            {preview && (
              <div className="text-xs text-gray-600 space-y-0.5">
                <p className="flex justify-between">
                  <span>Base</span><b className="tabular-nums">{money(preview.base)}</b>
                </p>
                <p className="flex justify-between">
                  <span>IVA {ivaRate}%</span><b className="tabular-nums">{money(preview.iva)}</b>
                </p>
                <p className="flex justify-between text-sm font-black text-emerald-700 pt-1 border-t border-gray-200">
                  <span>Se cobra</span><span className="tabular-nums">{money(preview.total)}</span>
                </p>
                {preview.qty > 1 && (
                  <p className="flex justify-between text-[11px] text-gray-500">
                    <span>× {preview.qty}</span>
                    <b className="tabular-nums">{money(preview.total * preview.qty)}</b>
                  </p>
                )}
              </div>
            )}
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
