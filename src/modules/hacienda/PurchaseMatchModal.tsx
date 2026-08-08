'use client';

import React, { useEffect, useState } from 'react';
import { X, Loader2, ShoppingCart, Info, CheckCircle2, Plus, Ban, AlertTriangle, Link2, Search } from 'lucide-react';
import { haciendaService, type ReceivedMatch } from '@/services/hacienda/haciendaService';
import { apiFetch } from '@/lib/api';
import { BULK_CHUNK_SIZE } from '@/utils/bulkChunks';

interface PickProduct { id: string; name: string; sku?: string | null; cabys_code?: string | null }

const fmt = (n: number) => `₡${Number(n ?? 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Algunos proveedores meten datos internos en el <Detalle> tras un ';' (ej.
// "Casco X L;32100.98;24;;P001688;..."), y otros anteponen su código entre
// corchetes ("[MXP39] PIÑON TRASERO XL125 38T"). Nos quedamos con el nombre real:
// el código ya se guarda aparte como SKU y en el nombre solo estorba.
//
// Se limpia también acá (además del backend) para que no dependa del deploy del
// server, y para que la vista previa muestre el nombre que va a quedar de verdad.
const SUPPLIER_CODE_PREFIX = /^\[[A-Za-z0-9][A-Za-z0-9._/+-]*\]\s*/;

const cleanName = (s: any): string => {
  const str = String(s ?? '').trim();
  const m = str.match(/^(.*?);\s*\d/);
  const base = (m ? m[1] : str).trim();
  const stripped = base.replace(SUPPLIER_CODE_PREFIX, '').trim();
  return stripped || base;
};

type Action = 'update' | 'create' | 'skip';
interface Row {
  detail: string; quantity: number; unit_price: number; total: number;
  cabys?: string | null; code?: string | null; product_id: string | null; product_name: string | null; exists: boolean;
  matched_by?: 'cabys' | 'sku' | 'name' | null;
  /** El producto que coincidió NO lleva control de stock (infinito). Lo informa el backend. */
  infinite?: boolean;
  /** Para líneas NUEVAS: crear el producto sin control de stock (infinito). */
  noStock?: boolean;
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
  /** Avance de la carga por lotes (null = una sola llamada, sin lotes). */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<string[] | null>(null);
  const [noInventory, setNoInventory] = useState(false);   // no afectar stock del inventario
  // Compra que NO genera productos de catálogo: insumos de proceso, materia prima,
  // empaques… todo lo que se compra pero no se vende en tienda. Pone todas las
  // líneas nuevas en "No agregar" de una sola vez.
  const [noProducts, setNoProducts] = useState(false);
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
        setRows(d.lines.map(l => ({ ...l, action: l.exists ? 'update' : 'create' as Action, noStock: false })));
        if (d.linked_purchase_id) setOrderId(d.linked_purchase_id);
      })
      .catch(e => setErr(e instanceof Error ? e.message : 'Error al cargar'))
      .finally(() => setLoading(false));
  }, [receivedId]);

  const setAction = (i: number, action: Action) => {
    // Si se pide crear una línea a mano, el interruptor global deja de aplicar
    // (si no, quedaba prendido diciendo lo contrario de lo que va a pasar).
    if (action === 'create') setNoProducts(false);
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, action } : r));
  };

  // Interruptor global. Solo toca las líneas NUEVAS: las que ya se relacionaron con
  // un producto existente siguen actualizándose (precio/CABYS) como corresponde.
  const toggleNoProducts = () => {
    const next = !noProducts;
    setNoProducts(next);
    setRows(prev => prev.map(r => r.exists ? r : { ...r, action: next ? 'skip' : 'create' }));
  };

  const missingCount = rows.filter(r => !r.exists && r.action === 'create').length;
  const updateCount = rows.filter(r => r.exists && r.action === 'update').length;
  const createCount = rows.filter(r => r.action === 'create').length;
  // Precio unitario CONFIABLE: el XML a veces trae un PrecioUnitario que no cuadra
  // con el total de la línea (o con muchos decimales). Si no cuadra, usamos total÷cant.
  const effUnit = (r: Row) => {
    const consistent = r.unit_price > 0 && r.total > 0 && Math.abs(r.unit_price * r.quantity - r.total) <= Math.max(1, r.total * 0.02);
    const v = consistent ? r.unit_price : (r.total > 0 && r.quantity > 0 ? r.total / r.quantity : r.unit_price);
    return Math.round(v * 100) / 100;
  };
  // Total a registrar = suma de los TOTALES de línea del XML (no qty×precio).
  // Cuentan TODAS las líneas, incluidas las que no crean producto: el dinero se
  // gastó igual y tiene que quedar en la orden de compra.
  const total = rows.reduce((s, r) => s + (Number(r.total) || r.quantity * effUnit(r)), 0);
  // Monto que se registra sin generar producto de catálogo.
  const skippedTotal = rows.filter(r => r.action === 'skip')
    .reduce((s, r) => s + (Number(r.total) || r.quantity * effUnit(r)), 0);

  const accept = async () => {
    if (!data) return;
    setSaving(true); setErr(''); setProgress(null);
    try {
      // Por lotes: con comprobantes de cientos de líneas, mandarlas todas en una
      // sola petición se pasaba del tiempo máximo y fallaba a medio camino.
      const res = await haciendaService.reconcileReceivedInBatches({
        id: data.id,
        purchase_id: orderId === 'new' ? null : orderId,
        no_inventory: noInventory,
        no_products: noProducts,
        items: rows.map(r => ({
          detail: cleanName(r.detail), quantity: r.quantity, unit_price: effUnit(r), total: r.total,
          cabys: r.cabys ?? null, product_id: r.product_id, action: r.action,
          no_stock: r.noStock ?? noInventory,
        })),
      }, (done, total) => setProgress({ done, total }));
      setResult(res.messages ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo procesar');
    } finally {
      setSaving(false);
      setProgress(null);
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
              {/* Selector: esta compra no genera productos de catálogo */}
              <button
                type="button"
                onClick={toggleNoProducts}
                className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                  noProducts
                    ? 'border-purple-300 bg-purple-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <span className={`shrink-0 w-9 h-5 rounded-full p-0.5 transition ${noProducts ? 'bg-purple-500' : 'bg-gray-300'}`}>
                  <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform ${noProducts ? 'translate-x-4' : 'translate-x-0'}`} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-xs font-black ${noProducts ? 'text-purple-800' : 'text-gray-700'}`}>
                    No crear productos con esta compra
                  </span>
                  <span className="block text-[11px] text-gray-500">
                    Para insumos de proceso, materia prima o empaques que no se venden en tienda.
                    Las líneas ya relacionadas con un producto sí actualizan precio y CABYS.
                  </span>
                </span>
              </button>

              {/* Aviso de items faltantes */}
              {missingCount > 0 && !noProducts && (
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
                        <div className="font-semibold text-gray-800">{cleanName(r.detail)}</div>
                        {r.exists ? (
                          <div className="text-[11px] text-emerald-600 flex items-center gap-1 flex-wrap">
                            ↳ {r.product_name}
                            <span className="px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase">
                              {r.matched_by === 'cabys' ? 'coincide CABYS' : r.matched_by === 'sku' ? 'coincide código' : 'coincide nombre'}
                            </span>
                            {r.matched_by === 'name' && r.cabys && (
                              <span className="text-[10px] text-indigo-600" title="Se guardará este CABYS en el producto para que la próxima coincida por código">
                                CABYS ← {r.cabys}
                              </span>
                            )}
                            {r.infinite && (
                              <span className="px-1 py-0.5 rounded bg-blue-100 text-blue-700 text-[9px] font-black"
                                title="Este producto no lleva control de stock. La compra registra el monto pero NO le toca las existencias — sigue infinito.">
                                ∞ SIN STOCK
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
                            {r.action === 'create' && (
                              <button
                                onClick={() => setRows(prev => prev.map((x, idx) => idx === i ? { ...x, noStock: !(x.noStock ?? noInventory) } : x))}
                                title="Crear el producto SIN control de stock (infinito): no se le llevan existencias ni entra en órdenes de reposición."
                                className={`inline-flex items-center gap-1 text-[10px] font-bold rounded px-1.5 py-0.5 border ${
                                  (r.noStock ?? noInventory)
                                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                                    : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                                }`}>
                                ∞ {(r.noStock ?? noInventory) ? 'Sin stock' : 'Con stock'}
                              </button>
                            )}
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
                      <td className="py-2 text-right text-gray-600">{fmt(effUnit(r))}</td>
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
                {skippedTotal > 0 && (
                  <span className="text-purple-700">📦 {fmt(skippedTotal)} sin crear producto</span>
                )}
              </div>
              {/* Avance por lotes: con cientos de líneas el proceso tarda, y sin
                  esto el usuario no sabe si va avanzando o si se colgó. */}
              {saving && progress && progress.total > 0 && (
                <div className="mb-2">
                  <div className="flex justify-between text-xs font-bold text-gray-600 mb-1">
                    <span>Procesando por lotes de {BULK_CHUNK_SIZE}…</span>
                    <span>{progress.done} / {progress.total} líneas</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    No cierres esta ventana: la orden de compra se crea al terminar todos los lotes.
                  </p>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-500 mr-auto">Se registrará en la orden de compra</div>
                <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm">Cancelar</button>
                <button onClick={accept} disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold text-sm flex items-center gap-2">
                  {saving ? <><Loader2 size={15} className="animate-spin" />
                      {progress && progress.total > 0
                        ? `Procesando ${progress.done}/${progress.total}…`
                        : 'Procesando…'}</>
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
