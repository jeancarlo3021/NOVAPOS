'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Plus, RefreshCw, Printer, Trash2, Ban, X, Search, Loader2,
  ShoppingCart, CheckCircle2, User, Calendar, Receipt, Download,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { getAllProducts } from '@/services/Inventory/InventoryProductsService';
import type { Product } from '@/types/Pos.types';
import { POSCustomerSearch } from '@/modules/pos/POSCustomerSearch';
import type { Customer } from '@/services/customers/customersService';
import { proformasService, type Proforma, type ProformaItem } from '@/services/proformas/proformasService';
import { printProforma, printProformaTicket } from './printProforma';
import { downloadProformaPdf } from './downloadProformaPdf';

type Status = 'open' | 'converted' | 'cancelled' | 'all';
const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;
const fmtDate = (d: string | null) => d ? new Date(d + (d.length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('es-CR') : '—';

export const ProformasDashboard: React.FC = () => {
  const { tenantId } = useTenantId();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Proforma[]>([]);
  const [filter, setFilter] = useState<Status>('open');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Proforma> | null>(null);
  const [err, setErr] = useState('');

  const load = async () => {
    try { setRows(await proformasService.list(filter)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { setLoading(true); load(); /* eslint-disable-next-line */ }, [filter]);

  const cancel = async (p: Proforma) => {
    if (!confirm(`¿Anular la proforma ${p.number}?`)) return;
    try { await proformasService.cancel(p.id); await load(); } catch (e) { alert(e instanceof Error ? e.message : 'Error'); }
  };
  const remove = async (p: Proforma) => {
    if (!confirm(`¿Eliminar la proforma ${p.number}?`)) return;
    try { await proformasService.remove(p.id); await load(); } catch (e) { alert(e instanceof Error ? e.message : 'Error'); }
  };
  // Convertir en venta → abre el POS con la proforma cargada (por query param).
  const toSale = (p: Proforma, fe: boolean) => navigate(`${fe ? '/fe-pos' : '/pos'}?proforma=${p.id}`);

  const badge = (s: string) =>
    s === 'converted' ? <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"><CheckCircle2 size={11} /> Convertida</span>
    : s === 'cancelled' ? <span className="text-[11px] font-black text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">Anulada</span>
    : <span className="text-[11px] font-black text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">Abierta</span>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center"><FileText size={22} className="text-white" /></div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Proformas</h1>
            <p className="text-sm text-gray-500">Cotizaciones que podés pasar a venta en el POS.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setLoading(true); load(); }} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"><RefreshCw size={16} /></button>
          <button onClick={() => setEditing({ items: [] })} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm">
            <Plus size={16} /> Nueva proforma
          </button>
        </div>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm">{err}</div>}

      <div className="flex gap-2 flex-wrap">
        {([['open', 'Abiertas'], ['converted', 'Convertidas'], ['cancelled', 'Anuladas'], ['all', 'Todas']] as [Status, string][]).map(([f, l]) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold border-2 transition ${filter === f ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'}`}>{l}</button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="animate-spin mr-2" size={18} /> Cargando…</div>
        ) : rows.length === 0 ? (
          <p className="text-center py-14 text-gray-400 text-sm">Sin proformas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs font-black uppercase">
                <tr>
                  <th className="text-left px-4 py-3">N°</th>
                  <th className="text-left px-4 py-3">Fecha</th>
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-left px-4 py-3">Vence</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 font-mono text-xs font-bold text-gray-700">{p.number}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{fmtDate(p.created_at.slice(0, 10))}</td>
                    <td className="px-4 py-2.5 text-gray-800 max-w-52 truncate">{p.customer_name || 'Cliente de contado'}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{fmtDate(p.valid_until)}</td>
                    <td className="px-4 py-2.5 text-right font-black text-gray-900">{fmt(p.total)}</td>
                    <td className="px-4 py-2.5">{badge(p.status)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {p.status === 'open' && (
                          <>
                            <button onClick={() => toSale(p, false)} title="Pasar a venta (POS)"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-cyan-700 bg-cyan-50 border border-cyan-200 hover:bg-cyan-100"><ShoppingCart size={12} /> POS</button>
                            <button onClick={() => toSale(p, true)} title="Pasar a venta (POS electrónico)"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100">FE</button>
                          </>
                        )}
                        <button onClick={() => downloadProformaPdf(p, tenantId).catch(e => alert(e instanceof Error ? e.message : 'Error al descargar'))} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50" title="Descargar PDF"><Download size={15} /></button>
                        <button onClick={() => printProforma(p, tenantId)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" title="Imprimir en hoja"><Printer size={15} /></button>
                        <button onClick={() => printProformaTicket(p, tenantId ?? '').catch(e => alert(e instanceof Error ? e.message : 'Error al imprimir'))} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" title="Imprimir en ticket (térmica)"><Receipt size={15} /></button>
                        {p.status === 'open' && <button onClick={() => setEditing(p)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" title="Editar">✏️</button>}
                        {p.status === 'open' && <button onClick={() => cancel(p)} className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50" title="Anular"><Ban size={15} /></button>}
                        <button onClick={() => remove(p)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50" title="Eliminar"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ProformaEditor
          tenantId={tenantId}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setLoading(true); load(); }}
        />
      )}
    </div>
  );
};

// ── Editor (crear / editar) ─────────────────────────────────────────────────
const ProformaEditor: React.FC<{
  tenantId: string | null | undefined;
  initial: Partial<Proforma>;
  onClose: () => void;
  onSaved: () => void;
}> = ({ tenantId, initial, onClose, onSaved }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ProformaItem[]>(initial.items ?? []);
  const [customer, setCustomer] = useState<{ id?: string; name?: string; identification?: string | null } | null>(
    initial.customer_name ? { id: initial.customer_id ?? undefined, name: initial.customer_name, identification: initial.customer_identification } : null);
  const [showCust, setShowCust] = useState(false);
  const [validUntil, setValidUntil] = useState(initial.valid_until ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  /** Descuento general del documento, en %. El de cada línea vive en el ítem. */
  const [descPct, setDescPct] = useState<string>(String((initial as any).discount_percent ?? 0) || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { getAllProducts(tenantId).then(p => setProducts(p ?? [])).catch(() => {}); }, [tenantId]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return products.filter(p => p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s)).slice(0, 8);
  }, [q, products]);

  const add = (p: Product) => {
    setItems(prev => {
      const i = prev.findIndex(x => x.product_id === p.id);
      if (i >= 0) { const c = [...prev]; c[i] = { ...c[i], quantity: c[i].quantity + 1 }; return c; }
      return [...prev, {
        product_id: p.id, name: p.name, sku: p.sku ?? null, quantity: 1,
        unit_price: Number(p.unit_price) || 0, iva_rate: Number((p as any).iva_rate ?? 13),
        cabys: (p as any).cabys_code ?? null, unit: (p as any).unit ?? null,
      }];
    });
    setQ('');
  };
  const patch = (idx: number, p: Partial<ProformaItem>) => setItems(prev => prev.map((x, i) => i === idx ? { ...x, ...p } : x));
  const del = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  // Mismo criterio que el servidor: primero el descuento de cada línea, después
  // el general, y el IVA SOBRE LA BASE YA DESCONTADA — cobrar impuesto sobre una
  // plata que el cliente no paga sería cobrarle de más.
  const bruto = items.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const bases = items.map(l => {
    const linea = l.quantity * l.unit_price;
    const pct = Math.min(100, Math.max(0, Number((l as any).discount_percent ?? 0)));
    return { base: linea - linea * (pct / 100), rate: l.iva_rate ?? 0 };
  });
  const netoLineas = bases.reduce((s, b) => s + b.base, 0);
  const gPct = Math.min(100, Math.max(0, parseFloat(descPct) || 0));
  const factor = 1 - gPct / 100;
  const subtotal = netoLineas * factor;
  const tax = bases.reduce((s, b) => s + b.base * factor * ((b.rate ?? 0) / 100), 0);
  const descuentoTotal = bruto - subtotal;

  const save = async () => {
    if (items.length === 0) { setErr('Agregá al menos un producto'); return; }
    setSaving(true); setErr('');
    try {
      const body = {
        customer_id: customer?.id ?? null, customer_name: customer?.name ?? null,
        customer_identification: customer?.identification ?? null,
        items, notes: notes || null, valid_until: validUntil || null,
        discount_percent: parseFloat(descPct) || 0,
      };
      if (initial.id) await proformasService.update(initial.id, body);
      else await proformasService.create(body);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900">{initial.id ? `Editar ${initial.number ?? 'proforma'}` : 'Nueva proforma'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{err}</div>}

          {/* Cliente */}
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCust(true)} className="flex-1 flex items-center gap-2 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm hover:border-blue-300">
              <User size={15} className="text-gray-400" />
              {customer ? <span className="font-bold text-gray-800">{customer.name}{customer.identification ? ` · ${customer.identification}` : ''}</span> : <span className="text-gray-400">Cliente (opcional)</span>}
            </button>
            {customer && <button onClick={() => setCustomer(null)} className="p-2 text-gray-400 hover:text-red-500"><X size={16} /></button>}
          </div>

          {/* Buscar producto */}
          <div className="relative">
            <div className="flex items-center gap-2 border-2 border-gray-200 rounded-xl px-3 py-2.5">
              <Search size={15} className="text-gray-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto para agregar…"
                className="flex-1 text-sm focus:outline-none" />
            </div>
            {results.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                {results.map(p => (
                  <button key={p.id} onClick={() => add(p)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-blue-50 text-sm">
                    <span className="text-gray-800">{p.name}</span>
                    <span className="text-gray-400">{fmt(Number(p.unit_price))}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Items */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            {items.length === 0 ? (
              <p className="text-center py-6 text-gray-400 text-sm">Agregá productos arriba.</p>
            ) : items.map((it, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 border-b border-gray-50 last:border-0">
                <span className="flex-1 text-sm text-gray-800 truncate">{it.name}</span>
                <input type="number" min={0} value={it.quantity} onChange={e => patch(i, { quantity: parseFloat(e.target.value) || 0 })}
                  className="w-16 text-right border rounded-lg px-2 py-1 text-sm" title="Cantidad" />
                <span className="text-gray-300">×</span>
                <input type="number" min={0} value={it.unit_price} onChange={e => patch(i, { unit_price: parseFloat(e.target.value) || 0 })}
                  className="w-24 text-right border rounded-lg px-2 py-1 text-sm" title="Precio" />
                {/* Descuento de la línea: es como se negocia producto por producto. */}
                <span className="flex items-center gap-0.5">
                  <input type="number" min={0} max={100}
                    value={(it as any).discount_percent ?? ''} placeholder="0"
                    onChange={e => patch(i, { discount_percent: parseFloat(e.target.value) || 0 } as any)}
                    className="w-14 text-right border rounded-lg px-2 py-1 text-sm" title="Descuento de esta línea (%)" />
                  <span className="text-gray-400 text-xs">%</span>
                </span>
                <span className="w-24 text-right font-bold text-gray-900 text-sm">
                  {fmt(it.quantity * it.unit_price * (1 - (Number((it as any).discount_percent ?? 0) / 100)))}
                  {Number((it as any).discount_percent ?? 0) > 0 && (
                    <span className="block text-[10px] font-normal text-gray-400 line-through">
                      {fmt(it.quantity * it.unit_price)}
                    </span>
                  )}
                </span>
                <button onClick={() => del(i)} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>

          {/* Totales + descuento general */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="text-xs font-bold text-gray-500 flex flex-col gap-1">
              <span>Descuento general (%)</span>
              <input type="number" min={0} max={100} value={descPct}
                onChange={e => setDescPct(e.target.value)} placeholder="0"
                className="w-28 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-right" />
              <span className="font-normal text-gray-400">Se aplica sobre lo que quede tras los descuentos por línea.</span>
            </label>

            <div className="text-sm space-y-0.5 text-right">
              {descuentoTotal > 0.004 && (
                <>
                  <div className="text-gray-400">Bruto: {fmt(bruto)}</div>
                  <div className="text-emerald-700 font-bold">Descuento: −{fmt(descuentoTotal)}</div>
                </>
              )}
              <div className="text-gray-500">Subtotal: <b className="text-gray-800">{fmt(subtotal)}</b></div>
              <div className="text-gray-500">IVA: <b className="text-gray-800">{fmt(tax)}</b></div>
              <div className="text-lg font-black text-gray-900">Total: {fmt(subtotal + tax)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-gray-500 flex flex-col gap-1">
              <span className="flex items-center gap-1"><Calendar size={12} /> Vigencia</span>
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-bold text-gray-500 flex flex-col gap-1">
              <span>Notas</span>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional" className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </label>
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border-2 border-gray-200 text-gray-600 font-bold text-sm">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:bg-gray-300 flex items-center justify-center gap-2">
            {saving && <Loader2 className="animate-spin" size={15} />} Guardar proforma
          </button>
        </div>
      </div>

      {showCust && (
        // stopPropagation: evita que el clic dentro del buscador burbujee al
        // backdrop del editor (onClose) y cierre el modal al elegir cliente.
        <div onClick={e => e.stopPropagation()}>
          <POSCustomerSearch
            selected={customer as unknown as Customer}
            onPick={(c: Customer | null) => { if (c) setCustomer({ id: c.id, name: c.name, identification: c.identification }); setShowCust(false); }}
            onClose={() => setShowCust(false)}
          />
        </div>
      )}
    </div>
  );
};

export default ProformasDashboard;
