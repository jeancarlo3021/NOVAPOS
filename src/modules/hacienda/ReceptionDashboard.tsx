import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, RefreshCw, Loader2, CheckCircle2, XCircle, ChevronLeft, AlertTriangle, Plus, X, Upload } from 'lucide-react';
import { haciendaService, type ReceivedDoc } from '@/services/hacienda/haciendaService';
import { useTenantId } from '@/hooks/useTenant';
import { expenseCategoriesService } from '@/services/expenses/expensesService';
import type { ExpenseCategory } from '@/types/Types_Expenses';
import ExpenseFormModal from '@/modules/expenses/components/ExpenseFormModal';

const fmt = (n: number) => `₡${Number(n ?? 0).toLocaleString('es-CR')}`;
const docTypeLabel = (t?: string | null) => {
  switch (String(t ?? '')) {
    case '01': return 'Factura';
    case '02': return 'Nota débito';
    case '03': return 'Nota crédito';
    case '04': return 'Tiquete';
    default: return t || '—';
  }
};

export const ReceptionDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ReceivedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const { tenantId } = useTenantId();
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [gastoFor, setGastoFor] = useState<ReceivedDoc | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tenantId) expenseCategoriesService.getAll(tenantId).then(setCategories).catch(() => {});
  }, [tenantId]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(await haciendaService.listReceived()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error al cargar la bandeja'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const onUploadXml = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true); setError('');
    let okCount = 0;
    try {
      for (const f of Array.from(files)) {
        const xml = await f.text();
        try { await haciendaService.uploadReceivedXml(xml); okCount++; }
        catch (e) { setError(`${f.name}: ${e instanceof Error ? e.message : 'no se pudo procesar'}`); }
      }
      if (okCount > 0) await load();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Compra a proveedor: crea el proveedor (si falta) y la compra, y marca el recibido.
  const asCompra = async (row: ReceivedDoc) => {
    if (row.kind === 'compra') return;
    setBusyId(row.id); setError('');
    try {
      await haciendaService.receivedToPurchase(row.id);
      setRows(prev => prev.map(x => x.id === row.id ? { ...x, kind: 'compra' } : x));
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear la compra'); }
    finally { setBusyId(null); }
  };

  // Gasto: abre el modal de gasto (con categorías) prellenado con el comprobante.
  const asGasto = (row: ReceivedDoc) => setGastoFor(row);

  const onGastoSaved = async () => {
    const row = gastoFor;
    setGastoFor(null);
    if (!row) return;
    setRows(prev => prev.map(x => x.id === row.id ? { ...x, kind: 'gasto' } : x));
    try { await haciendaService.classifyReceived(row.id, 'gasto'); } catch { /* ya se creó el gasto igual */ }
  };

  const confirm = async (row: ReceivedDoc, state: '1' | '3') => {
    const reason = state === '3'
      ? window.prompt('Motivo del rechazo:', 'Comprobante no corresponde')
      : undefined;
    if (state === '3' && reason === null) return;
    if (state === '1' && !window.confirm(`¿Aceptar el comprobante de ${row.issuer_name ?? 'proveedor'} por ${fmt(row.total)}?`)) return;
    setBusyId(row.id);
    try {
      await haciendaService.confirmReceived(row.id, state, reason || undefined);
      setRows(prev => prev.map(x => x.id === row.id ? { ...x, ack_status: state === '1' ? 'accepted' : 'rejected' } : x));
    } catch (e) { alert(e instanceof Error ? e.message : 'No se pudo enviar la confirmación'); }
    finally { setBusyId(null); }
  };

  const ackBadge = (s?: string | null) => {
    const t = String(s ?? '').toLowerCase();
    if (t.includes('accept') || t === '1') return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full"><CheckCircle2 size={11} /> Aceptado</span>;
    if (t.includes('reject') || t === '3') return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full"><XCircle size={11} /> Rechazado</span>;
    return <span className="inline-flex items-center text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Pendiente</span>;
  };
  const isPending = (s?: string | null) => {
    const t = String(s ?? '').toLowerCase();
    return !(t.includes('accept') || t.includes('reject') || t === '1' || t === '3');
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/fe-facturas')} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50" title="Volver">
          <ChevronLeft size={18} />
        </button>
        <div className="w-11 h-11 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
          <Inbox size={22} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-black text-gray-900">Recepción de comprobantes</h1>
          <p className="text-sm text-gray-500">Aceptá o rechazá ante Hacienda las facturas recibidas de tus proveedores.</p>
        </div>
        <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" multiple className="hidden"
          onChange={e => onUploadXml(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 text-sm font-bold disabled:opacity-50">
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} {uploading ? 'Subiendo…' : 'Subir XML'}
        </button>
        <button onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-bold">
          <Plus size={15} /> Registrar recibido
        </button>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50" title="Actualizar">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-14 text-gray-400 gap-2"><Loader2 size={18} className="animate-spin" /> Cargando bandeja…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl text-center py-14 text-gray-400">
          <Inbox size={36} className="mx-auto text-gray-300 mb-2" />
          <p className="font-semibold">No hay comprobantes en la bandeja.</p>
          <p className="text-xs mt-1">Subí el XML que te envió tu proveedor con «Subir XML» (o cargá la clave con «Registrar recibido») para poder aceptarlo o rechazarlo.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Emisor', 'Tipo', 'Fecha', 'Total', 'Clasificación', 'Estado', 'Acciones'].map(h => (
                    <th key={h} className={`px-4 py-3 text-xs font-bold text-gray-500 uppercase ${h === 'Total' ? 'text-right' : h === 'Acciones' ? 'text-center' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(r => {
                  const nItems = r.items?.length ?? 0;
                  const isOpen = expanded === r.id;
                  return (
                  <React.Fragment key={r.id}>
                  <tr className={`hover:bg-gray-50 ${nItems > 0 ? 'cursor-pointer' : ''}`}
                    onClick={() => { if (nItems > 0) setExpanded(isOpen ? null : r.id); }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {nItems > 0 && (
                          <span className="text-gray-400 text-xs font-black w-4">{isOpen ? '▾' : '▸'}</span>
                        )}
                        <div>
                          <div className="font-bold text-gray-800 max-w-[220px] truncate">{r.issuer_name ?? '—'}</div>
                          <div className="text-[11px] text-gray-400 font-mono truncate max-w-[220px]">
                            {r.issuer_id ?? r.clave ?? ''}{nItems > 0 ? ` · ${nItems} art.` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">{docTypeLabel(r.document_type)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{r.date ? String(r.date).slice(0, 10) : '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(r.total)}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                        <button onClick={() => asCompra(r)} disabled={busyId === r.id}
                          className={`px-2 py-1 text-[11px] font-bold disabled:opacity-50 ${r.kind === 'compra' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>Compra</button>
                        <button onClick={() => asGasto(r)}
                          className={`px-2 py-1 text-[11px] font-bold border-l border-gray-200 ${r.kind === 'gasto' ? 'bg-amber-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>Gasto</button>
                      </div>
                    </td>
                    <td className="px-4 py-3">{ackBadge(r.ack_status)}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        {isPending(r.ack_status) ? (
                          <>
                            <button onClick={() => confirm(r, '1')} disabled={busyId === r.id}
                              className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg text-emerald-700 border border-emerald-300 bg-white hover:bg-emerald-600 hover:text-white disabled:opacity-50">
                              <CheckCircle2 size={12} /> Aceptar
                            </button>
                            <button onClick={() => confirm(r, '3')} disabled={busyId === r.id}
                              className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg text-red-700 border border-red-300 bg-white hover:bg-red-600 hover:text-white disabled:opacity-50">
                              <XCircle size={12} /> Rechazar
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">Confirmado</span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isOpen && nItems > 0 && (
                    <tr className="bg-gray-50/60">
                      <td colSpan={7} className="px-6 py-3">
                        <p className="text-[11px] font-black text-gray-500 uppercase mb-1.5">Artículos comprados</p>
                        <div className="rounded-lg border border-gray-100 overflow-hidden bg-white">
                          {r.items!.map((it, i) => (
                            <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-xs border-b border-gray-50 last:border-0">
                              <span className="flex-1 text-gray-800">{it.detail || '—'}</span>
                              <span className="text-gray-400 w-24 text-right">{it.quantity}{it.unit ? ` ${it.unit}` : ''} × {fmt(it.unit_price)}</span>
                              <span className="font-bold text-gray-900 w-24 text-right">{fmt(it.total)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAdd && <RegisterModal onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); load(); }} />}

      {gastoFor && tenantId && (
        <ExpenseFormModal
          open={true}
          tenantId={tenantId}
          categories={categories}
          editing={null}
          onClose={() => setGastoFor(null)}
          onSaved={onGastoSaved}
          prefill={{
            description: `Compra a ${gastoFor.issuer_name ?? 'proveedor'}`,
            amount: String(gastoFor.total ?? ''),
            date: gastoFor.date ? String(gastoFor.date).slice(0, 10) : undefined,
            reference: gastoFor.clave ?? '',
            notes: (gastoFor.items ?? []).map(it => `• ${it.detail} (${it.quantity} x ₡${Number(it.unit_price).toLocaleString('es-CR')})`).join('\n'),
          }}
        />
      )}
    </div>
  );
};

function RegisterModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [clave, setClave] = useState('');
  const [issuerId, setIssuerId] = useState('');
  const [issuerName, setIssuerName] = useState('');
  const [total, setTotal] = useState('');
  const [tax, setTax] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const claveDigits = clave.replace(/\D/g, '');
  const save = async () => {
    if (claveDigits.length !== 50) { setErr('La clave debe tener 50 dígitos'); return; }
    setSaving(true); setErr('');
    try {
      await haciendaService.registerReceived({
        clave: claveDigits,
        issuer_id: issuerId || undefined,
        issuer_name: issuerName || undefined,
        total: Number(total) || 0,
        tax: Number(tax) || 0,
      });
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo registrar'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-black text-gray-900 flex items-center gap-2"><Plus size={18} className="text-indigo-600" /> Registrar comprobante recibido</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Clave del comprobante (50 dígitos) *</label>
            <input value={clave} onChange={e => { setClave(e.target.value); setErr(''); }}
              placeholder="5060101…" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono" />
            <p className={`text-[11px] mt-1 ${claveDigits.length === 50 ? 'text-emerald-600' : 'text-gray-400'}`}>{claveDigits.length}/50 dígitos</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Cédula emisor</label>
              <input value={issuerId} onChange={e => setIssuerId(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Nombre emisor</label>
              <input value={issuerName} onChange={e => setIssuerName(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Total (₡)</label>
              <input type="number" value={total} onChange={e => setTotal(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">IVA (₡)</label>
              <input type="number" value={tax} onChange={e => setTax(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
            </div>
          </div>
          {err && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{err}</div>}
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-sm">Cancelar</button>
          <button onClick={save} disabled={saving || claveDigits.length !== 50}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-xl text-sm">
            {saving ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReceptionDashboard;
