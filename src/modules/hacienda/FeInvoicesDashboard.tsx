import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, RefreshCw, Send, Mail, AlertTriangle, CheckCircle2, Clock, Loader2, FileMinus, FilePlus, FileDown, Inbox } from 'lucide-react';
import { haciendaService } from '@/services/hacienda/haciendaService';
import { openFeInvoicePdf } from '@/services/hacienda/feInvoicePdf';
import { formatWallClock } from '@/utils/datetime';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;

interface FeRow {
  id: string;
  invoice_number: string;
  customer_name?: string | null;
  total: number;
  issued_at: string;
  document_type?: string;
  fe_clave?: string | null;
  fe_consecutivo?: string | null;
  fe_status?: string | null;
  fe_error?: string | null;
  fe_nc_clave?: string | null;
  fe_nd_clave?: string | null;
}

const STATUS = {
  accepted:    { label: 'Aceptado', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  rejected:    { label: 'Rechazado', cls: 'bg-red-100 text-red-700 border-red-200', Icon: AlertTriangle },
  sent:        { label: 'En proceso', cls: 'bg-amber-100 text-amber-700 border-amber-200', Icon: Clock },
  error:       { label: 'Error', cls: 'bg-red-100 text-red-700 border-red-200', Icon: AlertTriangle },
  not_emitted: { label: 'No emitida', cls: 'bg-gray-100 text-gray-600 border-gray-200', Icon: Clock },
} as const;

export const FeInvoicesDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<FeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isAlanube, setIsAlanube] = useState(false);

  useEffect(() => {
    haciendaService.provider().then(p => setIsAlanube(p.provider === 'alanube')).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      setRows(await haciendaService.listInvoices({
        status: statusFilter || undefined, from: from || undefined, to: to || undefined,
      }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al cargar'); }
    finally { setLoading(false); }
  }, [statusFilter, from, to]);
  useEffect(() => { load(); }, [load]);

  // Al abrir, consulta en Hacienda los que están "en proceso" y refresca la lista.
  const [syncing, setSyncing] = useState(false);
  const refreshPending = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await haciendaService.refreshPending();
      if (r.updated > 0) await load();
    } catch { /* silencioso */ }
    finally { setSyncing(false); }
  }, [load]);
  useEffect(() => { refreshPending(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling automático: mientras haya comprobantes "en proceso" (emitidos pero
  // sin respuesta de Hacienda), reconsulta cada 20s hasta que se resuelvan
  // (aceptado/rechazado) o se llegue al tope de intentos.
  const pollAttempts = useRef(0);
  const hasPending = rows.some(r => r.fe_clave && (r.fe_status ?? '') === 'sent');
  useEffect(() => {
    if (!hasPending) { pollAttempts.current = 0; return; }
    const id = setInterval(() => {
      if (pollAttempts.current >= 20) { clearInterval(id); return; }  // ~7 min máx
      pollAttempts.current += 1;
      refreshPending();
    }, 20000);
    return () => clearInterval(id);
  }, [hasPending, rows, refreshPending]);

  const refreshStatus = async (row: FeRow) => {
    setBusyId(row.id);
    try {
      const r = await haciendaService.refreshStatus(row.id);
      setRows(prev => prev.map(x => x.id === row.id ? { ...x, fe_status: r.fe_status, fe_error: r.error ?? null } : x));
    } catch (e) { alert(e instanceof Error ? e.message : 'No se pudo consultar el estatus'); }
    finally { setBusyId(null); }
  };

  const resendHacienda = async (row: FeRow) => {
    setBusyId(row.id);
    try {
      if (row.fe_clave) {
        // Ya tiene clave → solo re-consultar estatus.
        await refreshStatus(row);
      } else {
        // No emitida (o falló) → reintentar emisión.
        const r = await haciendaService.emit(row.id);
        setRows(prev => prev.map(x => x.id === row.id ? { ...x, fe_clave: r.clave ?? null, fe_status: 'sent', fe_error: null } : x));
      }
    } catch (e) { alert(e instanceof Error ? e.message : 'No se pudo reenviar a Hacienda'); }
    finally { setBusyId(null); }
  };

  const pdf = async (row: FeRow, creditNote = false) => {
    setBusyId(row.id);
    try { await openFeInvoicePdf(row.id, { creditNote }); }
    catch (e) { alert(e instanceof Error ? e.message : 'No se pudo generar el PDF'); }
    finally { setBusyId(null); }
  };

  const creditNote = async (row: FeRow) => {
    const reason = window.prompt('Motivo de la nota de crédito (anulación):', 'Anulación por error en facturación');
    if (reason === null) return;
    setBusyId(row.id);
    try {
      const r = await haciendaService.creditNote(row.id, reason || undefined);
      setRows(prev => prev.map(x => x.id === row.id ? { ...x, fe_nc_clave: r.nc_clave ?? 'nc' } : x));
      alert('Nota de crédito emitida.' + (r.nc_clave ? ` Clave: ${r.nc_clave}` : ''));
    } catch (e) { alert(e instanceof Error ? e.message : 'No se pudo emitir la nota de crédito'); }
    finally { setBusyId(null); }
  };

  const debitNote = async (row: FeRow) => {
    const reason = window.prompt('Motivo de la nota de débito:', 'Cargo adicional');
    if (reason === null) return;
    setBusyId(row.id);
    try {
      const r = await haciendaService.debitNote(row.id, reason || undefined);
      setRows(prev => prev.map(x => x.id === row.id ? { ...x, fe_nd_clave: r.nd_clave ?? 'nd' } : x));
      alert('Nota de débito emitida.' + (r.nd_clave ? ` Clave: ${r.nd_clave}` : ''));
    } catch (e) { alert(e instanceof Error ? e.message : 'No se pudo emitir la nota de débito'); }
    finally { setBusyId(null); }
  };

  const resendEmail = async (row: FeRow) => {
    const email = window.prompt('Reenviar comprobante a este correo:', row.customer_name ? '' : '');
    if (!email) return;
    setBusyId(row.id);
    try {
      await haciendaService.resendEmail(row.id, email);
      alert('Comprobante reenviado a ' + email);
    } catch (e) { alert(e instanceof Error ? e.message : 'No se pudo reenviar el correo'); }
    finally { setBusyId(null); }
  };

  const st = (r: FeRow) => {
    if (r.fe_status === 'error') return STATUS.error;
    if (r.fe_status === 'rejected') return STATUS.rejected;
    if (r.fe_status === 'accepted') return STATUS.accepted;
    if (r.fe_clave) return STATUS.sent;      // tiene clave → en proceso en Hacienda
    return STATUS.not_emitted;               // sin clave y sin error → no emitida
  };

  // Proveedor del comprobante, derivado del consecutivo: Alanube guarda un ULID
  // (con letras) y Facturemos un consecutivo numérico. '' si aún no fue emitido.
  const providerOf = (r: FeRow): 'alanube' | 'facturemos' | '' => {
    const c = String(r.fe_consecutivo ?? '').trim();
    if (!c) return '';
    return /[A-Za-z]/.test(c) ? 'alanube' : 'facturemos';
  };

  // Consecutivo de Hacienda (20 díg). En Alanube `fe_consecutivo` guarda el ULID
  // interno; el consecutivo real va EMBEBIDO en la clave de 50 díg (posiciones
  // 22–41): país(3)+fecha(6)+cédula(12) → consecutivo(20) → situación(1)+seg(8).
  const consecutivoOf = (r: FeRow): string => {
    const clave = String(r.fe_clave ?? '').replace(/\D/g, '');
    if (clave.length === 50) return clave.slice(21, 41);
    return String(r.fe_consecutivo ?? '');
  };

  const visibleRows = providerFilter
    ? rows.filter(r => providerOf(r) === providerFilter)
    : rows;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
          <FileText size={22} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Facturas electrónicas</h1>
          <p className="text-sm text-gray-500">Estatus ante Hacienda, errores y reenvíos.</p>
        </div>
        {hasPending && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold">
            <RefreshCw size={12} className="animate-spin" /> Consultando estado en Hacienda…
          </span>
        )}
        {isAlanube && (
          <button onClick={() => navigate('/fe-recepcion')}
            className={`${hasPending ? '' : 'ml-auto'} inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 text-sm font-bold`}>
            <Inbox size={15} /> Recepción
          </button>
        )}
        <button onClick={refreshPending} disabled={syncing}
          className={`${(!isAlanube && !hasPending) ? 'ml-auto' : ''} inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 text-sm font-bold disabled:opacity-50`}>
          <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Actualizando…' : 'Actualizar estados'}
        </button>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <RefreshCw size={16} className={loading ? 'animate-spin text-gray-400' : 'text-gray-600'} />
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Estado</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="">Todos</option>
            <option value="accepted">Aceptado</option>
            <option value="rejected">Rechazado</option>
            <option value="sent">En proceso</option>
            <option value="error">Error</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Proveedor</label>
          <select value={providerFilter} onChange={e => setProviderFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="">Todos</option>
            <option value="alanube">Alanube</option>
            <option value="facturemos">Facturemos</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Desde</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} max={to || undefined}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Hasta</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} min={from || undefined}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        {(statusFilter || providerFilter || from || to) && (
          <button onClick={() => { setStatusFilter(''); setProviderFilter(''); setFrom(''); setTo(''); }}
            className="px-3 py-1.5 rounded-lg text-gray-500 text-xs font-bold hover:bg-gray-100">Limpiar</button>
        )}
        <span className="ml-auto text-xs text-gray-400 self-center">{visibleRows.length} comprobante(s)</span>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-14 text-gray-400 gap-2"><Loader2 size={18} className="animate-spin" /> Cargando…</div>
      ) : visibleRows.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl text-center py-14 text-gray-400">Sin comprobantes electrónicos</div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Factura', 'Fecha', 'Cliente', 'Tipo', 'Total', 'Estado', 'Acciones'].map(h => (
                    <th key={h} className={`px-4 py-3 text-xs font-bold text-gray-500 uppercase ${h === 'Total' ? 'text-right' : h === 'Acciones' ? 'text-center' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibleRows.map(r => {
                  const s = st(r);
                  const isFactura = r.document_type === 'factura_electronica';
                  const prov = providerOf(r);
                  return (
                    <React.Fragment key={r.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs font-bold text-gray-700">
                          {r.invoice_number}
                          {prov && (
                            <span className={`ml-2 inline-block px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${prov === 'alanube' ? 'bg-indigo-100 text-indigo-600' : 'bg-teal-100 text-teal-600'}`}>
                              {prov === 'alanube' ? 'Alanube' : 'Facturemos'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{formatWallClock(r.issued_at, { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">{r.customer_name ?? '—'}</td>
                        <td className="px-4 py-3 text-xs">{isFactura ? 'Factura' : 'Tiquete'}</td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(r.total)}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold border ${s.cls}`}>
                            <s.Icon size={12} /> {s.label}
                            {r.fe_nc_clave && <span className="ml-1 text-[10px]">· NC</span>}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <button onClick={() => pdf(r, false)} disabled={busyId === r.id}
                              title="Ver / guardar PDF del comprobante"
                              className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg text-gray-700 border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50">
                              <FileDown size={12} /> PDF
                            </button>
                            {r.fe_nc_clave && (
                              <button onClick={() => pdf(r, true)} disabled={busyId === r.id}
                                title="PDF de la nota de crédito"
                                className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg text-rose-700 border border-rose-300 bg-white hover:bg-rose-50 disabled:opacity-50">
                                <FileDown size={12} /> PDF NC
                              </button>
                            )}
                            <button onClick={() => resendHacienda(r)} disabled={busyId === r.id}
                              title="Reenviar / reconsultar a Hacienda"
                              className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg text-blue-700 border border-blue-300 bg-white hover:bg-blue-50 disabled:opacity-50">
                              <Send size={12} /> Hacienda
                            </button>
                            <button onClick={() => resendEmail(r)} disabled={busyId === r.id || !r.fe_clave}
                              title="Reenviar a otro correo"
                              className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg text-emerald-700 border border-emerald-300 bg-white hover:bg-emerald-50 disabled:opacity-50">
                              <Mail size={12} /> Correo
                            </button>
                            <button onClick={() => creditNote(r)} disabled={busyId === r.id || !r.fe_clave || !!r.fe_nc_clave}
                              title="Emitir nota de crédito (anular)"
                              className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg text-rose-700 border border-rose-300 bg-white hover:bg-rose-50 disabled:opacity-50">
                              <FileMinus size={12} /> {r.fe_nc_clave ? 'NC ✓' : 'Nota créd.'}
                            </button>
                            <button onClick={() => debitNote(r)} disabled={busyId === r.id || !r.fe_clave || !!r.fe_nd_clave}
                              title="Emitir nota de débito (cargo adicional)"
                              className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg text-orange-700 border border-orange-300 bg-white hover:bg-orange-50 disabled:opacity-50">
                              <FilePlus size={12} /> {r.fe_nd_clave ? 'ND ✓' : 'Nota déb.'}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded === r.id && (
                        <tr className="bg-gray-50/60">
                          <td colSpan={7} className="px-4 py-3 text-xs text-gray-600 space-y-1">
                            {consecutivoOf(r) && <div><b>Consecutivo:</b> <span className="font-mono">{consecutivoOf(r)}</span></div>}
                            {r.fe_clave && <div className="break-all"><b>Clave:</b> <span className="font-mono">{r.fe_clave}</span></div>}
                            {r.fe_nc_clave && <div className="break-all"><b>Nota de crédito:</b> <span className="font-mono">{r.fe_nc_clave}</span></div>}
                            {r.fe_nd_clave && <div className="break-all"><b>Nota de débito:</b> <span className="font-mono">{r.fe_nd_clave}</span></div>}
                            {r.fe_error && <div className="text-red-600"><b>Error:</b> {r.fe_error}</div>}
                            {!r.fe_clave && <div className="text-amber-600">No emitida a Hacienda. Usá «Hacienda» para reintentar.</div>}
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
    </div>
  );
};

export default FeInvoicesDashboard;
