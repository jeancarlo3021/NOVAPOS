import React, { useCallback, useEffect, useState } from 'react';
import {
  Undo2, Search, Loader2, AlertCircle, CheckCircle2, X, Ban, PackageCheck, PackageX,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useCashSession } from '@/hooks/useCashSession';
import { returnsService, type SalesReturn, type ReturnableLine } from '@/services/returns/returnsService';
import { invoicesService } from '@/services/invoice/invoiceService';

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const fdate = (s?: string | null) => s ? new Date(s).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }) : '';
const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;

interface InvoiceLite {
  id: string; invoice_number: string; customer_name?: string | null;
  total: number; issued_at?: string; created_at?: string; status?: string;
  fe_clave?: string | null;
}

/**
 * Devoluciones de venta y anulación de facturas.
 *
 * Dos caminos, según lo que pasó:
 *  · ANULAR    — la venta entera no debió existir. Se cancela la factura y vuelve
 *                todo el stock. Es lo que ya hacía el POS.
 *  · DEVOLVER  — el cliente trae PARTE de lo que compró. La venta sigue válida por
 *                el resto, así que queda un registro propio con lo devuelto.
 */
export const SalesReturns: React.FC = () => {
  const { currentSession } = useCashSession();
  const [tab, setTab] = useState<'new' | 'history'>('new');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Búsqueda de la factura
  const [q, setQ] = useState('');
  const [invoices, setInvoices] = useState<InvoiceLite[]>([]);
  const [searching, setSearching] = useState(false);

  // Devolución en curso
  const [invoice, setInvoice] = useState<any | null>(null);
  const [lines, setLines] = useState<Array<ReturnableLine & { qty: number }>>([]);
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState<'refund' | 'credit' | 'exchange'>('refund');
  const [restock, setRestock] = useState(true);
  const [saving, setSaving] = useState(false);

  const [history, setHistory] = useState<SalesReturn[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.kind === 'ok' ? 5000 : 8000);
    return () => clearTimeout(t);
  }, [msg]);

  const loadHistory = useCallback(async () => {
    setLoadingHist(true);
    try { setHistory(await returnsService.listSales()); }
    catch (e) { setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo cargar' }); }
    finally { setLoadingHist(false); }
  }, []);
  useEffect(() => { if (tab === 'history') void loadHistory(); }, [tab, loadHistory]);

  const search = async () => {
    if (!q.trim()) return;
    setSearching(true); setMsg(null);
    try {
      const r = await apiFetch<any>(`/invoices?search=${encodeURIComponent(q.trim())}&limit=20`);
      setInvoices(Array.isArray(r) ? r : (r?.invoices ?? r?.data ?? []));
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo buscar' });
    } finally { setSearching(false); }
  };

  const pick = async (inv: InvoiceLite) => {
    setMsg(null);
    try {
      const full = await returnsService.invoiceForReturn(inv.id);
      setInvoice(full);
      setLines((full.items ?? []).map((it: ReturnableLine) => ({ ...it, qty: 0 })));
      setInvoices([]); setQ('');
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo abrir la factura' });
    }
  };

  const setQty = (i: number, v: number) => {
    setLines(prev => prev.map((l, j) => j === i
      ? { ...l, qty: Math.max(0, Math.min(l.returnable, v)) } : l));
  };

  const selected = lines.filter(l => l.qty > 0);
  const total = round2(selected.reduce((s, l) => s + l.qty * Number(l.unit_price ?? 0), 0));

  const save = async () => {
    if (selected.length === 0) { setMsg({ kind: 'err', text: 'Elegí qué se devuelve y cuánto.' }); return; }
    setSaving(true); setMsg(null);
    try {
      const r = await returnsService.createSales({
        invoice_id: invoice?.id ?? null,
        invoice_number: invoice?.invoice_number ?? null,
        customer_id: invoice?.customer_id ?? null,
        customer_name: invoice?.customer_name ?? null,
        reason: reason.trim() || null,
        resolution,
        restock,
        // Solo si hay caja abierta: el reintegro sale de ahí y el cierre tiene que cuadrar.
        cash_session_id: resolution === 'refund' ? (currentSession?.id ?? null) : null,
        items: selected.map(l => ({
          product_id: l.product_id ?? null,
          product_name: l.product_name ?? 'Producto',
          quantity: l.qty,
          unit_price: Number(l.unit_price ?? 0),
          subtotal: round2(l.qty * Number(l.unit_price ?? 0)),
        })),
      });
      setInvoice(null); setLines([]); setReason(''); setRestock(true); setResolution('refund');
      const warn = (r as any).warnings?.length ? ` · ${(r as any).warnings.join(' ')}` : '';
      setMsg({ kind: 'ok', text: `Devolución ${r.number ?? ''} registrada por ${money(r.total)}.${warn}` });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo registrar' });
    } finally { setSaving(false); }
  };

  const voidInvoice = async () => {
    if (!invoice) return;
    if (!window.confirm(
      `¿ANULAR la factura ${invoice.invoice_number} completa?\n\n`
      + 'La venta se cancela y vuelve TODO el stock. Si el cliente solo trae parte, '
      + 'usá la devolución parcial en vez de anular.'
    )) return;
    setSaving(true);
    try {
      await invoicesService.cancelInvoice(invoice.id);
      setInvoice(null); setLines([]);
      setMsg({ kind: 'ok', text: `Factura ${invoice.invoice_number} anulada. El stock volvió al inventario.` });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo anular' });
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Undo2 size={26} className="text-rose-600" /> Devoluciones y anulaciones
        </h1>
        <p className="text-gray-600 text-sm">
          El cliente trae mercadería: devolvés solo lo que trajo, o anulás la venta entera.
        </p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('new')}
          className={`px-4 py-2 rounded-xl text-sm font-black transition ${
            tab === 'new' ? 'bg-rose-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          Nueva devolución
        </button>
        <button onClick={() => setTab('history')}
          className={`px-4 py-2 rounded-xl text-sm font-black transition ${
            tab === 'history' ? 'bg-rose-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
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
            <p className="text-center text-sm text-gray-400 py-12">Sin devoluciones registradas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase">
                  <tr>
                    <th className="text-left px-5 py-2.5">N°</th>
                    <th className="text-left px-4 py-2.5">Fecha</th>
                    <th className="text-left px-4 py-2.5">Factura</th>
                    <th className="text-left px-4 py-2.5">Cliente</th>
                    <th className="text-left px-4 py-2.5">Resolución</th>
                    <th className="text-center px-4 py-2.5">Stock</th>
                    <th className="text-right px-5 py-2.5">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {history.map(r => (
                    <tr key={r.id}>
                      <td className="px-5 py-3 font-black text-gray-800">{r.number}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fdate(r.created_at)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.invoice_number ?? '—'}</td>
                      <td className="px-4 py-3">{r.customer_name ?? '—'}</td>
                      <td className="px-4 py-3 text-xs">
                        {r.resolution === 'refund' ? 'Dinero devuelto'
                          : r.resolution === 'credit' ? 'Saldo a favor' : 'Cambio'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.restock
                          ? <span title="Volvió al inventario"><PackageCheck size={15} className="inline text-emerald-600" /></span>
                          : <span title="NO volvió (dañado)"><PackageX size={15} className="inline text-red-500" /></span>}
                      </td>
                      <td className="px-5 py-3 text-right font-black tabular-nums">{money(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : !invoice ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 max-w-2xl">
          <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">Buscar la venta</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={e => setQ(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void search(); }}
                placeholder="N° de factura, cliente o clave…"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-rose-400" />
            </div>
            <button onClick={search} disabled={searching || !q.trim()}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-black disabled:bg-gray-200 disabled:text-gray-400">
              {searching ? <Loader2 size={15} className="animate-spin" /> : 'Buscar'}
            </button>
          </div>

          {invoices.length > 0 && (
            <ul className="mt-3 divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
              {invoices.map(inv => (
                <li key={inv.id}>
                  <button onClick={() => pick(inv)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-rose-50">
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-gray-800">#{inv.invoice_number}</span>
                      <span className="block text-xs text-gray-400">
                        {fdate(inv.issued_at ?? inv.created_at)} · {inv.customer_name ?? 'Sin cliente'}
                        {inv.status === 'cancelled' && <b className="text-red-600"> · ANULADA</b>}
                      </span>
                    </span>
                    <span className="font-black tabular-nums shrink-0">{money(inv.total)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden max-w-4xl">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div>
              <p className="font-black text-gray-900">Factura #{invoice.invoice_number}</p>
              <p className="text-xs text-gray-500">
                {fdate(invoice.issued_at ?? invoice.created_at)} · {invoice.customer_name ?? 'Sin cliente'} · {money(invoice.total)}
                {invoice.fe_clave && <span className="ml-1 text-blue-600 font-bold">· ELECTRÓNICA</span>}
              </p>
            </div>
            <button onClick={() => { setInvoice(null); setLines([]); }} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>

          {invoice.status === 'cancelled' && (
            <div className="mx-5 mt-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-lg px-3 py-2">
              Esta factura ya está anulada.
            </div>
          )}
          {invoice.fe_clave && (
            <div className="mx-5 mt-3 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-lg px-3 py-2">
              Es un comprobante <b>electrónico</b>. Ante Hacienda la devolución se formaliza con una
              <b> nota de crédito</b>, que se emite desde la bitácora FE. Acá queda el registro
              interno y el movimiento de inventario y caja.
            </div>
          )}

          <div className="px-5 py-3">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 text-[11px] uppercase text-gray-500 font-bold">
                <tr>
                  <th className="text-left py-2">Producto</th>
                  <th className="text-center py-2 w-24">Vendido</th>
                  <th className="text-center py-2 w-24">Ya devuelto</th>
                  <th className="text-center py-2 w-32">Devolver</th>
                  <th className="text-right py-2 w-28">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lines.map((l, i) => (
                  <tr key={i} className={l.returnable === 0 ? 'opacity-40' : ''}>
                    <td className="py-2 font-bold text-gray-800">{l.product_name ?? 'Producto'}</td>
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
                      {l.qty > 0 ? money(l.qty * Number(l.unit_price ?? 0)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 pb-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">Qué se hace</label>
                <select value={resolution} onChange={e => setResolution(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:border-rose-400">
                  <option value="refund">Devolver el dinero</option>
                  <option value="credit">Dejarlo a favor del cliente</option>
                  <option value="exchange">Cambio por otro producto</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">Motivo</label>
                <input value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="Ej. producto dañado, talla equivocada…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-rose-400" />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
              <input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} />
              Devolver al inventario
              <span className="font-normal text-xs text-gray-400">
                — desmarcá si viene dañado y no se puede volver a vender
              </span>
            </label>

            {resolution === 'refund' && !currentSession && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-lg px-3 py-2">
                No hay caja abierta: la salida de efectivo no se va a registrar y el cierre no va a cuadrar.
              </div>
            )}

            <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
              <button onClick={voidInvoice} disabled={saving || invoice.status === 'cancelled'}
                title="Cancela la venta entera y repone todo el stock"
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-black hover:bg-red-100 disabled:opacity-40">
                <Ban size={15} /> Anular factura completa
              </button>
              <div className="ml-auto text-right">
                <p className="text-[11px] font-bold text-gray-400 uppercase leading-none">A devolver</p>
                <p className="text-3xl font-black tabular-nums">{money(total)}</p>
              </div>
              <button onClick={save} disabled={saving || selected.length === 0}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black disabled:bg-gray-200 disabled:text-gray-400">
                {saving ? <Loader2 size={17} className="animate-spin" /> : <Undo2 size={17} />}
                Registrar devolución
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesReturns;
