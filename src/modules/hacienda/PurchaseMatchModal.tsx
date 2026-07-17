'use client';

import React, { useEffect, useState } from 'react';
import { X, Loader2, ShoppingCart, Info, CheckCircle2, Plus, Ban, AlertTriangle, Link2, Search } from 'lucide-react';
import { haciendaService, type ReceivedMatch } from '@/services/hacienda/haciendaService';
import { apiFetch } from '@/lib/api';

interface PickProduct { id: string; name: string; sku?: string | null; cabys_code?: string | null }

const fmt = (n: number) => `₡${Number(n ?? 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Action = 'update' | 'create' | 'skip';
interface Row {
  detail: string; quantity: number; unit_price: number; total: number;
  cabys?: string | null; code?: string | null; product_id: string | null; product_name: string | null; exists: boolean;
  matched_by?: 'cabys' | 'name' | null;
  action: Action;
}

interface Props {
  receivedId: string;
  onClose: () => void;
  onDone: () => void;
}

export const PurchaseMatchModal: React.FC<Props> = ({ receivedId, onClose, onDone }) => {
  const [data, setData] = useState<ReceivedMatch | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [orderId, setOrderId] = useState<string>('new');   // 'new' o id de una orden existente
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<string[] | null>(null);
  const [noInventory, setNoInventory] = useState(false);   // no afectar stock del inventario
  // Picker para relacionar una línea NUEVA con un producto existente.
  const [products, setProducts] = useState<PickProduct[]>([]);
  const [linkIdx, setLinkIdx] = useState<number | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    apiFetch<PickProduct[]>('/products').then(p => setProducts(p ?? [])).catch(() => {});
  }, []);

  // Relacionar la línea `i` con un producto existente → pasa a "actualizar".
  const linkProduct = (i: number, p: PickProduct) => {
    setRows(prev => prev.map((r, idx) => idx === i
      ? { ...r, exists: true, action: 'update', product_id: p.id, product_name: p.name, matched_by: 'name' as const }
      : r));
    setLinkIdx(null); setQ('');
  };
  // Deshacer la relación manual → vuelve a crearse como nuevo.
  const unlinkProduct = (i: number) => setRows(prev => prev.map((r, idx) => idx === i
    ? { ...r, exists: false, action: 'create', product_id: null, product_name: null, matched_by: null }
    : r));

  const pickResults = (() => {
    const s = q.trim().toLowerCase();
    if (!s) return products.slice(0, 8);
    return products.filter(p => `${p.name} ${p.sku ?? ''} ${p.cabys_code ?? ''}`.toLowerCase().includes(s)).slice(0, 8);
  })();

  useEffect(() => {
    setLoading(true); setErr('');
    haciendaService.matchReceived(receivedId)
      .then(d => {
        setData(d);
        setRows(d.lines.map(l => ({ ...l, action: l.exists ? 'update' : 'create' as Action })));
        if (d.linked_purchase_id) setOrderId(d.linked_purchase_id);
      })
      .catch(e => setErr(e instanceof Error ? e.message : 'Error al cargar'))
      .finally(() => setLoading(false));
  }, [receivedId]);

  const setAction = (i: number, action: Action) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, action } : r));

  const missingCount = rows.filter(r => !r.exists && r.action === 'create').length;
  const updateCount = rows.filter(r => r.exists && r.action === 'update').length;
  const createCount = rows.filter(r => r.action === 'create').length;
  const total = rows.filter(r => r.action !== 'skip').reduce((s, r) => s + r.quantity * r.unit_price, 0);

  const accept = async () => {
    if (!data) return;
    setSaving(true); setErr('');
    try {
      const res = await haciendaService.reconcileReceived({
        id: data.id,
        purchase_id: orderId === 'new' ? null : orderId,
        no_inventory: noInventory,
        items: rows.map(r => ({
          detail: r.detail, quantity: r.quantity, unit_price: r.unit_price,
          cabys: r.cabys ?? null, product_id: r.product_id, action: r.action,
        })),
      });
      setResult(res.messages ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo procesar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-black text-gray-900 flex items-center gap-2 text-lg">
            <ShoppingCart size={20} className="text-blue-600" /> Relacionar con orden de compra
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2"><Loader2 className="animate-spin" size={18} /> Cargando…</div>
        ) : err && !result ? (
          <div className="p-5"><div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">{err}</div></div>
        ) : result ? (
          // ── Resultado de la conciliación ──
          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="flex items-center gap-2 text-emerald-700 font-black"><CheckCircle2 size={20} /> Compra procesada</div>
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-1.5">
              {result.length === 0 ? <p className="text-sm text-gray-500">Sin cambios.</p> :
                result.map((m, i) => (
                  <p key={i} className="text-sm text-gray-700 flex items-start gap-2"><Info size={14} className="text-blue-500 mt-0.5 shrink-0" /> {m}</p>
                ))}
            </div>
            <button onClick={onDone} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-sm">Listo</button>
          </div>
        ) : data && (
          <>
            <div className="px-5 py-3 border-b border-gray-100 shrink-0 space-y-3">
              <div className="text-sm text-gray-600">
                Proveedor: <b className="text-gray-900">{data.issuer_name ?? '—'}</b> · {data.lines.length} artículo(s) · Total {fmt(data.total)}
              </div>
              {/* Selección de orden de compra */}
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase mb-1">Orden de compra</label>
                <select value={orderId} onChange={e => setOrderId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="new">➕ Crear nueva orden de compra</option>
                  {data.orders.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.purchase_number} · {String(o.purchase_date).slice(0, 10)} · {fmt(o.total_amount)} ({o.status})
                    </option>
                  ))}
                </select>
                {data.orders.length === 0 && (
                  <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                    <Info size={11} /> Este proveedor no tiene órdenes pendientes; se creará una nueva.
                  </p>
                )}
              </div>
              {/* Aviso de items faltantes */}
              {missingCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
                  <AlertTriangle size={14} /> {missingCount} artículo(s) nuevo(s) — se crearán al <b>ACEPTAR el comprobante en Hacienda</b> (con su CABYS y precio).
                </div>
              )}
            </div>

            {/* Tabla de líneas */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 font-black uppercase border-b border-gray-100">
                  <tr>
                    <th className="text-left py-2">Artículo</th>
                    <th className="text-left py-2 pl-3">Código</th>
                    <th className="text-right py-2">Cant.</th>
                    <th className="text-right py-2">P. Unit.</th>
                    <th className="text-left py-2 pl-3">CABYS</th>
                    <th className="text-center py-2">Estado / Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2 pr-2">
                        <div className="font-semibold text-gray-800">{r.detail}</div>
                        {r.exists ? (
                          <div className="text-[11px] text-emerald-600 flex items-center gap-1 flex-wrap">
                            ↳ {r.product_name}
                            <span className="px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase">
                              {r.matched_by === 'cabys' ? 'coincide código' : 'coincide nombre'}
                            </span>
                            {r.matched_by === 'name' && r.cabys && (
                              <span className="text-[10px] text-indigo-600" title="Se guardará este CABYS en el producto para que la próxima coincida por código">
                                CABYS ← {r.cabys}
                              </span>
                            )}
                            <button onClick={() => unlinkProduct(i)} className="text-[10px] text-gray-400 hover:text-red-500 underline">desvincular</button>
                          </div>
                        ) : (
                          <div className="text-[11px] flex items-center gap-2 flex-wrap">
                            <span className="text-blue-600 flex items-center gap-1"><Plus size={10} /> se crea como nuevo</span>
                            <button onClick={() => { setLinkIdx(linkIdx === i ? null : i); setQ(''); }}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 border border-indigo-200 rounded px-1.5 py-0.5 hover:bg-indigo-50">
                              <Link2 size={11} /> Relacionar con existente
                            </button>
                          </div>
                        )}
                        {/* Picker de producto existente */}
                        {linkIdx === i && (
                          <div className="mt-1.5 border border-indigo-200 rounded-lg bg-indigo-50/40 p-2 w-72">
                            <div className="relative mb-1">
                              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto…"
                                className="w-full pl-7 pr-2 py-1 text-xs border border-gray-200 rounded-md" />
                            </div>
                            <div className="max-h-40 overflow-y-auto divide-y divide-gray-100">
                              {pickResults.length === 0 ? (
                                <p className="text-[11px] text-gray-400 py-2 text-center">Sin resultados</p>
                              ) : pickResults.map(p => (
                                <button key={p.id} onClick={() => linkProduct(i, p)}
                                  className="w-full text-left px-2 py-1.5 hover:bg-white rounded">
                                  <div className="text-xs font-bold text-gray-800 truncate">{p.name}</div>
                                  <div className="text-[10px] text-gray-400">{p.sku ?? ''} {p.cabys_code ? `· CABYS ${p.cabys_code}` : ''}</div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-2 pl-3 font-mono text-[11px] text-gray-600">{r.code ?? '—'}</td>
                      <td className="py-2 text-right text-gray-600">{r.quantity}</td>
                      <td className="py-2 text-right text-gray-600">{fmt(r.unit_price)}</td>
                      <td className="py-2 pl-3 text-gray-400 font-mono text-[11px]">{r.cabys ?? '—'}</td>
                      <td className="py-2">
                        <div className="flex items-center justify-center gap-1">
                          {r.exists ? (
                            <button onClick={() => setAction(i, r.action === 'update' ? 'skip' : 'update')}
                              className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border ${r.action === 'update' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-400'}`}>
                              <CheckCircle2 size={12} /> {r.action === 'update' ? 'Actualizar CABYS/precio' : 'Existe (omitir)'}
                            </button>
                          ) : (
                            <button onClick={() => setAction(i, r.action === 'create' ? 'skip' : 'create')}
                              className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border ${r.action === 'create' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-400'}`}>
                              <Plus size={12} /> {r.action === 'create' ? 'Crear al aceptar' : 'No agregar'}
                            </button>
                          )}
                          {r.action !== 'skip' && (
                            <button onClick={() => setAction(i, 'skip')} title="Omitir esta línea"
                              className="text-gray-300 hover:text-red-500"><Ban size={14} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-100 shrink-0">
              {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">{err}</div>}
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input type="checkbox" checked={noInventory} onChange={e => setNoInventory(e.target.checked)} className="w-4 h-4 rounded" />
                <span className="text-sm font-bold text-gray-700">No añadir al inventario</span>
                <span className="text-xs text-gray-400">(los productos no afectan el stock)</span>
              </label>
              <div className="mb-2 text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-black text-gray-800">Total a registrar: {fmt(total)}</span>
                {updateCount > 0 && <span className="text-emerald-700">✏️ {updateCount} coincide(n) → actualiza CABYS/precio</span>}
                {createCount > 0 && <span className="text-blue-700">➕ {createCount} nuevo(s) → se crea(n)</span>}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-500 mr-auto">Se registrará en la orden de compra</div>
                <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm">Cancelar</button>
                <button onClick={accept} disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold text-sm flex items-center gap-2">
                  {saving ? <><Loader2 size={15} className="animate-spin" /> Procesando…</>
                    : (data?.linked_purchase_id && orderId === data.linked_purchase_id)
                      ? <>🔄 Recargar orden de compra</>
                      : <>Aceptar y agregar a compras</>}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PurchaseMatchModal;
