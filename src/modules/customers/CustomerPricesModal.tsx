import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Tag, RotateCcw, Loader2 } from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { inventoryProductsService } from '@/services/Inventory/InventoryProductsService';
import { customerPricesService } from '@/services/customers/customerPricesService';
import type { Customer } from '@/services/customers/customersService';
import type { Product } from '@/types/Types_POS';
import { closedPriceBase, checkoutTotal } from '@/utils/priceUtils';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Tasa de IVA del producto (default 13 si no está definida).
const rateOf = (p: Product) => { const r = Number((p as any).iva_rate); return isNaN(r) ? 13 : r; };

export const CustomerPricesModal: React.FC<{ customer: Customer; onClose: () => void }> = ({ customer, onClose }) => {
  const { tenantId } = useTenantId();
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});   // product_id → precio especial
  const [drafts, setDrafts] = useState<Record<string, string>>({});   // valor en edición
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyCustom, setOnlyCustom] = useState(false);
  // Ingresar el precio CON IVA (cerrado): se calcula la base como en productos.
  const [withIva, setWithIva] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!tenantId) return;
      setLoading(true);
      try {
        const [prods, map] = await Promise.all([
          inventoryProductsService.getAllProducts(tenantId),
          customerPricesService.mapForCustomer(customer.id),
        ]);
        if (!active) return;
        setProducts(Array.isArray(prods) ? prods : []);
        setPrices(map);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [tenantId, customer.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => {
      if (onlyCustom && prices[p.id] == null) return false;
      if (!q) return true;
      return (p.name?.toLowerCase().includes(q)) || ((p as any).sku?.toLowerCase?.().includes(q));
    });
  }, [products, search, onlyCustom, prices]);

  const save = async (p: Product) => {
    const raw = drafts[p.id];
    if (raw == null || raw === '') return;
    const entered = parseFloat(raw);
    if (isNaN(entered) || entered < 0) return;
    // Si es "con IVA", lo ingresado es el total final → calculamos la BASE (igual
    // que el precio cerrado en productos). Si no, es la base directa.
    const val = withIva ? closedPriceBase(entered, rateOf(p)).base : entered;
    setSavingId(p.id);
    try {
      await customerPricesService.upsert(customer.id, p.id, val);
      setPrices(prev => ({ ...prev, [p.id]: val }));
      setDrafts(prev => { const n = { ...prev }; delete n[p.id]; return n; });
    } catch { /* noop */ }
    finally { setSavingId(null); }
  };

  const clear = async (p: Product) => {
    setSavingId(p.id);
    try {
      await customerPricesService.remove(customer.id, p.id);
      setPrices(prev => { const n = { ...prev }; delete n[p.id]; return n; });
      setDrafts(prev => { const n = { ...prev }; delete n[p.id]; return n; });
    } catch { /* noop */ }
    finally { setSavingId(null); }
  };

  const customCount = Object.keys(prices).length;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center"><Tag size={16} className="text-white" /></div>
            <div>
              <h2 className="font-black text-gray-900 text-sm">Precios especiales</h2>
              <p className="text-xs text-gray-400">{customer.name} · {customCount} con precio especial</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          <button onClick={() => setOnlyCustom(s => !s)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${onlyCustom ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
            Solo especiales
          </button>
          <button onClick={() => setWithIva(s => !s)} title="Ingresar el precio final con IVA; se calcula la base (múltiplo de ₡10)"
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${withIva ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
            Precio con IVA
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-14 text-gray-400 gap-2"><Loader2 size={18} className="animate-spin" /> Cargando…</div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-14">Sin productos</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-[11px] font-bold text-gray-400 uppercase">
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-right">Precio normal</th>
                  <th className="px-3 py-2 text-right w-44">Precio cliente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(p => {
                  const special = prices[p.id];
                  const rate = rateOf(p);
                  // Valor mostrado del especial según el modo (base o con IVA).
                  const shown = special != null ? (withIva ? checkoutTotal(special, rate) : special) : null;
                  const draft = drafts[p.id];
                  const hasDraft = draft != null && draft !== '' && parseFloat(draft) !== shown;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2">
                        <p className="font-semibold text-gray-800">{p.name}</p>
                        {special != null && (
                          <span className="text-[10px] font-bold text-emerald-600">
                            Especial: {fmt(special)}{rate > 0 ? ` · c/IVA ${fmt(checkoutTotal(special, rate))}` : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500">
                        {fmt(p.unit_price)}{withIva && rate > 0 ? <span className="block text-[10px] text-gray-400">c/IVA {fmt(checkoutTotal(Math.round(p.unit_price), rate))}</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 justify-end">
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={draft ?? (shown != null ? String(shown) : '')}
                            onChange={e => setDrafts(prev => ({ ...prev, [p.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') save(p); }}
                            placeholder={String(withIva && rate > 0 ? checkoutTotal(Math.round(p.unit_price), rate) : Math.round(p.unit_price))}
                            className="w-24 text-right border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          />
                          <button onClick={() => save(p)} disabled={savingId === p.id || !hasDraft}
                            className="px-2 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold disabled:bg-gray-200 disabled:text-gray-400">
                            {savingId === p.id ? '…' : 'Guardar'}
                          </button>
                          {special != null && (
                            <button onClick={() => clear(p)} disabled={savingId === p.id} title="Quitar precio especial"
                              className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600">
                              <RotateCcw size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 text-right">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm">Listo</button>
        </div>
      </div>
    </div>
  );
};
