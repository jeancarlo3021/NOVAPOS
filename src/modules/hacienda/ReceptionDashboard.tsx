import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, RefreshCw, Loader2, CheckCircle2, XCircle, ChevronLeft, AlertTriangle, Plus, X, Upload, Mail, Clock } from 'lucide-react';
import { useVisiblePolling } from '@/hooks/useVisiblePolling';
import { haciendaService, type ReceivedDoc } from '@/services/hacienda/haciendaService';
import { useTenantId } from '@/hooks/useTenant';
import { expenseCategoriesService } from '@/services/expenses/expensesService';
import type { ExpenseCategory } from '@/types/Types_Expenses';
import ExpenseFormModal from '@/modules/expenses/components/ExpenseFormModal';
import { PurchaseMatchModal } from './PurchaseMatchModal';
import { useAuth } from '@/context/AuthContext';

const fmt = (n: number) => `₡${Number(n ?? 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const { planFeatures } = useAuth();
  // ¿El plan permite clasificar en compras / gastos? Si no, la bandeja solo sirve
  // para Aceptar/Rechazar los comprobantes ante Hacienda.
  const canCompra = !!(planFeatures as any)?.purchases;
  const canGasto  = !!(planFeatures as any)?.expenses;
  const canClassify = canCompra || canGasto;
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
  /** Nota de crédito esperando confirmación (devuelve producto o es descuento). */
  const [ncFor, setNcFor] = useState<ReceivedDoc | null>(null);
  const [compraFor, setCompraFor] = useState<ReceivedDoc | null>(null);
  const [ackFor, setAckFor] = useState<ReceivedDoc | null>(null);
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

  // ── Timer: el cron lee el correo cada 15 min (en :00, :15, :30, :45).
  // Mostramos la cuenta regresiva al próximo escaneo y refrescamos la bandeja
  // automáticamente cuando el reloj cruza ese punto.
  const [secsLeft, setSecsLeft] = useState(0);
  const prevSecsRef = useRef<number | null>(null);
  const secsToNextQuarter = () => {
    const now = new Date();
    const next = new Date(now);
    next.setMinutes((Math.floor(now.getMinutes() / 15) + 1) * 15, 0, 0);
    return Math.max(0, Math.round((next.getTime() - now.getTime()) / 1000));
  };
  // Cuenta regresiva al próximo cron (15 min). Se pausa con la pestaña oculta; al
  // volver, si cruzó un múltiplo de 15 (el contador saltó hacia arriba) refresca.
  useVisiblePolling(() => {
    const s = secsToNextQuarter();
    const prev = prevSecsRef.current;
    if (prev != null && s > prev + 5) load();
    prevSecsRef.current = s;
    setSecsLeft(s);
  }, 1000);
  const mmss = `${String(Math.floor(secsLeft / 60)).padStart(2, '0')}:${String(secsLeft % 60).padStart(2, '0')}`;

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

  // Detalle de compra: abre el modal para relacionar/crear la ORDEN DE COMPRA,
  // comparar los items y actualizar CABYS/precio. Es opcional: la mayoría de los
  // negocios no lleva órdenes de compra y solo necesita la etiqueta.
  const asCompra = (row: ReceivedDoc) => setCompraFor(row);

  /**
   * Marca el comprobante como COMPRA sin más trámite.
   *
   * No crea orden de compra ni toca inventario: para casi todos los negocios una
   * factura de proveedor es simplemente una compra, y obligarlos a armar una
   * orden por cada una era trabajo sin beneficio. Quien sí las lleva tiene el
   * botón «Orden» al lado.
   */
  /**
   * ¿Es una NOTA DE CRÉDITO del proveedor?
   *
   * El tipo va embebido en la clave de Hacienda (posiciones 30-31) y se guarda
   * al recibir el XML: 01 factura · 02 nota de débito · 03 nota de crédito.
   * No hace falta leer el XML otra vez ni que nadie la clasifique a mano.
   */
  const esNotaCredito = (r: ReceivedDoc) =>
    String(r.document_type ?? '') === '03'
    || String(r.clave ?? '').slice(29, 31) === '03';

  /**
   * Acepta una nota de crédito.
   *
   * NO abre el flujo de compra: una nota de crédito no trae mercadería que
   * ingresar ni productos que crear — es plata que el proveedor devuelve o un
   * descuento posterior. Lo único que hace es RESTAR crédito fiscal, y eso lo
   * calcula el reporte de impuestos a partir del tipo de documento.
   *
   * Armarle una orden de compra sumaría inventario que nunca llegó.
   */
  const aceptarNotaCredito = async (row: ReceivedDoc, restock: boolean) => {
    setNcFor(null);
    setBusyId(row.id);
    try {
      const r = await haciendaService.acceptCreditNote(row.id, restock);
      setRows(prev => prev.map(x => x.id === row.id ? { ...x, kind: 'compra' } : x));
      alert((r.messages ?? ['Nota de crédito aceptada']).join('\n'));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo aceptar la nota de crédito');
    } finally { setBusyId(null); }
  };

  const marcarCompra = async (row: ReceivedDoc) => {
    setBusyId(row.id);
    try {
      await haciendaService.classifyReceived(row.id, 'compra');
      setRows(prev => prev.map(x => x.id === row.id ? { ...x, kind: 'compra' } : x));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo marcar como compra');
    } finally { setBusyId(null); }
  };

  /** Marca de una vez todas las que quedaron sin categorizar. */
  const [bulking, setBulking] = useState(false);
  const pendingKind = rows.filter(r => !r.kind).length;
  const marcarTodas = async () => {
    if (pendingKind === 0) return;
    if (!confirm(
      `Se van a marcar ${pendingKind} comprobante(s) como COMPRA.\n\n`
      + 'Solo se les pone la etiqueta: no se crean órdenes de compra, no se toca '
      + 'el inventario y no se confirma nada ante Hacienda.\n\n¿Continuar?'
    )) return;
    setBulking(true);
    try {
      const res = await haciendaService.classifyAllReceived('compra');
      setRows(prev => prev.map(x => x.kind ? x : { ...x, kind: 'compra' }));
      alert(`${res.updated} comprobante(s) marcados como compra.`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudieron marcar');
    } finally { setBulking(false); }
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

  // Confirmación (Aceptar/Rechazar ante Hacienda) — ahora vía modal.
  const doConfirm = async (row: ReceivedDoc, state: '1' | '3', reason?: string) => {
    setBusyId(row.id);
    try {
      await haciendaService.confirmReceived(row.id, state, reason || undefined);
      setRows(prev => prev.map(x => x.id === row.id ? { ...x, ack_status: state === '1' ? 'accepted' : 'rejected' } : x));
      setAckFor(null);
      load();   // refrescar: al aceptar se crearon productos y se actualizó la compra
    } catch (e) { throw e instanceof Error ? e : new Error('No se pudo enviar la confirmación'); }
    finally { setBusyId(null); }
  };

  const ackBadge = (s?: string | null, ackId?: string | null) => {
    const t = String(s ?? '').toLowerCase();
    // Aceptado en el sistema pero SIN mensaje receptor enviado: el crédito fiscal
    // no está declarado ante Hacienda y nadie se enteraba.
    if ((t.includes('accept') || t === '1') && !ackId) {
      return (
        <span title="Se aceptó en el sistema, pero el Mensaje Receptor no se envió a Hacienda"
          className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
          <CheckCircle2 size={11} /> Aceptado · sin enviar
        </span>
      );
    }
    if (t.includes('accept') || t === '1') return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full"><CheckCircle2 size={11} /> Aceptado</span>;
    if (t.includes('reject') || t === '3') return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full"><XCircle size={11} /> Rechazado</span>;
    return <span className="inline-flex items-center text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Pendiente</span>;
  };
  const isPending = (s?: string | null) => {
    const t = String(s ?? '').toLowerCase();
    return !(t.includes('accept') || t.includes('reject') || t === '1' || t === '3');
  };

  return (
    <div className="max-w-full xl:max-w-400 mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/fe-facturas')} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50" title="Volver">
          <ChevronLeft size={18} />
        </button>
        <div className="w-11 h-11 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
          <Inbox size={22} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-black text-gray-900">Recepción de comprobantes</h1>
          <p className="text-sm text-gray-500">Las facturas de compra llegan <b>automáticamente por correo</b> (se leen cada 15 min) y se registran como borrador de compra. También podés subir un XML a mano.</p>
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
        {canCompra && pendingKind > 0 && (
          <button onClick={marcarTodas} disabled={bulking}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50"
            title="Marcar como compra todas las que están sin categorizar">
            {bulking ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            Marcar {pendingKind} como compra
          </button>
        )}
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50" title="Actualizar">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Banner: correo de recepción + timer del próximo escaneo */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex-1 flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
          <Mail size={20} className="text-indigo-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-indigo-900 font-bold">Enviá o reenviá tus facturas de compra a este correo:</p>
            <p className="text-base font-black text-indigo-700 select-all break-all">facturas@colonclick.com</p>
          </div>
          <button
            onClick={() => { navigator.clipboard?.writeText('facturas@colonclick.com'); }}
            className="ml-auto shrink-0 text-xs font-bold text-indigo-600 border border-indigo-200 rounded-lg px-2.5 py-1.5 hover:bg-indigo-100"
          >
            Copiar
          </button>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 shrink-0">
          <Clock size={18} className="text-emerald-600" />
          <div className="leading-tight">
            <p className="text-[11px] text-gray-500 font-bold uppercase">Próxima lectura</p>
            <p className="text-lg font-black text-gray-900 tabular-nums">{mmss}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-5 py-4 flex items-start gap-2">
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
            <table className="w-full text-base">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Emisor', 'Tipo', 'Fecha', 'Total', 'Clasificación', 'Estado', 'Acciones'].map(h => (
                    <th key={h} className={`px-5 py-4 text-xs font-bold text-gray-500 uppercase ${h === 'Total' ? 'text-right' : h === 'Acciones' ? 'text-center' : 'text-left'}`}>{h}</th>
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
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        {nItems > 0 && (
                          <span className="text-gray-400 text-xs font-black w-4">{isOpen ? '▾' : '▸'}</span>
                        )}
                        <div>
                          <div className="font-bold text-gray-800 max-w-sm truncate flex items-center gap-1.5">
                            {r.issuer_name ?? '—'}
                            {/* Una NC entre facturas se pasa por alto y se
                                termina aceptando como compra, sumando crédito
                                fiscal en vez de restarlo. Va marcada. */}
                            {esNotaCredito(r) && (
                              <span className="inline-flex items-center text-[9px] font-black text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded-full uppercase"
                                title="Nota de crédito: resta crédito fiscal, no ingresa mercadería">↩ nota de crédito</span>
                            )}
                            {r.source === 'email' && (
                              <span className="inline-flex items-center text-[9px] font-black text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded-full uppercase" title={r.email_from ?? 'Recibido por correo'}>📧 correo</span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-400 font-mono truncate max-w-sm">
                            {r.issuer_id ?? r.clave ?? ''}{nItems > 0 ? ` · ${nItems} art.` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs">{docTypeLabel(r.document_type)}</td>
                    <td className="px-5 py-4 text-gray-600 text-xs">{r.date ? String(r.date).slice(0, 10) : '—'}</td>
                    <td className="px-5 py-4 text-right font-bold text-gray-900">{fmt(r.total)}</td>
                    <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                      {/* Sin compras ni gastos en el plan: la bandeja es solo para aceptar/rechazar. */}
                      {!canClassify ? (
                        <span className="text-[11px] text-gray-300">—</span>
                      ) : esNotaCredito(r) ? (
                        // Nota de crédito: un solo botón. No hay orden de compra
                        // que armar ni productos que crear — solo resta crédito
                        // fiscal, y eso sale del tipo de documento.
                        r.kind ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black text-rose-700 bg-rose-50 border border-rose-200">
                            ↩ NC aceptada · resta crédito
                          </span>
                        ) : (
                          <button onClick={() => setNcFor(r)} disabled={busyId === r.id}
                            title="Aceptar la nota de crédito: resta el crédito fiscal del período"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-black text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50">
                            ↩ Aceptar nota de crédito
                          </button>
                        )
                      ) : r.kind === 'compra' ? (
                        // Ya confirmado como compra → ver la orden y RECARGAR sus items
                        // (útil si la factura ya se aceptó y la orden quedó incompleta).
                        <div className="inline-flex items-center gap-1">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black text-blue-700 bg-blue-50 border border-blue-200">
                            🧾 {(r as any).purchase_number ?? 'Compra'}
                          </span>
                          {/* La orden de compra es opcional: solo se ofrece armarla
                              o recargarla a quien de verdad las lleva. */}
                          <button onClick={() => asCompra(r)}
                            title={(r as any).purchase_number ? 'Ver o recargar la orden de compra' : 'Armar la orden de compra (opcional)'}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50">
                            <RefreshCw size={11} /> {(r as any).purchase_number ? 'Recargar' : 'Orden'}
                          </button>
                        </div>
                      ) : r.kind === 'gasto' ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-black text-amber-700 bg-amber-50 border border-amber-200">Gasto</span>
                      ) : (
                        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                          {canCompra && (
                            <button onClick={() => marcarCompra(r)} disabled={busyId === r.id}
                              title="Marcar como compra (sin orden de compra)"
                              className="px-2 py-1 text-[11px] font-bold bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50">Compra</button>
                          )}
                          {canCompra && (
                            <button onClick={() => asCompra(r)} disabled={busyId === r.id}
                              title="Armar la orden de compra con inventario (opcional)"
                              className="px-2 py-1 text-[11px] font-bold bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 border-l border-gray-200">Orden</button>
                          )}
                          {canGasto && (
                            <button onClick={() => asGasto(r)}
                              className={`px-2 py-1 text-[11px] font-bold bg-white text-gray-500 hover:bg-gray-50 ${canCompra ? 'border-l border-gray-200' : ''}`}>Gasto</button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">{ackBadge(r.ack_status, r.ack_id)}</td>
                    <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        {isPending(r.ack_status) ? (
                          <button onClick={() => setAckFor(r)} disabled={busyId === r.id}
                            className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg text-indigo-700 border border-indigo-300 bg-white hover:bg-indigo-600 hover:text-white disabled:opacity-50">
                            <CheckCircle2 size={12} /> Aceptar / Rechazar
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">Confirmado</span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isOpen && nItems > 0 && (
                    <tr className="bg-gray-50/60">
                      <td colSpan={7} className="px-6 py-3">
                        {/* Clasificación clara por factura: gasto vs compra. */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <p className="text-[11px] font-black text-gray-500 uppercase">
                            {r.kind === 'compra' ? 'Productos de la compra' : r.kind === 'gasto' ? 'Detalle del gasto' : 'Artículos del comprobante'}
                          </p>
                          {r.kind === 'compra' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">🧾 COMPRA{r.purchase_number ? ` · ${r.purchase_number}` : ''}</span>
                          ) : r.kind === 'gasto' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">💸 GASTO · no crea productos</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Sin clasificar</span>
                          )}
                          <span className="text-[10px] text-gray-400">{nItems} art.</span>
                        </div>
                        <div className="rounded-lg border border-gray-100 overflow-hidden bg-white">
                          {r.items!.map((it, i) => (
                            <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-xs border-b border-gray-50 last:border-0">
                              {r.kind === 'compra' && (
                                <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">PRODUCTO</span>
                              )}
                              <span className="flex-1 text-gray-800">{it.detail || '—'}</span>
                              {it.cabys && <span className="text-gray-300 font-mono text-[10px] hidden sm:inline">{it.cabys}</span>}
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

      {/* Nota de crédito: hay que preguntar, no asumir.
          Devolvió mercadería → sale del inventario.
          Fue un descuento posterior → el producto se quedó y restar existencias
          inventaría un faltante que no existe. */}
      {ncFor && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setNcFor(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-black text-gray-900">Aceptar nota de crédito</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {ncFor.issuer_name} · {fmt(ncFor.total)}
              </p>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-700">
                En los dos casos <b>resta {fmt(ncFor.total)} del crédito fiscal</b> del período.
                Lo que cambia es el inventario:
              </p>
              <button onClick={() => void aceptarNotaCredito(ncFor, true)} disabled={busyId === ncFor.id}
                className="w-full text-left rounded-xl border-2 border-rose-300 bg-rose-50 hover:bg-rose-100 px-4 py-3 disabled:opacity-50">
                <p className="font-black text-rose-900 text-sm">Devolví mercadería</p>
                <p className="text-[11px] text-rose-700 leading-snug">
                  Sale del inventario lo que trae la nota. Queda registrado con motivo en los
                  movimientos de stock.
                </p>
              </button>
              <button onClick={() => void aceptarNotaCredito(ncFor, false)} disabled={busyId === ncFor.id}
                className="w-full text-left rounded-xl border-2 border-gray-200 hover:border-gray-300 px-4 py-3 disabled:opacity-50">
                <p className="font-black text-gray-900 text-sm">Fue solo un descuento</p>
                <p className="text-[11px] text-gray-500 leading-snug">
                  La mercadería se quedó. No se toca el inventario.
                </p>
              </button>
              <button onClick={() => setNcFor(null)}
                className="w-full py-2 rounded-lg text-sm font-bold text-gray-500 hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdd && <RegisterModal onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); load(); }} />}

      {compraFor && (
        <PurchaseMatchModal
          receivedId={compraFor.id}
          onClose={() => setCompraFor(null)}
          onDone={() => {
            setRows(prev => prev.map(x => x.id === compraFor.id ? { ...x, kind: 'compra' } : x));
            setCompraFor(null);
            load();
          }}
        />
      )}

      {ackFor && (
        <AckModal
          row={ackFor}
          busy={busyId === ackFor.id}
          onClose={() => setAckFor(null)}
          onConfirm={doConfirm}
        />
      )}

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

// ── Modal de Aceptación / Rechazo ante Hacienda ──────────────────────────────
function AckModal({ row, busy, onClose, onConfirm }: {
  row: ReceivedDoc;
  busy: boolean;
  onClose: () => void;
  onConfirm: (row: ReceivedDoc, state: '1' | '3', reason?: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'1' | '3'>('1');
  const [reason, setReason] = useState('Comprobante no corresponde');
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    try {
      await onConfirm(row, mode, mode === '3' ? reason : undefined);
    } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo enviar'); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-black text-gray-900">Responder a Hacienda</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm">
            <p className="text-gray-500">Comprobante de</p>
            <p className="font-black text-gray-900">{row.issuer_name ?? 'Proveedor'}</p>
            <p className="text-gray-600">Total: <b>{fmt(row.total)}</b></p>
          </div>
          {/* Selector Aceptar / Rechazar */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setMode('1')}
              className={`flex items-center justify-center gap-1.5 py-3 rounded-xl border-2 font-black text-sm transition ${mode === '1' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500'}`}>
              <CheckCircle2 size={16} /> Aceptar
            </button>
            <button onClick={() => setMode('3')}
              className={`flex items-center justify-center gap-1.5 py-3 rounded-xl border-2 font-black text-sm transition ${mode === '3' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500'}`}>
              <XCircle size={16} /> Rechazar
            </button>
          </div>
          {mode === '3' && (
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Motivo del rechazo</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
            </div>
          )}
          {mode === '1' && (
            <p className="text-xs text-gray-500">Se enviará la <b>aceptación total</b> del comprobante a Hacienda.</p>
          )}
          {err && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{err}</div>}
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-sm">Cancelar</button>
          <button onClick={submit} disabled={busy || (mode === '3' && !reason.trim())}
            className={`flex-1 flex items-center justify-center gap-2 text-white font-bold py-2.5 rounded-xl text-sm disabled:bg-gray-300 ${mode === '1' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
            {busy ? <><Loader2 size={15} className="animate-spin" /> Enviando…</> : (mode === '1' ? 'Aceptar comprobante' : 'Rechazar comprobante')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReceptionDashboard;
