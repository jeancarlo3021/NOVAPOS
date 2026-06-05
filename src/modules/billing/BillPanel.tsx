import { useState } from 'react';
import {
  Receipt, User, Plus, Trash2, X, CreditCard, MapPin,
  Minus, AlertCircle,
} from 'lucide-react';
import type { Bill } from './types';
import { billSubtotal } from './types';
import type { MapItem } from '@/modules/tables/types';

const fmt = (n: number) =>
  `₡${Math.round(n).toLocaleString('es-CR')}`;

interface Props {
  bill: Bill | null;
  spotsById: Map<string, MapItem>;
  /** Activa modo "selecciona otro spot para unir a esta cuenta" */
  addingSpot: boolean;
  onStartBill?: () => void;             // crear cuenta para el spot seleccionado
  onUpdate: (patch: Partial<Bill>) => void;
  onAddItem: (name: string, price: number) => void;
  onUpdateItemQty: (itemId: string, qty: number) => void;
  onRemoveItem: (itemId: string) => void;
  onRemoveSpot: (spotId: string) => void;
  onStartAddSpot: () => void;
  onCancelAddSpot: () => void;
  onCharge: () => void;
  onCancelBill: () => void;
  emptyMessage?: string;
}

function spotLabel(item: MapItem | undefined): string {
  if (!item) return '?';
  if (item.kind === 'table' || item.kind === 'freeTable') return item.label;
  if (item.kind === 'seat') return 'Silla';
  return item.kind;
}

export function BillPanel({
  bill, spotsById, addingSpot,
  onStartBill, onUpdate, onAddItem, onUpdateItemQty, onRemoveItem,
  onRemoveSpot, onStartAddSpot, onCancelAddSpot, onCharge, onCancelBill,
  emptyMessage = 'Selecciona una mesa o silla en el mapa',
}: Props) {
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState<string>('');

  if (!bill) {
    return (
      <aside className="w-96 bg-white border-l border-gray-200 p-6 flex flex-col items-center justify-center text-center shrink-0">
        <Receipt size={32} className="text-gray-300 mb-3" />
        <p className="text-sm font-semibold text-gray-600">{emptyMessage}</p>
        {onStartBill && (
          <button onClick={onStartBill}
            className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold transition">
            <Plus size={14} /> Abrir cuenta aquí
          </button>
        )}
      </aside>
    );
  }

  const subtotal = billSubtotal(bill);

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    const name = itemName.trim();
    const price = parseFloat(itemPrice);
    if (!name || !price || price <= 0) return;
    onAddItem(name, price);
    setItemName('');
    setItemPrice('');
  };

  return (
    <aside className="w-96 bg-white border-l border-gray-200 flex flex-col shrink-0">

      {/* Header del bill */}
      <div className="px-5 py-4 border-b border-gray-100 shrink-0" style={{ borderTop: `4px solid ${bill.color}` }}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: bill.color }}>
            Cuenta abierta
          </p>
          <button onClick={onCancelBill} title="Cancelar cuenta"
            className="text-gray-400 hover:text-red-500 transition">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-gray-400 font-mono">
          {new Date(bill.opened_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })} · ID {bill.id.slice(-6)}
        </p>
      </div>

      {/* Cliente */}
      <div className="px-5 py-3 border-b border-gray-100 shrink-0">
        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1 mb-1.5">
          <User size={11} /> Cliente
        </label>
        <input
          type="text"
          value={bill.customer_name ?? ''}
          onChange={e => onUpdate({ customer_name: e.target.value })}
          placeholder="Nombre (opcional)"
          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
        />
      </div>

      {/* Spots */}
      <div className="px-5 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <MapPin size={11} /> Sitios ({bill.spots.length})
          </p>
          {addingSpot ? (
            <button onClick={onCancelAddSpot}
              className="text-[10px] font-bold text-amber-600 hover:text-amber-700">
              Cancelar
            </button>
          ) : (
            <button onClick={onStartAddSpot}
              className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5">
              <Plus size={10} /> Unir otro
            </button>
          )}
        </div>
        {addingSpot && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 text-[11px] text-amber-800 mb-2 flex items-start gap-1.5">
            <AlertCircle size={12} className="shrink-0 mt-0.5" />
            <span>Click sobre otra mesa o silla en el mapa para unirla.</span>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {bill.spots.map(s => {
            const it = spotsById.get(s.id);
            return (
              <span key={s.id}
                className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md"
                style={{ backgroundColor: `${bill.color}22`, color: bill.color }}>
                {spotLabel(it)}
                {bill.spots.length > 1 && (
                  <button onClick={() => onRemoveSpot(s.id)} className="hover:opacity-70" title="Quitar de la cuenta">
                    <X size={10} />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {bill.items.length === 0 ? (
          <div className="text-center py-8">
            <Receipt size={26} className="text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-400">Sin productos aún</p>
          </div>
        ) : (
          <div className="space-y-2">
            {bill.items.map(it => (
              <div key={it.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{it.name}</p>
                  <p className="text-[11px] text-gray-500 font-mono">{fmt(it.unit_price)} c/u</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => onUpdateItemQty(it.id, Math.max(0, it.quantity - 1))}
                    className="w-6 h-6 rounded bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600">
                    <Minus size={11} />
                  </button>
                  <span className="text-xs font-bold w-6 text-center">{it.quantity}</span>
                  <button onClick={() => onUpdateItemQty(it.id, it.quantity + 1)}
                    className="w-6 h-6 rounded bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600">
                    <Plus size={11} />
                  </button>
                </div>
                <span className="text-xs font-black text-gray-900 w-16 text-right">{fmt(it.unit_price * it.quantity)}</span>
                <button onClick={() => onRemoveItem(it.id)} className="text-gray-300 hover:text-red-500 transition">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick add */}
      <form onSubmit={handleAddItem}
        className="px-5 py-3 border-t border-gray-100 shrink-0 space-y-2 bg-gray-50">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Agregar item</p>
        <div className="grid grid-cols-3 gap-2">
          <input type="text" value={itemName} onChange={e => setItemName(e.target.value)}
            placeholder="Nombre"
            className="col-span-2 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-emerald-400 bg-white" />
          <input type="number" min="0" step="0.01" value={itemPrice}
            onChange={e => setItemPrice(e.target.value)}
            placeholder="Precio"
            className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:border-emerald-400 bg-white" />
        </div>
        <button type="submit"
          disabled={!itemName.trim() || !itemPrice || parseFloat(itemPrice) <= 0}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold transition">
          <Plus size={11} /> Añadir a la cuenta
        </button>
      </form>

      {/* Total + Cobrar */}
      <div className="px-5 py-4 border-t border-gray-100 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">Total</span>
          <span className="text-2xl font-black text-gray-900 font-mono">{fmt(subtotal)}</span>
        </div>
        <button onClick={onCharge}
          disabled={bill.items.length === 0}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-black transition">
          <CreditCard size={15} /> Cobrar {fmt(subtotal)}
        </button>
      </div>
    </aside>
  );
}

export default BillPanel;
