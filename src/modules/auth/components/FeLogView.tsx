'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, RefreshCw, Loader2, AlertTriangle, CheckCircle2, Search, X, MailCheck, Download } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { downloadXlsx } from '@/utils/xlsx';
import { useVisiblePolling } from '@/hooks/useVisiblePolling';
import { crDateTime } from '@/utils/datetime';

interface FeRow {
  id: string;
  tenant_id: string;
  business_name: string;
  invoice_number: string;
  customer_name: string | null;
  total: number;
  issued_at: string | null;
  created_at: string;
  document_type: string | null;
  fe_clave: string | null;
  fe_consecutivo: string | null;
  fe_status: string | null;
  fe_error: string | null;
  fe_emailed?: boolean | null;
  fe_request?: any;
  fe_response?: any;
  /** Nota de crédito/débito derivada de la factura original. */
  is_note?: boolean;
  fe_nc_clave?: string | null;
  /** Cédula con la que SALIÓ el comprobante (leída de la clave de Hacienda). */
  emisor_cedula?: string | null;
  /** Cédula que el negocio tiene configurada hoy. */
  emisor_config?: string | null;
  emisor_mismatch?: boolean;
  parent_invoice_number?: string;
}
interface FeLogResp { count: number; errors: number; rows: FeRow[]; }

const fmt = (n: number) => `₡${Number(n ?? 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// El consecutivo REAL (20 díg) va dentro de la clave de 50 díg. `fe_consecutivo`
// a veces guarda el ID interno de Alanube (ULID), así que lo derivamos de la clave.
const consecutivoOf = (r: FeRow): string => {
  const clave = String(r.fe_clave ?? '');
  if (/^\d{50}$/.test(clave)) return clave.slice(21, 41);
  const cons = String(r.fe_consecutivo ?? '');
  if (/^\d{20}$/.test(cons)) return cons;         // consecutivo válido
  return r.invoice_number || cons || '—';         // fallback (evita mostrar el ULID)
};
const dt = (s?: string | null) => crDateTime(s);
const docLabel = (t?: string | null) => {
  switch (String(t ?? '')) {
    case 'factura_electronica': return 'Factura';
    case 'tiquete_electronico': return 'Tiquete';
    case 'nota_credito': return 'N. Crédito';
    case 'nota_debito': return 'N. Débito';
    default: return t || '—';
  }
};

// Semáforo del estado FE.
function statusBadge(s?: string | null) {
  const t = String(s ?? '').toLowerCase();
  if (t === 'error' || t === 'rejected' || t.includes('rechaz'))
    return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full"><AlertTriangle size={11} /> {s}</span>;
  if (t === 'accepted' || t === 'aceptado' || t === '1')
    return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full"><CheckCircle2 size={11} /> Aceptado</span>;
  return <span className="inline-flex items-center text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{s || 'Enviado'}</span>;
}

interface Props { owners: Array<{ id: string; name: string }>; }

export const FeLogView: React.FC<Props> = ({ owners }) => {
  const [data, setData] = useState<FeLogResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [reemitting, setReemitting] = useState<string | null>(null);
  /** Factura para la que se está eligiendo el consecutivo de re-emisión. */
  const [reemitFor, setReemitFor] = useState<{ id: string; num?: string } | null>(null);
  const [crediting, setCrediting] = useState<string | null>(null);

  // Descarga la bitácora a Excel con UNA FILA por comprobante y el IVA desglosado
  // por tarifa (0/1/2/4/13 %). Respeta los mismos filtros que la vista.
  const [exporting, setExporting] = useState(false);
  const exportExcel = async () => {
    setExporting(true);
    try {
      const p = new URLSearchParams();
      if (tenantId) p.set('tenant_id', tenantId);
      if (search) p.set('search', search);
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      if (onlyErrors) p.set('status', 'error');
      const qs = p.toString();
      const r = await apiFetch<{ rows: any[]; rates: number[] }>(`/admin/fe-log/export${qs ? '?' + qs : ''}`);
      const rows = r?.rows ?? [];
      if (rows.length === 0) { window.alert('No hay comprobantes en el rango seleccionado.'); return; }
      const rates = r?.rates ?? [0, 1, 2, 4, 13];

      const header = [
        'Negocio', 'Número', 'Tipo', 'Fecha', 'Cliente', 'Estado FE', 'Clave',
        'Cédula emisor', 'Consecutivo FE', 'Método de pago', 'Anulada',
        ...rates.flatMap(rt => [`Base ${rt}%`, `IVA ${rt}%`]),
        'Subtotal', 'IVA total', 'Total', 'Error',
      ];
      const body = rows.map(x => [
        x.negocio ?? '',
        // El número va como TEXTO: si sale como número, Excel se come los ceros
        // de la izquierda ("000677" → 677) y deja de coincidir con Hacienda.
        String(x.numero ?? ''),
        x.tipo ?? '',
        x.fecha ? new Date(x.fecha).toLocaleString('es-CR') : '',
        x.cliente ?? '',
        x.estado_fe ?? '',
        String(x.clave ?? ''),
        String(x.emisor_cedula ?? ''),
        String(x.consecutivo_fe ?? ''),
        x.metodo_pago ?? '',
        x.anulada ?? '',
        ...rates.flatMap(rt => [Number(x[`base_${rt}`] ?? 0), Number(x[`iva_${rt}`] ?? 0)]),
        Number(x.subtotal ?? 0), Number(x.iva_total ?? 0), Number(x.total ?? 0),
        x.error ?? '',
      ]);
      const stamp = `${from || 'inicio'}_${to || 'hoy'}`;
      downloadXlsx(`bitacora-fe-${stamp}`, [{ name: 'Bitácora FE', rows: [header, ...body] }]);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo descargar la bitácora');
    } finally { setExporting(false); }
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErr('');
    try {
      const p = new URLSearchParams();
      if (tenantId) p.set('tenant_id', tenantId);
      if (search) p.set('search', search);
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      if (onlyErrors) p.set('status', 'error');
      const qs = p.toString();
      setData(await apiFetch<FeLogResp>(`/admin/fe-log${qs ? '?' + qs : ''}`));
    } catch (e) {
      if (!silent) setErr(e instanceof Error ? e.message : 'Error al cargar la bitácora');
    } finally { if (!silent) setLoading(false); }
  }, [tenantId, search, from, to, onlyErrors]);
  useEffect(() => { load(); }, [load]);
  // Auto-refresco silencioso para ver cambios de estado sin recargar. Se pausa
  // cuando la pestaña no está visible (ahorra peticiones en Vercel).
  useVisiblePolling(() => load(true), 30_000);

  // Reintento: re-consulta el estado de UNA factura en Hacienda.
  const retryOne = async (id: string) => {
    setRetrying(id);
    try {
      const r = await apiFetch<any>(`/admin/fe-refresh/${id}`, { method: 'POST' });
      await load(true);
      const s = String(r?.fe_status ?? '');
      // `note` llega cuando el estado no se puede consultar en vivo (ej. notas de
      // crédito con Alanube, que se actualizan por webhook).
      if (r?.note) window.alert(r.note);
      else if (s === 'accepted') { /* silencioso: se ve en la tabla */ }
      else if (s === 'rejected' || s === 'error') window.alert(`Sigue rechazada/con error:\n${r?.error ?? 'sin detalle'}`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo reintentar');
    } finally { setRetrying(null); }
  };

  // Re-emitir: vuelve a enviar la MISMA factura corrigiendo el consecutivo (usa el
  // "Próx." configurado en Datos de FE). Solo admin. Ojo: si Hacienda ya la aceptó,
  // esto genera un comprobante NUEVO con otro número.
  // Se abre el modal en vez de re-emitir de una: el consecutivo hay que poder
  // ELEGIRLO. Cuando el contador quedó atrasado respecto de lo que Hacienda ya
  // recibió, «el siguiente» es justo el número que acaba de ser rechazado, y
  // reintentar sin tocarlo falla siempre igual.
  const reemitOne = (id: string, num?: string) => setReemitFor({ id, num });

  const doReemit = async (id: string, consecutivo?: number) => {
    setReemitFor(null);
    setReemitting(id);
    try {
      const r = await apiFetch<any>(`/admin/fe-reemit/${id}`, {
        method: 'POST',
        body: JSON.stringify(consecutivo ? { consecutivo } : {}),
      });
      await load(true);
      window.alert(`Re-emitida ✓\nClave: ${r?.clave ?? r?.consecutivo ?? '—'}\nEstado: ${r?.alanube_status ?? r?.tipo ?? 'enviada'}`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo re-emitir');
    } finally { setReemitting(null); }
  };

  // Nota de crédito de ANULACIÓN desde la bitácora. Es la vía para dar de baja un
  // comprobante ya aceptado por Hacienda (no se puede "borrar").
  const creditNoteOne = async (id: string, num?: string) => {
    const reason = window.prompt(
      `Nota de crédito de ANULACIÓN de la factura ${num ? `#${num}` : ''}.\n\n`
      + 'La factura queda anulada ante Hacienda. Escribí el motivo:',
      'Anulación de documento',
    );
    if (reason == null) return;
    // Id de empresa en Alanube. Se pregunta porque al RECREAR una empresa borrada
    // Alanube le asigna un id NUEVO, y la nota tiene que salir con ese, no con el
    // viejo que quedó guardado. Si se deja vacío se usa el configurado.
    const companyId = window.prompt(
      'ID de empresa en Alanube para emitir esta nota.\n\n'
      + 'Dejalo VACÍO para usar el que está guardado en Datos de FE.\n'
      + 'Si volviste a crear la empresa, pegá el ID NUEVO (se guarda para las próximas).',
      '',
    );
    if (companyId == null) return;
    setCrediting(id);
    try {
      const r = await apiFetch<any>(`/admin/fe-credit-note/${id}`, {
        method: 'POST',
        body: JSON.stringify({
          reason: reason.trim() || 'Anulación de documento',
          company_id: companyId.trim() || undefined,
        }),
      });
      await load(true);
      window.alert(`Nota de crédito emitida ✓\nClave: ${r?.nc_clave ?? '—'}\n\nQueda en proceso hasta que Hacienda la resuelva.`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo emitir la nota de crédito');
    } finally { setCrediting(null); }
  };

  const rows = data?.rows ?? [];
  const errorCount = useMemo(() => rows.filter(r => String(r.fe_status).toLowerCase() === 'error').length, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
          <FileText size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-black text-gray-900">Bitácora de Facturas Electrónicas</h2>
          <p className="text-sm text-gray-500">Todas las emisiones FE de las empresas. Filtrá por empresa, cliente o fecha para encontrar y resolver errores rápido.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportExcel}
            disabled={exporting}
            title="Descargar a Excel: una fila por comprobante, con el IVA desglosado por tarifa"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-teal-200 bg-teal-50 text-teal-700 text-sm font-bold hover:bg-teal-100 disabled:opacity-60">
            <Download size={15} /> {exporting ? 'Generando…' : 'Excel'}
          </button>
          <button onClick={() => load()} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50" title="Actualizar">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4"><p className="text-xs font-bold text-gray-400">Comprobantes</p><p className="text-2xl font-black text-gray-900">{data?.count ?? 0}</p></div>
        <div className="bg-red-50 rounded-xl border border-red-100 p-4"><p className="text-xs font-bold text-red-600 flex items-center gap-1"><AlertTriangle size={13} /> Con error</p><p className="text-2xl font-black text-red-700">{errorCount}</p></div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4"><p className="text-xs font-bold text-emerald-600">OK</p><p className="text-2xl font-black text-emerald-700">{(data?.count ?? 0) - errorCount}</p></div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 items-end">
        <div>
          <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Empresa</label>
          <select value={tenantId} onChange={e => setTenantId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white">
            <option value="">Todas</option>
            {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div className="lg:col-span-2">
          <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Cliente / consecutivo / clave</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') load(); }}
              placeholder="Buscar cliente…" className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Desde</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Hasta</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={onlyErrors} onChange={e => setOnlyErrors(e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm font-bold text-red-600">Solo errores</span>
        </label>
        {(search || from || to || tenantId || onlyErrors) && (
          <button onClick={() => { setSearch(''); setFrom(''); setTo(''); setTenantId(''); setOnlyErrors(false); }}
            className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"><X size={12} /> Limpiar</button>
        )}
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">{err}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-14 text-gray-400 gap-2"><Loader2 size={18} className="animate-spin" /> Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl text-center py-14 text-gray-400">
          <FileText size={36} className="mx-auto text-gray-300 mb-2" />
          <p className="font-semibold">Sin comprobantes con esos filtros.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs font-black uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Fecha</th>
                  <th className="text-left px-4 py-3">Empresa</th>
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-left px-4 py-3">Consecutivo</th>
                  <th className="text-left px-4 py-3">Tipo</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-left px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const isErr = String(r.fe_status).toLowerCase() === 'error';
                  const open = expanded === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr className={`border-t border-gray-50 cursor-pointer ${isErr ? 'bg-red-50/40' : 'hover:bg-gray-50'}`}
                        onClick={() => setExpanded(open ? null : r.id)}>
                        <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{dt(r.created_at ?? r.issued_at)}</td>
                        <td className="px-4 py-2.5 font-bold text-gray-800 max-w-45 truncate">{r.business_name}</td>
                        <td className="px-4 py-2.5 text-gray-600 max-w-40 truncate">{r.customer_name ?? '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{consecutivoOf(r)}</td>
                        <td className="px-4 py-2.5 text-xs">
                          <span className={r.is_note ? 'inline-flex items-center gap-1 font-bold' : ''}>
                            {r.is_note && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${r.document_type === 'nota_credito' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                {r.document_type === 'nota_credito' ? 'NC' : 'ND'}
                              </span>
                            )}
                            {docLabel(r.document_type)}
                            {r.is_note && r.parent_invoice_number && (
                              <span className="text-gray-400">· s/#{r.parent_invoice_number}</span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-900">{fmt(r.total)}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1">
                            {statusBadge(r.fe_status)}
                            {r.fe_emailed && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full" title="Comprobante enviado por correo al cliente">
                                <MailCheck size={11} /> Correo
                              </span>
                            )}
                            {/* Con qué cédula salió el comprobante. En rojo si NO es la
                                que el negocio tiene configurada hoy. */}
                            {r.emisor_cedula && (
                              <span
                                title={r.emisor_mismatch
                                  ? `Emitido con la cédula ${r.emisor_cedula}, pero el negocio está configurado como ${r.emisor_config}. Salió a nombre de otro contribuyente.`
                                  : `Emisor: cédula ${r.emisor_cedula}`}
                                className={`inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full border ${
                                  r.emisor_mismatch
                                    ? 'text-red-700 bg-red-50 border-red-200'
                                    : 'text-gray-500 bg-gray-50 border-gray-200'
                                }`}>
                                {r.emisor_mismatch ? '⚠' : '🏷'} {r.emisor_cedula}
                              </span>
                            )}
                            {r.fe_clave && String(r.fe_status).toLowerCase() !== 'accepted' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); retryOne(r.id); }}
                                disabled={retrying === r.id}
                                title="Reintentar: volver a consultar el estado en Hacienda"
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-1.5 py-0.5 rounded-full disabled:opacity-50">
                                <RefreshCw size={11} className={retrying === r.id ? 'animate-spin' : ''} /> Reintentar
                              </button>
                            )}
                            <span className="ml-0.5 text-[10px] text-gray-400">{open ? '▾' : '▸'}</span>
                          </span>
                        </td>
                      </tr>
                      {open && (
                        <tr className={isErr ? 'bg-red-50/60' : 'bg-gray-50/60'}>
                          <td colSpan={7} className="px-6 py-3 space-y-3">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <p className="text-[11px] text-gray-400">
                                {/* Son DOS numeraciones distintas y conviene decirlo:
                                    el N° interno es el de la venta en el sistema
                                    (corre para todas las facturas del negocio), y el
                                    consecutivo de Hacienda es propio de cada tipo de
                                    comprobante. Que no coincidan es lo NORMAL. */}
                                N° interno de la venta:{' '}
                                <b className="font-mono text-gray-600">#{r.invoice_number}</b>
                                <span className="text-gray-300"> (no es el consecutivo de Hacienda)</span>
                                {r.emisor_cedula && (
                                  <>
                                    {' · '}Emisor en la clave:{' '}
                                    <b className={`font-mono ${r.emisor_mismatch ? 'text-red-600' : 'text-gray-600'}`}>
                                      {r.emisor_cedula}
                                    </b>
                                    {r.emisor_mismatch && (
                                      <span className="text-red-600"> (configurado hoy: {r.emisor_config})</span>
                                    )}
                                  </>
                                )}
                              </p>
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Anular: solo tiene sentido en un comprobante que Hacienda ACEPTÓ
                                    y que todavía no tiene nota de crédito. */}
                                {!r.is_note && String(r.fe_status).toLowerCase() === 'accepted' && !r.fe_nc_clave && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); creditNoteOne(r.id, r.invoice_number); }}
                                    disabled={crediting === r.id}
                                    title="Emitir nota de crédito de anulación (la factura queda anulada ante Hacienda)"
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 px-3 py-1.5 rounded-lg disabled:opacity-50">
                                    <RefreshCw size={13} className={crediting === r.id ? 'animate-spin' : ''} />
                                    {crediting === r.id ? 'Anulando…' : 'Anular con nota de crédito'}
                                  </button>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); reemitOne(r.id, r.invoice_number); }}
                                  disabled={reemitting === r.id || r.is_note}
                                  title={r.is_note
                                    ? 'Las notas de crédito no se re-emiten: se emite una nueva desde la factura.'
                                    : 'Volver a emitir con la configuración ACTUAL del negocio (cédula, certificado, actividad) y consecutivo nuevo'}
                                  className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg disabled:opacity-50">
                                  <RefreshCw size={13} className={reemitting === r.id ? 'animate-spin' : ''} />
                                  {reemitting === r.id ? 'Re-emitiendo…' : 'Re-emitir con los datos correctos'}
                                </button>
                              </div>
                            </div>
                            {isErr && (
                              <div>
                                <p className="text-[11px] font-black text-red-600 uppercase mb-1">Error de Hacienda / FE</p>
                                <p className="text-sm text-red-700 whitespace-pre-wrap wrap-break-word">{r.fe_error || 'Sin detalle'}</p>
                              </div>
                            )}
                            {r.fe_clave && <p className="text-[10px] text-gray-400 font-mono">Clave: {r.fe_clave}</p>}
                            {r.fe_request && (
                              <details open={isErr}>
                                <summary className="text-[11px] font-black text-blue-600 uppercase cursor-pointer">JSON enviado a Hacienda</summary>
                                <pre className="mt-1 text-[11px] bg-gray-900 text-emerald-200 rounded-lg p-3 overflow-x-auto max-h-96">{JSON.stringify(r.fe_request, null, 2)}</pre>
                              </details>
                            )}
                            {r.fe_response && (
                              <details>
                                <summary className="text-[11px] font-black text-violet-600 uppercase cursor-pointer">Respuesta</summary>
                                <pre className="mt-1 text-[11px] bg-gray-900 text-sky-200 rounded-lg p-3 overflow-x-auto max-h-96">{JSON.stringify(r.fe_response, null, 2)}</pre>
                              </details>
                            )}
                            {!r.fe_request && !r.fe_response && !isErr && (
                              <p className="text-xs text-gray-400">Sin JSON guardado (se guarda al emitir después del deploy).</p>
                            )}
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

      {reemitFor && (
        <ReemitModal
          invoiceId={reemitFor.id}
          invoiceNumber={reemitFor.num}
          onClose={() => setReemitFor(null)}
          onConfirm={(consec) => void doReemit(reemitFor.id, consec)}
        />
      )}
    </div>
  );
};

/** Datos del contador para la factura que se va a re-emitir. */
interface NextConsec {
  tipo: string; sucursal: string; terminal: string;
  last_number: number; suggested: number; configured_next: number | null;
}

/**
 * Elegir con qué consecutivo se re-emite.
 *
 * Antes la re-emisión tomaba siempre «el siguiente» de la serie. Eso funciona
 * cuando la factura falló por datos malos, pero no cuando el contador quedó
 * ATRASADO respecto de lo que Hacienda ya recibió —por ejemplo si el negocio
 * emitió antes con otro sistema, o si un envío llegó y la respuesta se perdió—:
 * ahí Hacienda contesta «numeration was already used» y cada reintento vuelve a
 * pedir el mismo número quemado. La única salida es poder escribirlo a mano.
 *
 * El número que se ponga acá también ADELANTA el contador, así que las ventas
 * normales siguen desde ahí y no vuelven a chocar.
 */
const ReemitModal: React.FC<{
  invoiceId: string;
  invoiceNumber?: string;
  onClose: () => void;
  onConfirm: (consecutivo?: number) => void;
}> = ({ invoiceId, invoiceNumber, onClose, onConfirm }) => {
  const [info, setInfo] = useState<NextConsec | null>(null);
  const [value, setValue] = useState('');
  const [manual, setManual] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    apiFetch<NextConsec>(`/admin/fe-next-consecutivo/${invoiceId}`)
      .then(d => { if (alive) { setInfo(d); setValue(String(d?.suggested ?? '')); } })
      .catch(() => { /* sin contador se puede escribir igual */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [invoiceId]);

  const n = Number(value.replace(/\D/g, ''));
  const valid = !manual || (Number.isFinite(n) && n >= 1);
  const tipoLabel = info?.tipo === '01' ? 'Factura electrónica' : 'Tiquete electrónico';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900">
            Re-emitir {invoiceNumber ? `#${invoiceNumber}` : 'comprobante'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-xs space-y-1.5">
            <p>
              Se vuelve a enviar con la cédula, el certificado, la actividad económica y la empresa de
              Alanube que el negocio tiene configurados <b>ahora</b>.
            </p>
            <p>
              Si Hacienda <b>ya la aceptó</b>, anulala primero con nota de crédito: si no, quedan dos
              comprobantes válidos por la misma venta.
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-gray-400">Consultando el contador…</p>
          ) : (
            <>
              {info && (
                <div className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 space-y-1">
                  <p><b>{tipoLabel}</b> · sucursal {info.sucursal} · terminal {info.terminal}</p>
                  <p>Último emitido según el sistema: <b>{String(info.last_number).padStart(10, '0')}</b></p>
                  {info.configured_next ? (
                    <p>Mínimo configurado en Datos de FE: {String(info.configured_next).padStart(10, '0')}</p>
                  ) : null}
                </div>
              )}

              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="radio" checked={!manual} onChange={() => setManual(false)} className="mt-1" />
                <span>
                  <b>El siguiente de la serie</b>
                  {info ? <> — {String(info.suggested).padStart(10, '0')}</> : null}
                  <span className="block text-xs text-gray-500">
                    Lo normal cuando la factura falló por datos incorrectos.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="radio" checked={manual} onChange={() => setManual(true)} className="mt-1" />
                <span className="flex-1">
                  <b>Escribir el consecutivo</b>
                  <span className="block text-xs text-gray-500 mb-2">
                    Usalo si Hacienda respondió «numeration was already used»: significa que ese número
                    ya se gastó y hay que saltar al primero libre.
                  </span>
                  <input
                    type="text" inputMode="numeric"
                    value={value}
                    onChange={e => { setValue(e.target.value); setManual(true); }}
                    onFocus={() => setManual(true)}
                    placeholder="Ej. 260"
                    className="w-44 px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  {manual && n >= 1 && (
                    <span className="block text-xs text-gray-500 mt-1.5">
                      Sale como <b className="font-mono">{String(n).padStart(10, '0')}</b>.
                      El contador queda en ese número, así que la próxima venta usa el {n + 1}.
                    </span>
                  )}
                  {manual && info && n > 0 && n <= info.last_number && (
                    <span className="block text-xs text-red-600 mt-1.5">
                      ⚠️ El sistema ya usó hasta el {info.last_number}. Un número igual o menor lo más
                      probable es que Hacienda lo rechace otra vez.
                    </span>
                  )}
                </span>
              </label>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(manual ? n : undefined)}
            disabled={loading || !valid}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-black">
            Re-emitir
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeLogView;
