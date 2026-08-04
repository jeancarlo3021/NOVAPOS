import React, { useMemo, useState } from 'react';
import { X, Check, Plus, Minus } from 'lucide-react';
import type { Product } from '@/types/Types_POS';
import type { ModifierGroup, SelectedModifier } from '@/services/modifiers/modifiersService';

interface Props {
  product: Product;
  groups: ModifierGroup[];
  /** Precio base ya resuelto por el POS (puede traer precio de cliente/delivery). */
  basePrice: number;
  /** `note` es el texto libre para cocina («sin cebolla», «bien caliente»). */
  onConfirm: (mods: SelectedModifier[], quantity: number, extraPrice: number, note?: string) => void;
  onClose: () => void;
  /** `embedded` lo renderiza SIN el fondo oscuro, para incrustarlo dentro de otro
   *  modal (el catálogo del restaurante) en vez de apilar dos modales. */
  variant?: 'modal' | 'embedded';
}

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;

/**
 * Elección de extras y modificadores al agregar un plato.
 *
 * Reglas del grupo:
 *  · max_select = 1 → una sola opción (se comporta como radio).
 *  · max_select > 1 → varias, hasta ese tope.
 *  · min_select ≥ 1 → obligatorio: no se puede agregar sin elegir.
 */
export const ModifierPickerModal: React.FC<Props> = ({ product, groups, basePrice, onConfirm, onClose, variant = 'modal' }) => {
  // group.id (o su nombre) → nombres de opciones elegidas
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  // Nota libre para cocina. Los grupos configurados no cubren todo: siempre hay un
  // «sin cebolla» o un «bien caliente» que nadie dio de alta como opción.
  const [note, setNote] = useState('');

  /** Pedidos frecuentes, para no escribirlos a mano cada vez. */
  const QUICK_NOTES = ['Sin cebolla', 'Sin sal', 'Sin picante', 'Para llevar', 'Aparte', 'Bien caliente'];
  const toggleNote = (t: string) => {
    setNote(prev => {
      const parts = prev.split(',').map(x => x.trim()).filter(Boolean);
      const i = parts.findIndex(x => x.toLowerCase() === t.toLowerCase());
      if (i >= 0) parts.splice(i, 1); else parts.push(t);
      return parts.join(', ');
    });
  };
  const noteHas = (t: string) =>
    note.split(',').some(x => x.trim().toLowerCase() === t.toLowerCase());

  const keyOf = (g: ModifierGroup) => String(g.id ?? g.name);

  const toggle = (g: ModifierGroup, name: string) => {
    const k = keyOf(g);
    setPicked(prev => {
      const cur = prev[k] ?? [];
      if (cur.includes(name)) return { ...prev, [k]: cur.filter(x => x !== name) };
      // Grupo de una sola opción: la nueva reemplaza a la anterior.
      if (g.max_select <= 1) return { ...prev, [k]: [name] };
      if (cur.length >= g.max_select) return prev;   // ya llegó al tope
      return { ...prev, [k]: [...cur, name] };
    });
  };

  const selected: SelectedModifier[] = useMemo(() => {
    const out: SelectedModifier[] = [];
    for (const g of groups) {
      for (const name of picked[keyOf(g)] ?? []) {
        const m = g.modifiers.find(x => x.name === name);
        out.push({ group: g.name, name, price_delta: Number(m?.price_delta ?? 0) });
      }
    }
    return out;
  }, [groups, picked]);

  const extraPrice = selected.reduce((s, m) => s + m.price_delta, 0);
  const unit = basePrice + extraPrice;

  // Grupos obligatorios sin cubrir: bloquean el botón y se marcan en rojo.
  const missing = groups.filter(g => (picked[keyOf(g)] ?? []).length < (g.min_select ?? 0));

  const body = (
      <div
        className={variant === 'embedded'
          ? 'bg-white w-full h-full flex flex-col'
          : 'bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col'}
        onClick={e => e.stopPropagation()}
      >

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-gray-900 truncate">{product.name}</h2>
            <p className="text-xs text-gray-500">
              {money(basePrice)} base · {groups.length > 0 ? 'elegí los extras' : 'indicaciones para cocina'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
          {groups.map(g => {
            const k = keyOf(g);
            const cur = picked[k] ?? [];
            const required = (g.min_select ?? 0) > 0;
            const incomplete = cur.length < (g.min_select ?? 0);
            return (
              <div key={k}>
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="text-sm font-black text-gray-800">{g.name}</p>
                  {required ? (
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                      incomplete ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {incomplete ? `Elegí ${g.min_select}` : 'Listo'}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-gray-400">opcional</span>
                  )}
                  {g.max_select > 1 && (
                    <span className="text-[10px] text-gray-400">hasta {g.max_select}</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {g.modifiers.map(m => {
                    const on = cur.includes(m.name);
                    const full = !on && g.max_select > 1 && cur.length >= g.max_select;
                    return (
                      <button
                        key={m.name}
                        onClick={() => toggle(g, m.name)}
                        disabled={full}
                        className={`flex items-center justify-between gap-1.5 px-3 py-2 rounded-xl border-2 text-left transition ${
                          on ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'
                        } ${full ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-bold text-gray-800 truncate">{m.name}</span>
                          {m.price_delta !== 0 && (
                            <span className={`block text-[11px] font-black ${m.price_delta > 0 ? 'text-emerald-600' : 'text-blue-600'}`}>
                              {m.price_delta > 0 ? '+' : '−'}{money(Math.abs(m.price_delta))}
                            </span>
                          )}
                        </span>
                        {on && <Check size={15} className="text-emerald-600 shrink-0" />}
                      </button>
                    );
                  })}
                  {g.modifiers.length === 0 && (
                    <p className="col-span-2 text-xs text-gray-400 py-2">Este grupo no tiene opciones.</p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Nota para cocina */}
          <div className={groups.length > 0 ? 'border-t border-gray-100 pt-3' : ''}>
            <p className="text-sm font-black text-gray-800 mb-1.5">Nota para cocina</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {QUICK_NOTES.map(t => (
                <button key={t} type="button" onClick={() => toggleNote(t)}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-bold transition ${
                    noteHas(t)
                      ? 'border-amber-400 bg-amber-50 text-amber-800'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  {t}
                </button>
              ))}
            </div>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Escribí cualquier otra indicación…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-amber-400"
            />
          </div>
        </div>

        <div className="border-t border-gray-100 px-5 py-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50">
                <Minus size={15} />
              </button>
              <span className="w-10 text-center text-lg font-black tabular-nums">{qty}</span>
              <button onClick={() => setQty(q => q + 1)}
                className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50">
                <Plus size={15} />
              </button>
            </div>
            <div className="text-right">
              {extraPrice !== 0 && (
                <p className="text-[11px] text-gray-400">
                  {money(basePrice)} {extraPrice > 0 ? '+' : '−'} {money(Math.abs(extraPrice))} extras
                </p>
              )}
              <p className="text-2xl font-black text-gray-900 tabular-nums">{money(unit * qty)}</p>
            </div>
          </div>
          <button
            onClick={() => onConfirm(selected, qty, extraPrice, note.trim() || undefined)}
            disabled={missing.length > 0}
            className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black disabled:bg-gray-200 disabled:text-gray-400"
          >
            {missing.length > 0
              ? `Falta elegir: ${missing.map(g => g.name).join(', ')}`
              : 'Agregar al carrito'}
          </button>
        </div>
      </div>
  );

  if (variant === 'embedded') return body;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      {body}
    </div>
  );
};

export default ModifierPickerModal;
