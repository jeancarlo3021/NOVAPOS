import React, { useCallback, useEffect, useState } from 'react';
import {
  Truck, Search, Loader2, AlertCircle, CheckCircle2, X, PackageX, Check,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { returnsService, type SupplierReturn } from '@/services/returns/returnsService';

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const fdate = (s?: string | null) => s ? new Date(s).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }) : '';
const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;

interface PurchaseLite {
  id: string; purchase_number: string; total_amount: number;
  purchase_date?: string; status?: string;
  supplier?: { id: string; name: string } | null;
}

interface Line {
  product_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  already_returned: number;
  returnable: number;
  qty: number;
}

/**
 * Devoluciones AL PROVEEDOR.
 *
 * Se le devuelve mercadería (llegó dañada, vencida, o no era lo pedido). La
 * mercadería SALE del inventario y queda un saldo a favor hasta que el proveedor
 * lo reconozca — por eso las devoluciones nacen "pendientes" y se saldan aparte.
 */
export const SupplierReturns: React.FC = () => {
  const [tab, setTab] = useState<'new' | 'history'>('new');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [q, setQ] = useState('');
  const [purchases, setPurchases] = useState<PurchaseLite[]>([]);
  const [searching, setSearching] = useState(false);

  const [purchase, setPurchase] = useState<any | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState<'credit_note' | 'refund' | 'replacement'>('credit_note');
  const [saving, setSaving] = useState(false);

  const [history, setHistory] = useState<SupplierReturn[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.kind === 'ok' ? 5000 : 8000);
    return () => clearTimeout(t);
  }, [msg]);

  const loadHistory = useCallback(async () => {
    setLoadingHist(true);
    try { setHistory(await returnsService.listSupplier()); }
    catch (e) { setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo cargar' }); }
    finally { setLoadingHist(false); }
  }, []);
  useEffect(() => { if (tab === 'history') void loadHistory(); }, [tab, loadHistory]);

  const search = async () => {
    setSearching(true); setMsg(null);
    try {
      const r = await apiFetch<any>('/purchases');
      const all: PurchaseLite[] = Array.isArray(r) ? r : (r?.purchases ?? r?.data ?? []);
      const t = q.trim().toLowerCase();
      setPurchases(t
        ? all.filter(p => `${p.purchase_number} ${p.supplier?.name ?? ''}`.toLowerCase().includes(t)).slice(0, 20)
        : all.slice(0, 20));
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudieron cargar las compras' });
    } finally { setSearching(false); }
  };
  useEffect(() => { void search(); /* carga inicial */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (p: PurchaseLite) => {
    setMsg(null);
    try {
      const full = await returnsService.purchaseForReturn(p.id);
      setPurchase(full);
      setLines((full.items ?? []).map((it: any) => ({
        product_id: it.product_id ?? null,
        product_name: it.product_name ?? 'Producto',
        quantity: Number(it.quantity ?? 0),
        unit_price: Number(it.unit_price ?? 0),
        already_returned: Number(it.already_returned ?? 0),
        returnable: Number(it.returnable ?? 0),
        qty: 0,
      })));
      setPurchases([]);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo abrir la compra' });
    }
  };

  const setQty = (i: number, v: number) =>
    setLines(prev => prev.map((l, j) => j === i
      ? { ...l, qty: Math.max(0, Math.min(l.returnable, v)) } : l));

  const selected = lines.filter(l => l.qty > 0);
  const total = round2(selected.reduce((s, l) => s + l.qty * l.unit_price, 0));

  const save = async () => {
    if (selected.length === 0) { setMsg({ kind: 'err', text: 'Elegí qué se devuelve y cuánto.' }); return; }
    setSaving(true); setMsg(null);
    try {
      const r = await returnsService.createSupplier({
        purchase_id: purchase?.id ?? null,
        purchase_number: purchase?.purchase_number ?? null,
        supplier_id: purchase?.supplier?.id ?? purchase?.supplier_id ?? null,
        supplier_name: purchase?.supplier?.name ?? null,
        reason: reason.trim() || null,
        resolution,
        items: selected.map(l => ({
          product_id: l.product_id ?? null,
          product_name: l.product_name,
          quantity: l.qty,
          unit_cost: l.unit_price,
          subtotal: round2(l.qty * l.unit_price),
        })),
      });
      setPurchase(null); setLines([]); setReason(''); setResolution('credit_note');
      const warn = (r as any).warnings?.length ? ` · ${(r as any).warnings.join(' ')}` : '';
      setMsg({ kind: 'ok', text: `Devolución ${r.number ?? ''} registrada por ${money(r.total)}. El stock ya salió del inventario.${warn}` });
      void search();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo registrar' });
    } finally { setSaving(false); }
  };

  const settle = async (r: SupplierReturn) => {
    if (!window.confirm(`¿Marcar la devolución ${r.number} como saldada?\n\nUsalo cuando el proveedor ya reconoció la nota de crédito o devolvió el dinero.`)) return;
    try { await returnsService.settleSupplier(r.id); await loadHistory(); }
    catch (e) { setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo saldar' }); }
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Truck size={26} className="text-amber-600" /> Devoluciones al proveedor
        </h1>
        <p className="text-gray-600 text-sm">
          Mercadería que se le devuelve al proveedor: llegó dañada, vencida o no era lo pedido.
        </p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('new')}
          className={`px-4 py-2 rounded-xl text-sm font-black transition ${
            tab === 'new' ? 'bg-amber-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          Nueva devolución
        </button>
        <button onClick={() => setTab('history')}
          className={`px-4 py-2 rounded-xl text-sm font-black transition ${
            tab === 'history' ? 'bg-amber-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          Historial
        </button>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
          msg.kind === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                            : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.kind === 'ok' ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
          <span>{msg.text}</span>
        </div>
      )}

      {tab === 'history' ? (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {loadingHist ? (
            <div className="flex items-center justify-center py-12 text-gray-400 gap-2"><Loader2 size={18} className="animate-spin" /> Cargando…</div>
          ) : history.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-12">Sin devoluciones a proveedores.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase">
                  <tr>
                    <th className="text-left px-5 py-2.5">N°</th>
                    <th className="text-left px-4 py-2.5">Fecha</th>
                    <th className="text-left px-4 py-2.5">Proveedor</th>
                    <th className="text-left px-4 py-2.5">Compra</th>
                    <th className="text-left px-4 py-2.5">Resolución</th>
                    <th className="text-right px-4 py-2.5">Total</th>
                    <th className="text-center px-5 py-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {history.map(r => (
                    <tr key={r.id}>
                      <td className="px-5 py-3 font-black text-gray-800">{r.number}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fdate(r.created_at)}</td>
                      <td className="px-4 py-3">{r.supplier_name ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.purchase_number ?? '—'}</td>
                      <td className="px-4 py-3 text-xs">
                        {r.resolution === 'credit_note' ? 'Nota de crédito'
                          : r.resolution === 'refund' ? 'Devuelve el dinero' : 'Repone mercadería'}
                      </td>
                      <td className="px-4 py-3 text-right font-black tabular-nums">{money(r.total)}</td>
                      <td className="px-5 py-3 text-center">
                        {r.status === 'settled' ? (
                          <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Saldada</span>
                        ) : (
                          <button onClick={() => settle(r)}
                            className="inline-flex items-center gap-1 text-[11px] font-black px-2 py-1 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200">
                            <Check size={12} /> Marcar saldada
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : !purchase ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 max-w-2xl">
          <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">Elegí la compra</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={e => setQ(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void search(); }}
                placeholder="N° de compra o proveedor…"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-amber-400" />
            </div>
            <button onClick={search} disabled={searching}
              className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-black disabled:opacity-60">
              {searching ? <Loader2 size={15} className="animate-spin" /> : 'Buscar'}
            </button>
          </div>

          {purchases.length > 0 && (
            <ul className="mt-3 divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
              {purchases.map(p => (
                <li key={p.id}>
                  <button onClick={() => pick(p)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-amber-50">
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-gray-800">{p.purchase_number}</span>
                      <span className="block text-xs text-gray-400">
                        {p.purchase_date?.slice(0, 10) ?? ''} · {p.supplier?.name ?? 'Sin proveedor'}
                      </span>
                    </span>
                    <span className="font-black tabular-nums shrink-0">{money(p.total_amount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!searching && purchases.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-6">Sin compras que coincidan.</p>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden max-w-4xl">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div>
              <p className="font-black text-gray-900">Compra {purchase.purchase_number}</p>
              <p className="text-xs text-gray-500">
                {purchase.purchase_date?.slice(0, 10) ?? ''} · {purchase.supplier?.name ?? 'Sin proveedor'} · {money(purchase.total_amount)}
              </p>
            </div>
            <button onClick={() => { setPurchase(null); setLines([]); }} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>

          <div className="px-5 py-3">
            {lines.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-6">
                Esta compra no tiene líneas registradas.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 text-[11px] uppercase text-gray-500 font-bold">
                  <tr>
                    <th className="text-left py-2">Producto</th>
                    <th className="text-center py-2 w-24">Comprado</th>
                    <th className="text-center py-2 w-24">Ya devuelto</th>
                    <th className="text-center py-2 w-32">Devolver</th>
                    <th className="text-right py-2 w-28">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lines.map((l, i) => (
                    <tr key={i} className={l.returnable === 0 ? 'opacity-40' : ''}>
                      <td className="py-2 font-bold text-gray-800">{l.product_name}</td>
                      <td className="py-2 text-center tabular-nums">{l.quantity}</td>
                      <td className="py-2 text-center tabular-nums text-gray-400">{l.already_returned || '—'}</td>
                      <td className="py-2 text-center">
                        <input type="number" min={0} max={l.returnable} step="any" value={l.qty}
                          disabled={l.returnable === 0}
                          onChange={e => setQty(i, Number(e.target.value) || 0)}
                          onFocus={e => e.currentTarget.select()}
                          className="w-24 text-center text-base font-bold border border-gray-200 rounded-lg px-1 py-1.5 disabled:bg-gray-50" />
                        <span className="block text-[10px] text-gray-400 mt-0.5">máx {l.returnable}</span>
                      </td>
                      <td className="py-2 text-right font-black tabular-nums">
                        {l.qty > 0 ? money(l.qty * l.unit_price) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="px-5 pb-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">Qué da el proveedor</label>
                <select value={resolution} onChange={e => setResolution(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:border-amber-400">
                  <option value="credit_note">Nota de crédito</option>
                  <option value="refund">Devuelve el dinero</option>
                  <option value="replacement">Repone la mercadería</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">Motivo</label>
                <input value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="Ej. llegó vencido, producto dañado…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-amber-400" />
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2 flex items-start gap-2">
              <PackageX size={14} className="shrink-0 mt-0.5" />
              <span>
                Al registrarla, la mercadería <b>sale del inventario</b> y la devolución queda
                <b> pendiente</b> hasta que el proveedor la reconozca (se marca saldada en el historial).
              </span>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
              <div className="ml-auto text-right">
                <p className="text-[11px] font-bold text-gray-400 uppercase leading-none">A devolver</p>
                <p className="text-3xl font-black tabular-nums">{money(total)}</p>
              </div>
              <button onClick={save} disabled={saving || selected.length === 0}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black disabled:bg-gray-200 disabled:text-gray-400">
                {saving ? <Loader2 size={17} className="animate-spin" /> : <Truck size={17} />}
                Registrar devolución
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierReturns;
