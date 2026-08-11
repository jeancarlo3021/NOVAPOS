'use client';

import React, { useMemo, useState } from 'react';
import { X, Trash2, Search, Plus, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useTenantId } from '@/hooks/useTenant';
import { useAuth } from '@/context/AuthContext';
import { useInventoryProducts } from '@/hooks/useInventoryProducts';
import { fuzzyMatch } from '@/utils/fuzzySearch';

/**
 * Merma rápida: varios productos de una sola vez.
 *
 * El ajuste de a uno ya existía, pero al cierre de cocina se botan cinco cosas
 * juntas y entrar producto por producto hace que, en la práctica, nadie lo
 * registre. Y una merma que no se registra no desaparece: reaparece como
 * varianza sin explicar en el food cost, que es el peor lugar donde encontrarla.
 */

const MOTIVOS = [
  { type: 'damage'  as const, label: 'Se dañó',           hint: 'Derrame, se quemó, se cayó' },
  { type: 'expired' as const, label: 'Se venció',         hint: 'Pasó la fecha o se echó a perder' },
  { type: 'theft'   as const, label: 'Faltante / robo',   hint: 'Desapareció sin explicación' },
  { type: 'decrease' as const, label: 'Cortesía / prueba', hint: 'Se regaló o se usó para degustación' },
];

interface Line { product_id: string; name: string; cost: number; quantity: string }

interface Props {
  onClose: () => void;
  /** Se llama tras registrar, para refrescar el inventario del padre. */
  onDone?: () => void;
}

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR', { maximumFractionDigits: 0 })}`;

export const QuickWasteModal: React.FC<Props> = ({ onClose, onDone }) => {
  const { tenantId } = useTenantId();
  const { user } = useAuth();
  const { products, loading } = useInventoryProducts(tenantId);

  const [motivo, setMotivo] = useState<typeof MOTIVOS[number]>(MOTIVOS[0]);
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ registered: number; total_cost: number } | null>(null);

  // Solo lo que lleva control de stock: un producto infinito no tiene existencias
  // que botar, y ofrecerlo solo genera una línea que el servidor va a ignorar.
  const countable = useMemo(
    () => products.filter(p => (p as any).tracks_stock !== false),
    [products]);

  const results = useMemo(() => {
    if (!search.trim()) return [];
    const chosen = new Set(lines.map(l => l.product_id));
    return countable
      .filter(p => !chosen.has(p.id) && fuzzyMatch(search, p.name, p.sku, (p as any).sku2))
      .slice(0, 6);
  }, [search, countable, lines]);

  const add = (p: any) => {
    setLines(prev => [...prev, {
      product_id: p.id, name: p.name,
      cost: Number(p.cost_price) || 0, quantity: '1',
    }]);
    setSearch('');
  };
  const setQty = (id: string, v: string) =>
    setLines(prev => prev.map(l => l.product_id === id ? { ...l, quantity: v.replace(/[^\d.]/g, '') } : l));
  const remove = (id: string) => setLines(prev => prev.filter(l => l.product_id !== id));

  const valid = lines.filter(l => (Number(l.quantity) || 0) > 0);
  const totalCost = valid.reduce((s, l) => s + l.cost * (Number(l.quantity) || 0), 0);

  const submit = async () => {
    if (valid.length === 0) { setErr('Agregá al menos un producto con cantidad.'); return; }
    setSaving(true); setErr('');
    try {
      const r = await apiFetch<{ registered: number; total_cost: number }>('/stock-adjustments/waste', {
        method: 'POST',
        body: JSON.stringify({
          type: motivo.type,
          reason: motivo.label,
          notes: notes.trim() || null,
          user_email: user?.email ?? null,
          items: valid.map(l => ({ product_id: l.product_id, quantity: Number(l.quantity) })),
        }),
      });
      setDone(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo registrar');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 shrink-0">
          <Trash2 size={18} className="text-red-500" />
          <h2 className="text-base font-black text-gray-900 flex-1">Merma rápida</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {done ? (
          <div className="p-5 space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3">
              <p className="font-black flex items-center gap-2"><CheckCircle2 size={17} /> Merma registrada</p>
              <p className="text-sm mt-1">
                {done.registered} producto(s) · <b>{fmt(done.total_cost)}</b> de pérdida.
              </p>
              <p className="text-xs mt-1.5 text-emerald-700">
                Queda con motivo en el movimiento de stock, así que en el food cost aparece como
                merma explicada y no como varianza.
              </p>
            </div>
            <button onClick={() => { onDone?.(); onClose(); }}
              className="w-full py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-black text-sm">
              Listo
            </button>
          </div>
        ) : (
          <>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}

              {/* Motivo primero: es lo que separa una merma explicada de un
                  faltante misterioso en el reporte. */}
              <div>
                <label className="block text-xs font-black text-gray-600 uppercase tracking-wider mb-2">¿Qué pasó?</label>
                <div className="grid grid-cols-2 gap-2">
                  {MOTIVOS.map(m => (
                    <button key={m.type} onClick={() => setMotivo(m)}
                      className={`text-left px-3 py-2 rounded-xl border-2 transition ${
                        motivo.type === m.type
                          ? 'border-red-400 bg-red-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      <p className="text-sm font-bold text-gray-800">{m.label}</p>
                      <p className="text-[10px] text-gray-400">{m.hint}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Buscador */}
              <div>
                <label className="block text-xs font-black text-gray-600 uppercase tracking-wider mb-2">Productos</label>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder={loading ? 'Cargando productos…' : 'Buscar por nombre o código…'}
                    disabled={loading}
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-red-400"
                  />
                </div>
                {results.length > 0 && (
                  <div className="mt-1 border border-gray-200 rounded-lg divide-y divide-gray-50 overflow-hidden">
                    {results.map(p => (
                      <button key={p.id} onClick={() => add(p)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-red-50">
                        <Plus size={13} className="text-red-500 shrink-0" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-bold text-gray-800 truncate">{p.name}</span>
                          <span className="block text-[10px] text-gray-400">
                            hay {Number(p.stock_quantity ?? 0)} · costo {fmt(Number((p as any).cost_price) || 0)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Líneas */}
              {lines.length > 0 && (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="divide-y divide-gray-50">
                    {lines.map(l => (
                      <div key={l.product_id} className="flex items-center gap-2 px-3 py-2">
                        <span className="flex-1 min-w-0 text-sm font-semibold text-gray-800 truncate">{l.name}</span>
                        <input
                          value={l.quantity} onChange={e => setQty(l.product_id, e.target.value)}
                          inputMode="decimal"
                          className="w-20 px-2 py-1 text-sm text-right border border-gray-200 rounded-lg"
                        />
                        <span className="w-20 text-right text-xs text-gray-500 tabular-nums">
                          {fmt(l.cost * (Number(l.quantity) || 0))}
                        </span>
                        <button onClick={() => remove(l.product_id)} className="text-gray-300 hover:text-red-500">
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between px-3 py-2 bg-red-50 border-t border-red-100">
                    <span className="text-xs font-black text-red-700 uppercase tracking-wider">Pérdida</span>
                    <span className="text-sm font-black text-red-700 tabular-nums">{fmt(totalCost)}</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-black text-gray-600 uppercase tracking-wider mb-1.5">
                  Detalle <span className="font-normal normal-case text-gray-400">(opcional)</span>
                </label>
                <input value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Se cortó la cadena de frío el domingo…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>

              <p className="flex items-start gap-2 text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-500" />
                Baja el stock de una vez y no se puede deshacer. Si te equivocás, se corrige con un
                ajuste de entrada.
              </p>
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 font-bold text-sm text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={submit} disabled={saving || valid.length === 0}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-sm flex items-center justify-center gap-2">
                {saving ? <><Loader2 size={15} className="animate-spin" /> Registrando…</>
                  : <>Registrar merma{valid.length > 0 ? ` (${valid.length})` : ''}</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default QuickWasteModal;
