'use client';

import React, { useMemo, useState } from 'react';
import { BookOpen, Search, Printer, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { useInventoryProducts } from '@/hooks/useInventoryProducts';
import { useTenantId } from '@/hooks/useTenant';
import { stockAdjustmentsService, type KardexResult } from '@/services/Inventory/stockAdjustmentsService';

// Etiqueta y color por tipo de movimiento.
const KIND: Record<string, { label: string; cls: string }> = {
  sale:     { label: 'Venta',            cls: 'bg-red-50 text-red-600' },
  increase: { label: 'Entrada',          cls: 'bg-emerald-50 text-emerald-600' },
  return:   { label: 'Devolución',       cls: 'bg-emerald-50 text-emerald-600' },
  count:    { label: 'Toma física',      cls: 'bg-blue-50 text-blue-600' },
  set:      { label: 'Corrección',       cls: 'bg-blue-50 text-blue-600' },
  damage:   { label: 'Daño',             cls: 'bg-amber-50 text-amber-600' },
  expired:  { label: 'Vencido',          cls: 'bg-amber-50 text-amber-600' },
  theft:    { label: 'Robo/Pérdida',     cls: 'bg-amber-50 text-amber-600' },
  decrease: { label: 'Salida',           cls: 'bg-amber-50 text-amber-600' },
};
const kindOf = (k: string) => KIND[k] ?? { label: k, cls: 'bg-gray-100 text-gray-500' };
const fmtDate = (s: string) => { try { return new Date(s).toLocaleString('es-CR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return s; } };
const nf = (n: number) => (Math.round(n * 100) / 100).toLocaleString('es-CR');

export const KardexView: React.FC = () => {
  const { tenantId } = useTenantId();
  const { products } = useInventoryProducts(tenantId);

  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<KardexResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products.filter(p =>
      (p.name?.toLowerCase() ?? '').includes(q) || (p.sku?.toLowerCase() ?? '').includes(q)
    ).slice(0, 8);
  }, [products, search]);

  const load = async (pid: string) => {
    setLoading(true); setErr('');
    try {
      const r = await stockAdjustmentsService.kardex(pid, from || undefined, to || undefined);
      setData(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al cargar el kardex');
    } finally { setLoading(false); }
  };

  const pick = (p: any) => { setProductId(p.id); setSearch(p.name); setData(null); void load(p.id); };

  const print = () => {
    if (!data) return;
    const rows = data.rows.map(r => `<tr>
        <td>${fmtDate(r.date)}</td>
        <td>${kindOf(r.kind).label}${r.ref ? ` <small style="color:#888">${r.ref}</small>` : ''}</td>
        <td style="text-align:right;color:#059669">${r.in ? nf(r.in) : ''}</td>
        <td style="text-align:right;color:#dc2626">${r.out ? nf(r.out) : ''}</td>
        <td style="text-align:right;font-weight:bold">${nf(r.balance)}</td>
      </tr>`).join('');
    const html = `<html><head><title>Kardex</title></head>
      <body style="font-family:Arial;padding:20px;max-width:760px;margin:0 auto;color:#111">
      <h2 style="text-align:center;border-top:3px solid #000;border-bottom:3px solid #000;padding:8px 0;margin-bottom:4px">KARDEX — TARJETA DE EXISTENCIAS</h2>
      <p style="text-align:center;margin-top:4px"><b>${data.product.name}</b>${data.product.sku ? ` · ${data.product.sku}` : ''}</p>
      <p style="text-align:center;color:#555;font-size:12px">${from || 'inicio'} a ${to || 'hoy'} · impreso ${new Date().toLocaleString('es-CR')}</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#000;color:#fff">
          <th style="padding:6px;text-align:left">Fecha</th><th style="padding:6px;text-align:left">Movimiento</th>
          <th style="padding:6px;text-align:right">Entra</th><th style="padding:6px;text-align:right">Sale</th><th style="padding:6px;text-align:right">Saldo</th>
        </tr></thead>
        <tbody>
          <tr style="background:#f3f4f6;font-weight:bold"><td colspan="4" style="padding:6px">Saldo inicial</td><td style="padding:6px;text-align:right">${nf(data.opening)}</td></tr>
          ${rows}
          <tr style="background:#f3f4f6;font-weight:bold"><td colspan="2" style="padding:6px">Totales</td><td style="padding:6px;text-align:right;color:#059669">${nf(data.total_in)}</td><td style="padding:6px;text-align:right;color:#dc2626">${nf(data.total_out)}</td><td style="padding:6px;text-align:right">${nf(data.closing)}</td></tr>
        </tbody>
      </table>
      </body></html>`;
    const w = window.open('', '_blank', 'width=800,height=840');
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 250); }
  };

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-2"><BookOpen size={26} className="text-indigo-600" /> Kardex</h2>
        <p className="text-gray-500 mt-1">Tarjeta de existencias: entradas, salidas y saldo corrido por producto.</p>
      </div>

      {/* Selector de producto + fechas */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setProductId(''); }}
            placeholder="Buscar producto por nombre o SKU…"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
          {matches.length > 0 && !productId && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {matches.map(p => (
                <button key={p.id} onClick={() => pick(p)}
                  className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm border-b border-gray-50 last:border-0">
                  <span className="font-bold text-gray-800">{p.name}</span>
                  {p.sku && <span className="text-gray-400 ml-2 text-xs">{p.sku}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">Desde</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">Hasta</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <button onClick={() => productId && load(productId)} disabled={!productId || loading}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:bg-gray-200">
            {loading ? 'Cargando…' : 'Aplicar'}
          </button>
          {data && (
            <button onClick={print} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm flex items-center gap-1.5 ml-auto">
              <Printer size={15} /> Imprimir
            </button>
          )}
        </div>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}

      {!data && !loading && (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <BookOpen size={36} className="mx-auto text-gray-300 mb-2" />
          <p className="text-gray-500 font-semibold">Buscá un producto para ver su kardex</p>
        </div>
      )}

      {data && (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 p-4"><p className="text-xs font-bold text-gray-400">Saldo inicial</p><p className="text-2xl font-black text-gray-900">{nf(data.opening)}</p></div>
            <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4"><p className="text-xs font-bold text-emerald-600 flex items-center gap-1"><ArrowDownCircle size={13} /> Entradas</p><p className="text-2xl font-black text-emerald-700">{nf(data.total_in)}</p></div>
            <div className="bg-red-50 rounded-xl border border-red-100 p-4"><p className="text-xs font-bold text-red-600 flex items-center gap-1"><ArrowUpCircle size={13} /> Salidas</p><p className="text-2xl font-black text-red-700">{nf(data.total_out)}</p></div>
            <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-4"><p className="text-xs font-bold text-indigo-600">Saldo actual</p><p className="text-2xl font-black text-indigo-700">{nf(data.closing)}</p></div>
          </div>

          {/* Tabla */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs font-black uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Fecha</th>
                    <th className="text-left px-4 py-3">Movimiento</th>
                    <th className="text-right px-4 py-3">Entra</th>
                    <th className="text-right px-4 py-3">Sale</th>
                    <th className="text-right px-4 py-3">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-gray-50/60 border-t border-gray-100 font-bold text-gray-600">
                    <td className="px-4 py-2" colSpan={4}>Saldo inicial</td>
                    <td className="px-4 py-2 text-right">{nf(data.opening)}</td>
                  </tr>
                  {data.rows.map((r, i) => {
                    const k = kindOf(r.kind);
                    return (
                      <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(r.date)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold ${k.cls}`}>{k.label}</span>
                          {r.ref && <span className="text-gray-400 text-xs ml-2">{r.ref}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-emerald-600">{r.in ? nf(r.in) : ''}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-red-600">{r.out ? nf(r.out) : ''}</td>
                        <td className="px-4 py-2.5 text-right font-black text-gray-900">{nf(r.balance)}</td>
                      </tr>
                    );
                  })}
                  {data.rows.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-400">Sin movimientos en el rango</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
