import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Plus, Trash2, Users, CreditCard, Loader2, ArrowRightLeft, Ban, Search, UserCog,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { fuzzyMatch } from '@/utils/fuzzySearch';
import { tableOrdersService, type TableOrder, type TableOrderItem } from '@/services/tables/tableOrdersService';
import { modifiersService, indexByProduct, type ModifierGroup, type SelectedModifier } from '@/services/modifiers/modifiersService';
import { ModifierPickerModal } from '@/modules/pos/ModifierPickerModal';
import { useAuth } from '@/context/AuthContext';

/** Producto mínimo para armar la ronda. */
interface PickProduct {
  id: string; name: string; sku?: string | null;
  unit_price: number; iva_rate?: number | null;
}

interface Props {
  tableId: string;
  tableLabel: string;
  /** Otras mesas del mapa (para mover la cuenta). */
  otherTables: { id: string; label: string }[];
  onClose: () => void;
  /** Se llama cuando cambia la cuenta, para refrescar el mapa. */
  onChanged: () => void;
}

const money = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;

/**
 * Cuenta de una mesa: abrir, ir agregando rondas de consumo y cobrar.
 *
 * El COBRO no se hace acá: se pasa al POS con la cuenta cargada, para no duplicar
 * toda la lógica de IVA, medios de pago, factura electrónica e impresión que el
 * POS ya resuelve. Al cobrarse, el POS cierra la cuenta.
 */
export const TableOrderPanel: React.FC<Props> = ({ tableId, tableLabel, otherTables, onClose, onChanged }) => {
  const navigate = useNavigate();
  const [order, setOrder] = useState<TableOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Alta de ronda
  const [products, setProducts] = useState<PickProduct[]>([]);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<TableOrderItem[]>([]);
  const [moving, setMoving] = useState(false);
  // Cambio de mesero responsable (cambio de turno).
  const [assigning, setAssigning] = useState(false);
  const [staff, setStaff] = useState<Array<{ id: string; full_name?: string | null; email?: string }>>([]);
  // Extras del plato: es donde de verdad hacen falta (el mesero toma el pedido).
  const { planFeatures } = useAuth();
  const modifiersOn = (planFeatures as any)?.modifiers === true;
  const [modGroups, setModGroups] = useState<Map<string, ModifierGroup[]>>(new Map());
  const [modFor, setModFor] = useState<{ product: PickProduct; groups: ModifierGroup[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const open = await tableOrdersService.open();
      setOrder(open.find(o => o.table_id === tableId) ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo cargar la cuenta');
    } finally { setLoading(false); }
  }, [tableId]);

  useEffect(() => { void load(); }, [load]);
  // Menú del restaurante: las RECETAS vendibles, no el catálogo entero. El
  // mesero no tiene por qué encontrarse el tomate ni el aceite. Cada plato
  // llega con forma de producto porque la venta sigue siendo sobre el producto.
  // Sin recetas cargadas se cae al catálogo completo: dejar el menú vacío haría
  // que no se pudiera tomar ningún pedido.
  const menuOn = (planFeatures as any)?.restaurant_menu_recipes === true;
  useEffect(() => {
    const load = async () => {
      if (menuOn) {
        const menu = await apiFetch<PickProduct[]>('/recipes/menu').catch(() => [] as PickProduct[]);
        if (menu.length > 0) { setProducts(menu); return; }
      }
      const all = await apiFetch<PickProduct[]>('/products').catch(() => [] as PickProduct[]);
      setProducts(all ?? []);
    };
    void load();
  }, [menuOn]);

  useEffect(() => {
    if (!modifiersOn) return;
    modifiersService.list()
      .then(gs => setModGroups(indexByProduct(gs ?? [])))
      .catch(() => setModGroups(new Map()));
  }, [modifiersOn]);

  const results = (() => {
    const t = q.trim();
    if (!t) return products.slice(0, 8);
    return products.filter(p => fuzzyMatch(t, p.name, p.sku ?? '')).slice(0, 8);
  })();

  const addDraft = (p: PickProduct) => {
    const groups = modGroups.get(p.id);
    if (groups && groups.length > 0) { setModFor({ product: p, groups }); setQ(''); return; }
    setDraft(prev => {
      const i = prev.findIndex(x => x.product_id === p.id);
      if (i >= 0) {
        const next = [...prev];
        const qty = next[i].quantity + 1;
        next[i] = { ...next[i], quantity: qty, subtotal: Math.round(qty * next[i].unit_price * 100) / 100 };
        return next;
      }
      return [...prev, {
        product_id: p.id, product_name: p.name, quantity: 1,
        unit_price: Number(p.unit_price ?? 0), subtotal: Number(p.unit_price ?? 0),
      }];
    });
    setQ('');
  };

  /** Agrega el plato YA con sus extras: línea propia (precio y preparación distintos). */
  const addWithModifiers = (p: PickProduct, mods: SelectedModifier[], qty: number, note?: string) => {
    const unit = Math.round((Number(p.unit_price ?? 0) + mods.reduce((s, m) => s + m.price_delta, 0)) * 100) / 100;
    setDraft(prev => [...prev, {
      product_id: p.id, product_name: p.name, quantity: qty,
      unit_price: unit, subtotal: Math.round(unit * qty * 100) / 100,
      notes: [mods.map(m => m.name).join(', '), note].filter(Boolean).join(' · ') || undefined,
    }]);
    setModFor(null);
  };

  const setDraftQty = (idx: number, qty: number) => {
    setDraft(prev => prev.map((x, i) => i === idx
      ? { ...x, quantity: qty, subtotal: Math.round(qty * x.unit_price * 100) / 100 } : x));
  };

  const draftTotal = draft.reduce((s, x) => s + x.subtotal, 0);

  /** Manda la ronda: abre la cuenta si no existía, o la agrega a la existente. */
  const sendRound = async () => {
    if (draft.length === 0) return;
    setBusy(true); setErr('');
    try {
      if (!order) {
        const created = await tableOrdersService.open_({
          table_id: tableId, table_label: tableLabel, items: draft,
        });
        setOrder(created);
      } else {
        await tableOrdersService.addItems(order.id, draft);
      }
      setDraft([]);
      await load();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo agregar la ronda');
    } finally { setBusy(false); }
  };

  const removeItem = async (itemId?: string) => {
    if (!order || !itemId) return;
    setBusy(true);
    try {
      await tableOrdersService.removeItem(order.id, itemId);
      await load(); onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo quitar la línea');
    } finally { setBusy(false); }
  };

  const moveTo = async (destId: string, destLabel: string) => {
    if (!order) return;
    setBusy(true); setErr('');
    try {
      // Por `move` y no por el PATCH genérico: valida que la mesa destino esté
      // libre y deja rastro de dónde venía la cuenta.
      await tableOrdersService.move(order.id, destId, destLabel);
      setMoving(false);
      onChanged();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo mover la cuenta');
    } finally { setBusy(false); }
  };

  // Personal del negocio, solo cuando se va a reasignar: no tiene sentido pedir
  // la lista de usuarios cada vez que se abre una mesa.
  useEffect(() => {
    if (!assigning || staff.length > 0) return;
    apiFetch<any[]>('/users').then(us => setStaff(us ?? [])).catch(() => {});
  }, [assigning, staff.length]);

  const assignTo = async (waiterId: string) => {
    if (!order) return;
    setBusy(true); setErr('');
    try {
      await tableOrdersService.assign(order.id, waiterId);
      setAssigning(false);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo cambiar el mesero');
    } finally { setBusy(false); }
  };

  const cancelOrder = async () => {
    if (!order) return;
    if (!window.confirm(`¿Anular la cuenta de ${tableLabel} sin cobrar?\n\nSe pierde el consumo registrado.`)) return;
    setBusy(true);
    try {
      await tableOrdersService.cancel(order.id);
      onChanged(); onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo anular');
    } finally { setBusy(false); }
  };

  /** Pasa la cuenta al POS para cobrarla con el flujo normal. */
  const charge = () => {
    if (!order || order.items.length === 0) return;
    try {
      sessionStorage.setItem('novapos_pending_table_order', JSON.stringify({
        order_id: order.id,
        table_id: order.table_id,
        table_label: order.table_label ?? tableLabel,
        items: order.items,
      }));
    } catch { /* sessionStorage bloqueado: el POS abrirá vacío */ }
    navigate('/pos');
  };

  // Líneas agrupadas por RONDA, para ver qué se pidió en cada tanda.
  const byCourse = (order?.items ?? []).reduce<Record<number, TableOrderItem[]>>((acc, it) => {
    const c = Number(it.course ?? 1);
    (acc[c] = acc[c] ?? []).push(it);
    return acc;
  }, {});
  const courses = Object.keys(byCourse).map(Number).sort((a, b) => a - b);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-gray-900 truncate">{tableLabel}</h2>
            <p className="text-xs text-gray-500">
              {order
                ? <>Cuenta abierta {order.guests ? <>· <Users size={11} className="inline" /> {order.guests}</> : null}
                    {' · '}desde {new Date(order.opened_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}</>
                : 'Mesa libre — agregá productos para abrir la cuenta'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {err && <div className="mx-5 mt-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-lg px-3 py-2">{err}</div>}

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400 gap-2"><Loader2 size={18} className="animate-spin" /> Cargando…</div>
          ) : (
            <>
              {/* Consumo por ronda */}
              {courses.length > 0 && (
                <div className="space-y-3">
                  {courses.map(c => (
                    <div key={c}>
                      <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider mb-1">Ronda {c}</p>
                      <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                        {byCourse[c].map(it => (
                          <li key={it.id} className="flex items-center gap-2 px-3 py-2">
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-bold text-gray-800 truncate">{it.product_name}</span>
                              {it.notes && <span className="block text-[11px] text-amber-700 font-semibold">↳ {it.notes}</span>}
                            </span>
                            <span className="text-xs text-gray-500 tabular-nums shrink-0">{it.quantity} × {money(it.unit_price)}</span>
                            <span className="text-sm font-black text-gray-800 tabular-nums shrink-0 w-24 text-right">{money(it.subtotal)}</span>
                            <button onClick={() => removeItem(it.id)} disabled={busy}
                              className="shrink-0 text-gray-300 hover:text-red-500 disabled:opacity-40"><Trash2 size={14} /></button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {/* Nueva ronda */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider mb-2">
                  {courses.length > 0 ? 'Agregar otra ronda' : 'Primera ronda'}
                </p>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto…"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-emerald-400" />
                  {q.trim() && results.length > 0 && (
                    <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                      {results.map(p => (
                        <button key={p.id} onClick={() => addDraft(p)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-emerald-50">
                          {/* Miniatura del plato: en una lista de coincidencias
                              parecidas, la foto desambigua más rápido que el texto. */}
                          {(p as any).image_url ? (
                            <img src={(p as any).image_url} alt="" loading="lazy"
                              className="w-9 h-9 rounded-lg object-cover shrink-0 bg-gray-50"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          ) : null}
                          <span className="flex-1 min-w-0 text-sm font-bold text-gray-800 truncate">{p.name}</span>
                          <span className="text-sm font-black text-emerald-600 shrink-0">{money(p.unit_price)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {draft.length > 0 && (
                  <ul className="mt-2 divide-y divide-gray-100 border border-emerald-200 bg-emerald-50/40 rounded-xl overflow-hidden">
                    {draft.map((d, i) => (
                      <li key={i} className="flex items-center gap-2 px-3 py-2">
                        <span className="flex-1 min-w-0 text-sm font-bold text-gray-800 truncate">{d.product_name}</span>
                        <input type="number" min={0.001} step="any" value={d.quantity}
                          onChange={e => setDraftQty(i, Number(e.target.value) || 0)}
                          className="w-16 text-center text-sm border border-gray-200 rounded px-1 py-0.5" />
                        <span className="text-sm font-black text-gray-800 tabular-nums w-24 text-right">{money(d.subtotal)}</span>
                        <button onClick={() => setDraft(prev => prev.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                      </li>
                    ))}
                  </ul>
                )}

                {draft.length > 0 && (
                  <button onClick={sendRound} disabled={busy}
                    className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm disabled:opacity-60">
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                    Enviar ronda · {money(draftTotal)}
                  </button>
                )}
              </div>

              {/* Mover a otra mesa */}
              {moving && order && (
                <div className="border border-indigo-200 bg-indigo-50/40 rounded-xl p-3">
                  <p className="text-xs font-black text-indigo-800 mb-2">Mover la cuenta a…</p>
                  <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                    {otherTables.map(t => (
                      <button key={t.id} onClick={() => moveTo(t.id, t.label)} disabled={busy}
                        className="px-2 py-1.5 rounded-lg border border-indigo-200 bg-white text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-40">
                        {t.label}
                      </button>
                    ))}
                    {otherTables.length === 0 && <p className="col-span-3 text-xs text-gray-400 py-2 text-center">No hay otras mesas.</p>}
                  </div>
                </div>
              )}

              {assigning && order && (
                <div className="border border-teal-200 bg-teal-50/40 rounded-xl p-3">
                  <p className="text-xs font-black text-teal-800 mb-2">Pasar la cuenta a…</p>
                  {staff.length === 0 ? (
                    <p className="text-xs text-gray-400 py-2 text-center">Cargando usuarios…</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                      {staff.map(u => (
                        <button key={u.id} onClick={() => assignTo(u.id)} disabled={busy}
                          className={`px-2 py-1.5 rounded-lg border text-xs font-bold truncate disabled:opacity-40 ${
                            (order as any).waiter_id === u.id
                              ? 'border-teal-400 bg-teal-100 text-teal-900'
                              : 'border-teal-200 bg-white text-teal-700 hover:bg-teal-100'
                          }`}>
                          {u.full_name || u.email}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-gray-500 mt-2">
                    Cambia quién responde por la mesa. Queda registrado quién la abrió.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-gray-500">Total consumido</span>
            <span className="text-2xl font-black text-gray-900 tabular-nums">{money(order?.total ?? 0)}</span>
          </div>
          <div className="flex items-center gap-2">
            {order && (
              <>
                <button onClick={() => setMoving(m => !m)} disabled={busy}
                  className="px-3 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-black hover:bg-indigo-100 disabled:opacity-40"
                  title="Mover esta cuenta a otra mesa">
                  <ArrowRightLeft size={14} />
                </button>
                {/* Cambio de turno: la cuenta pasa a otro mesero sin cerrarse. */}
                <button onClick={() => setAssigning(a => !a)} disabled={busy}
                  className="px-3 py-2.5 rounded-xl border border-teal-200 bg-teal-50 text-teal-700 text-xs font-black hover:bg-teal-100 disabled:opacity-40"
                  title="Cambiar el mesero responsable">
                  <UserCog size={14} />
                </button>
                <button onClick={cancelOrder} disabled={busy}
                  className="px-3 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-black hover:bg-red-100 disabled:opacity-40"
                  title="Anular la cuenta sin cobrar">
                  <Ban size={14} />
                </button>
              </>
            )}
            <button onClick={charge} disabled={busy || !order || (order?.items.length ?? 0) === 0}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400">
              <CreditCard size={16} /> Cobrar en el POS
            </button>
          </div>
        </div>
      </div>

      {modFor && (
        <ModifierPickerModal
          product={modFor.product as any}
          groups={modFor.groups}
          basePrice={Number(modFor.product.unit_price ?? 0)}
          onConfirm={(mods, qty, _extra, note) => addWithModifiers(modFor.product, mods, qty, note)}
          onClose={() => setModFor(null)}
        />
      )}
    </div>
  );
};

export default TableOrderPanel;
