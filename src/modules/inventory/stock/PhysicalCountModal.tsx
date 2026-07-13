'use client';

import React, { useMemo, useState } from 'react';
import { X, ClipboardCheck, Search, Printer, CheckCircle2, AlertTriangle, EyeOff, CheckSquare, Square, FileText } from 'lucide-react';
import { useInventoryProducts } from '@/hooks/useInventoryProducts';
import { useTenantId } from '@/hooks/useTenant';
import { useAuth } from '@/context/AuthContext';
import { stockAdjustmentsService, type PhysicalCountResult } from '@/services/Inventory/stockAdjustmentsService';

interface Props {
  onClose: () => void;
  /** Se llama tras aplicar la toma para refrescar el inventario del padre. */
  onApplied?: () => void;
}

const tracksStock = (p: any) => p.tracks_stock !== false;

export const PhysicalCountModal: React.FC<Props> = ({ onClose, onApplied }) => {
  const { tenantId } = useTenantId();
  const { user } = useAuth();
  const { products, loading, refresh } = useInventoryProducts(tenantId);

  // Solo productos que controlan stock (los ilimitados no se cuentan).
  const countable = useMemo(() => products.filter(tracksStock), [products]);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'counted' | 'diff'>('all');
  const [blind, setBlind] = useState(false);          // conteo ciego: oculta el stock del sistema
  const [selected, setSelected] = useState<Record<string, boolean>>({});  // productos escogidos
  const [onlySelected, setOnlySelected] = useState(false); // limitar la toma a los escogidos
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState<'count' | 'review' | 'done'>('count');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<PhysicalCountResult | null>(null);

  const sysOf = (p: any) => Number(p.stock_quantity ?? 0);
  const isCounted = (id: string) => counts[id] !== undefined && counts[id] !== '';
  const countedVal = (id: string) => parseFloat(counts[id] ?? '');
  const diffOf = (p: any) => isCounted(p.id) ? (countedVal(p.id) || 0) - sysOf(p) : 0;

  const selectedIds = useMemo(() => new Set(Object.keys(selected).filter(id => selected[id])), [selected]);
  // Conjunto que participa en la toma: los escogidos (si "solo seleccionados") o todos.
  const scope = useMemo(
    () => (onlySelected && selectedIds.size > 0 ? countable.filter(p => selectedIds.has(p.id)) : countable),
    [countable, onlySelected, selectedIds]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scope.filter(p => {
      if (filter === 'pending' && isCounted(p.id)) return false;
      if (filter === 'counted' && !isCounted(p.id)) return false;
      if (filter === 'diff' && !(isCounted(p.id) && Math.abs(diffOf(p)) > 0.0001)) return false;
      if (!q) return true;
      return (p.name?.toLowerCase() ?? '').includes(q) || (p.sku?.toLowerCase() ?? '').includes(q);
    });
  }, [scope, search, filter, counts]);

  const countedCount = useMemo(() => scope.filter(p => isCounted(p.id)).length, [scope, counts]);
  const diffList = useMemo(
    () => scope.filter(p => isCounted(p.id) && Math.abs(diffOf(p)) > 0.0001),
    [scope, counts]
  );
  const pct = scope.length > 0 ? Math.round((countedCount / scope.length) * 100) : 0;

  const setCount = (id: string, v: string) => { setCounts(c => ({ ...c, [id]: v })); setErr(''); };
  const matchSystem = (p: any) => setCount(p.id, String(sysOf(p)));
  const toggleSel = (id: string) => setSelected(s => ({ ...s, [id]: !s[id] }));
  const selectAllFiltered = () => setSelected(s => { const n = { ...s }; filtered.forEach(p => { n[p.id] = true; }); return n; });
  const clearSelection = () => setSelected({});

  const apply = async () => {
    const payload = scope
      .filter(p => isCounted(p.id))
      .map(p => ({ product_id: p.id, counted: countedVal(p.id) || 0 }));
    if (payload.length === 0) { setErr('No contaste ningún producto'); return; }
    setSaving(true); setErr('');
    try {
      const r = await stockAdjustmentsService.physicalCount({
        counts: payload, notes: notes.trim() || undefined, user_email: user?.email ?? undefined,
      });
      setResult(r);
      setStep('done');
      await refresh();
      onApplied?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al aplicar la toma');
    } finally { setSaving(false); }
  };

  const printReport = () => {
    const rows = (result?.items ?? diffList.map(p => ({
      name: p.name, sku: p.sku, stock_before: sysOf(p), counted: countedVal(p.id) || 0, diff: diffOf(p),
    })));
    const body = rows.map(r => `<tr>
        <td>${r.name}${r.sku ? `<br><small style="color:#888">${r.sku}</small>` : ''}</td>
        <td style="text-align:right">${r.stock_before}</td>
        <td style="text-align:right">${r.counted}</td>
        <td style="text-align:right;font-weight:bold;color:${r.diff > 0 ? '#059669' : r.diff < 0 ? '#dc2626' : '#666'}">${r.diff > 0 ? '+' : ''}${r.diff}</td>
      </tr>`).join('');
    const html = `<html><head><title>Toma física</title></head>
      <body style="font-family:Arial;padding:20px;max-width:640px;margin:0 auto">
      <h2 style="text-align:center;border-top:3px solid #000;border-bottom:3px solid #000;padding:8px 0">TOMA FÍSICA DE INVENTARIO</h2>
      <p style="text-align:center">${new Date().toLocaleString('es-CR')} · ${user?.email ?? ''}</p>
      ${notes ? `<p><b>Notas:</b> ${notes}</p>` : ''}
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="border-bottom:2px solid #000"><th style="text-align:left">Producto</th><th style="text-align:right">Sistema</th><th style="text-align:right">Contado</th><th style="text-align:right">Dif.</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
      <p style="margin-top:16px;font-size:13px"><b>Productos con diferencia:</b> ${rows.length}</p>
      <p style="margin-top:40px">Responsable: ____________________</p>
      </body></html>`;
    const w = window.open('', '_blank', 'width=680,height=800');
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 250); }
  };

  // Hoja de conteo EN BLANCO: para imprimir, llevar a la bodega y anotar a mano.
  const printSheet = () => {
    const list = scope;
    if (list.length === 0) return;
    const rows = list.map((p, i) => `<tr style="page-break-inside:avoid">
        <td style="border:1px solid #ccc;padding:8px;background:${i % 2 ? '#fafafa' : '#fff'}">
          <b>${p.name}</b>${p.sku ? `<br><small style="color:#888">${p.sku}</small>` : ''}
        </td>
        <td style="border:1px solid #ccc;padding:8px;text-align:right;color:#666">${blind ? '—' : sysOf(p)}</td>
        <td style="border:1px solid #999;padding:8px;width:120px;height:38px"></td>
      </tr>`).join('');
    const html = `<html><head><title>Hoja de conteo</title></head>
      <body style="font-family:Arial;padding:20px;max-width:680px;margin:0 auto;color:#111">
      <h2 style="text-align:center;border-top:3px solid #000;border-bottom:3px solid #000;padding:8px 0;margin-bottom:4px">HOJA DE CONTEO FÍSICO</h2>
      <p style="text-align:center;color:#555;margin-top:4px">${new Date().toLocaleDateString('es-CR')} · ${list.length} producto(s)${onlySelected && selectedIds.size > 0 ? ' · selección' : ''}</p>
      <p style="font-size:12px;color:#777">Anotá a mano en la columna <b>CONTEO</b> la cantidad real encontrada de cada producto. Luego digitá las cantidades en el sistema.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#000;color:#fff">
          <th style="padding:8px;text-align:left">Producto</th>
          <th style="padding:8px;text-align:right;width:80px">Sistema</th>
          <th style="padding:8px;text-align:center;width:120px">CONTEO</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:40px">Responsable: ____________________ &nbsp;&nbsp;&nbsp; Firma: ____________________ &nbsp;&nbsp;&nbsp; Fecha: ____________</p>
      </body></html>`;
    const w = window.open('', '_blank', 'width=720,height=840');
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 250); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl h-[94vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="bg-linear-to-r from-emerald-600 to-teal-600 text-white px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center"><ClipboardCheck size={20} /></div>
            <div>
              <h2 className="font-black text-lg leading-tight">Toma física de inventario</h2>
              <p className="text-emerald-100 text-xs">Contá el stock real y ajustá las diferencias de una vez</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/15 rounded-lg"><X size={18} /></button>
        </div>

        {/* ── Paso: CONTEO ── */}
        {step === 'count' && (
          <>
            <div className="px-4 pt-3">
              <div className="flex items-center justify-between text-xs font-bold text-gray-500 mb-1">
                <span>Progreso: {countedCount} de {scope.length} contados{onlySelected && selectedIds.size > 0 ? ' (selección)' : ''}</span>
                <span>{diffList.length} con diferencia</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>

            <div className="px-4 py-3 space-y-2 border-b border-gray-100">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o SKU…"
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {([['all', 'Todos'], ['pending', 'Pendientes'], ['counted', 'Contados'], ['diff', 'Con diferencia']] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setFilter(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${filter === v ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{l}</button>
                ))}
                <label className={`ml-auto flex items-center gap-1.5 text-xs font-bold cursor-pointer px-2.5 py-1.5 rounded-lg ${blind ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                  <input type="checkbox" checked={blind} onChange={e => setBlind(e.target.checked)} className="hidden" />
                  <EyeOff size={13} /> Conteo ciego
                </label>
              </div>

              {/* Selección de productos (conteo parcial / cíclico) */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <button onClick={selectAllFiltered} className="px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold hover:bg-gray-200">Seleccionar visibles</button>
                {selectedIds.size > 0 && (
                  <button onClick={clearSelection} className="px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold hover:bg-gray-200">Limpiar ({selectedIds.size})</button>
                )}
                <label className={`flex items-center gap-1.5 text-xs font-bold cursor-pointer px-2.5 py-1.5 rounded-lg ${onlySelected ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'} ${selectedIds.size === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
                  <input type="checkbox" checked={onlySelected} onChange={e => setOnlySelected(e.target.checked)} className="hidden" />
                  <CheckSquare size={13} /> Solo seleccionados
                </label>
                <button onClick={printSheet} disabled={scope.length === 0}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 shadow-sm">
                  <FileText size={13} /> Imprimir para contar a mano
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {loading && countable.length === 0 ? (
                <p className="text-center text-gray-400 py-10">Cargando productos…</p>
              ) : filtered.length === 0 ? (
                <p className="text-center text-gray-400 py-10">Sin productos</p>
              ) : (
                <div className="space-y-1.5">
                  {filtered.map(p => {
                    const done = isCounted(p.id);
                    const d = diffOf(p);
                    const hasDiff = done && Math.abs(d) > 0.0001;
                    const sel = !!selected[p.id];
                    return (
                      <div key={p.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${hasDiff ? 'border-amber-300 bg-amber-50' : sel ? 'border-emerald-300 bg-emerald-50/60' : done ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-100'}`}>
                        <button onClick={() => toggleSel(p.id)} title="Seleccionar" className={sel ? 'text-emerald-600' : 'text-gray-300 hover:text-gray-400'}>
                          {sel ? <CheckSquare size={18} /> : <Square size={18} />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate">{p.name}</p>
                          <p className="text-[11px] text-gray-400">
                            {p.sku ? `${p.sku} · ` : ''}{blind ? 'sistema oculto' : `Sistema: ${sysOf(p)}`}
                          </p>
                        </div>
                        {!blind && (
                          <button onClick={() => matchSystem(p)} title="Igualar al sistema"
                            className="text-[10px] font-bold text-gray-400 hover:text-emerald-600 px-1">=</button>
                        )}
                        <input type="number" inputMode="decimal" step="any" value={counts[p.id] ?? ''}
                          onChange={e => setCount(p.id, e.target.value)} placeholder="contar"
                          className={`w-24 text-center border rounded-lg py-1.5 text-sm font-bold ${hasDiff ? 'border-amber-400' : 'border-gray-200'}`} />
                        {!blind && done && (
                          <span className={`w-12 text-right text-xs font-black ${d > 0 ? 'text-emerald-600' : d < 0 ? 'text-red-600' : 'text-gray-300'}`}>
                            {d > 0 ? '+' : ''}{d}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {err && <div className="mx-3 mb-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{err}</div>}
            <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-3">
              <div className="flex-1 text-xs text-gray-400">
                {countedCount === 0 ? 'Contá al menos un producto' : `${diffList.length} diferencia(s) a ajustar`}
              </div>
              <button onClick={() => { if (countedCount === 0) { setErr('Contá al menos un producto'); return; } setErr(''); setStep('review'); }}
                disabled={countedCount === 0}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white font-black px-6 py-3 rounded-xl text-sm flex items-center gap-2">
                Revisar <CheckCircle2 size={16} />
              </button>
            </div>
          </>
        )}

        {/* ── Paso: REVISIÓN ── */}
        {step === 'review' && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-50 rounded-xl py-3"><p className="text-2xl font-black text-gray-900">{countedCount}</p><p className="text-[11px] font-bold text-gray-500">Contados</p></div>
                <div className="bg-amber-50 rounded-xl py-3"><p className="text-2xl font-black text-amber-600">{diffList.length}</p><p className="text-[11px] font-bold text-amber-600">Diferencias</p></div>
                <div className="bg-gray-50 rounded-xl py-3"><p className={`text-2xl font-black ${diffList.reduce((s, p) => s + diffOf(p), 0) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{(() => { const t = diffList.reduce((s, p) => s + diffOf(p), 0); return `${t > 0 ? '+' : ''}${t}`; })()}</p><p className="text-[11px] font-bold text-gray-500">Δ unidades</p></div>
              </div>

              {diffList.length === 0 ? (
                <div className="text-center py-8 text-emerald-600 font-bold flex flex-col items-center gap-2">
                  <CheckCircle2 size={32} /> Todo cuadra: no hay diferencias que ajustar.
                </div>
              ) : (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 text-[11px] font-black text-gray-500 flex">
                    <span className="flex-1">Producto</span><span className="w-16 text-right">Sistema</span><span className="w-16 text-right">Contado</span><span className="w-14 text-right">Dif.</span>
                  </div>
                  {diffList.map(p => {
                    const d = diffOf(p);
                    return (
                      <div key={p.id} className="px-3 py-2 flex items-center border-t border-gray-100 text-sm">
                        <span className="flex-1 font-bold text-gray-800 truncate">{p.name}</span>
                        <span className="w-16 text-right text-gray-500">{sysOf(p)}</span>
                        <span className="w-16 text-right font-bold text-gray-800">{countedVal(p.id) || 0}</span>
                        <span className={`w-14 text-right font-black ${d > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{d > 0 ? '+' : ''}{d}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Notas de la toma (opcional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Ej. Toma mensual bodega central…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 flex gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                Al confirmar se ajusta el stock de los {diffList.length} producto(s) con diferencia y queda registrado como <b>Toma física</b> en los movimientos.
              </div>
            </div>

            {err && <div className="mx-3 mb-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{err}</div>}
            <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
              <button onClick={() => setStep('count')} disabled={saving} className="px-4 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm">Volver</button>
              <button onClick={printReport} className="px-4 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm flex items-center gap-1.5"><Printer size={15} /> Imprimir</button>
              <button onClick={apply} disabled={saving}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white font-black py-3 rounded-xl text-sm flex items-center justify-center gap-2">
                {saving ? 'Aplicando…' : <><CheckCircle2 size={16} /> Confirmar toma</>}
              </button>
            </div>
          </>
        )}

        {/* ── Paso: HECHO ── */}
        {step === 'done' && result && (
          <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center"><CheckCircle2 size={34} /></div>
            <div>
              <h3 className="font-black text-xl text-gray-900">Toma aplicada</h3>
              <p className="text-gray-500 text-sm mt-1">
                {result.counted} contados · <b className="text-amber-600">{result.adjusted}</b> ajustados ·
                Δ {result.diff_units > 0 ? '+' : ''}{result.diff_units} u.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={printReport} className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm flex items-center gap-1.5"><Printer size={15} /> Imprimir acta</button>
              <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-sm">Cerrar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
