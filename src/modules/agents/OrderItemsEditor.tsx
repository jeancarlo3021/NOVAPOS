import React, { useState } from 'react';
import { Trash2, Plus, Minus, Loader2, Save, X, AlertCircle, Tag } from 'lucide-react';
import { agentOrdersService, type AgentOrder, type AgentOrderItem } from '@/services/agents/salesAgentsService';

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;

/**
 * Ajuste del pedido antes de cobrarlo.
 *
 * En la puerta del cliente el pedido cambia: se devuelven productos que no se
 * dejaron, se bajan cantidades y a veces se negocia el precio. Antes había que
 * anular y rehacer el pedido en caja; acá se corrige y el total se recalcula.
 *
 * Solo funciona mientras el pedido NO esté cobrado: después de facturado, la
 * corrección es una nota de crédito, no una edición.
 */
export const OrderItemsEditor: React.FC<{
  order: AgentOrder;
  onClose: () => void;
  onSaved: (updated: AgentOrder) => void;
}> = ({ order, onClose, onSaved }) => {
  const [items, setItems] = useState<AgentOrderItem[]>(
    order.items.map(it => ({ ...it })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setQty = (i: number, qty: number) => {
    const q = Math.max(0, round2(qty));
    setItems(prev => prev.map((x, j) => j === i
      ? { ...x, quantity: q, subtotal: round2(q * x.unit_price) } : x));
  };
  const setPrice = (i: number, price: number) => {
    const p = Math.max(0, round2(price));
    setItems(prev => prev.map((x, j) => j === i
      ? { ...x, unit_price: p, subtotal: round2(x.quantity * p) } : x));
  };
  const remove = (i: number) => setItems(prev => prev.filter((_, j) => j !== i));

  // Una línea en 0 es lo mismo que no llevarla: no se manda al servidor.
  const kept = items.filter(it => it.quantity > 0);
  const total = kept.reduce((s, x) => s + x.subtotal, 0);
  const original = order.items.reduce((s, x) => s + Number(x.subtotal || 0), 0);
  const diff = round2(total - original);

  const save = async () => {
    if (kept.length === 0) {
      setError('El pedido no puede quedar vacío. Si el cliente no se quedó con nada, anulá el pedido.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const updated = await agentOrdersService.updateItems(order.id, kept);
      onSaved({ ...updated, items: kept });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <span className="text-sm font-black text-gray-800">
            Ajustar {order.number ?? 'pedido'}
            <span className="block text-xs font-bold text-gray-400">
              {order.customer_name ?? 'Sin cliente'}
            </span>
          </span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-2">
          {items.map((it, i) => (
            <div key={i} className={`border-2 rounded-xl p-2.5 ${
              it.quantity === 0 ? 'border-red-200 bg-red-50/50' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-black text-gray-800 min-w-0 truncate">{it.product_name}</span>
                <button onClick={() => remove(i)} title="Quitar la línea"
                  className="p-2 sm:p-1 rounded-lg text-red-500 hover:bg-red-50 shrink-0">
                  <Trash2 size={15} />
                </button>
              </div>

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {/* Cantidad */}
                <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
                  <button onClick={() => setQty(i, it.quantity - 1)}
                    className="px-3 py-2.5 sm:px-2 sm:py-1.5 hover:bg-gray-50"><Minus size={13} className="text-gray-500" /></button>
                  <input type="number" min={0} step="any" value={it.quantity}
                    onChange={e => setQty(i, Number(e.target.value))}
                    className="w-14 text-center text-sm font-black text-gray-800 outline-none" />
                  <button onClick={() => setQty(i, it.quantity + 1)}
                    className="px-3 py-2.5 sm:px-2 sm:py-1.5 hover:bg-gray-50"><Plus size={13} className="text-gray-500" /></button>
                </div>

                {/* Precio de venta editable */}
                <label className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-2.5 sm:py-1.5">
                  <Tag size={12} className="text-gray-400" />
                  <span className="text-xs font-bold text-gray-400">₡</span>
                  <input type="number" min={0} step="any" value={it.unit_price}
                    onChange={e => setPrice(i, Number(e.target.value))}
                    className="w-20 text-sm font-black text-gray-800 outline-none" />
                </label>

                <span className="ml-auto text-sm font-black tabular-nums text-gray-800">
                  {money(it.subtotal)}
                </span>
              </div>

              {it.quantity === 0 && (
                <p className="mt-1 text-[11px] font-bold text-red-600">
                  En 0: esta línea no se va a cobrar.
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 p-3 space-y-2 shrink-0">
          {error && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-red-600">
              <AlertCircle size={14} /> {error}
            </p>
          )}
          <div className="flex items-center justify-between text-sm font-black text-gray-800">
            <span>Total</span>
            <span className="tabular-nums">
              {money(total)}
              {diff !== 0 && (
                <span className={`ml-2 text-xs ${diff < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  ({diff > 0 ? '+' : ''}{money(diff)})
                </span>
              )}
            </span>
          </div>
          <button onClick={() => void save()} disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 sm:py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderItemsEditor;
