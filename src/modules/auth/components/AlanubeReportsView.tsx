import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, RefreshCw, Loader2, AlertTriangle, FileText, Receipt, FileMinus, FilePlus, Inbox, ShoppingCart } from 'lucide-react';
import { apiFetch } from '@/lib/api';

// Reporte de emisiones de Alanube (conteo de comprobantes por tipo), a nivel de
// cuenta/token → devuelve todas las empresas (tenants) de la cuenta del ambiente.

interface CompanyRow {
  idCompany?: string;
  companyName?: string;
  companyEmail?: string;
  invoices?: number;
  exportInvoices?: number;
  purchaseInvoices?: number;
  creditNotes?: number;
  debitNotes?: number;
  receiverMessages?: number;
  tickets?: number;
  paymentReceipts?: number;
  total?: number;
  /** Marca (del backend) para empresas registradas sin emisiones en el rango. */
  _noEmissions?: boolean;
  /** La fila vino de la cuenta de Alanube PROPIA del negocio, no de la global. */
  _ownAccount?: boolean;
}
interface UserRow {
  idUser?: string;
  userEmail?: string;
  invoices?: number;
  tickets?: number;
  creditNotes?: number;
  debitNotes?: number;
  receiverMessages?: number;
  total?: number;
}
interface ReportResp {
  env: string;
  from: string;
  until: string;
  per_company: CompanyRow[] | { error: string };
  by_user: UserRow[] | { error: string };
  /** Por qué vino vacío (403 del plan, token inválido, sin datos en el rango…). */
  diagnostico?: {
    per_company?: string | null;
    by_user?: string | null;
    cuentas_propias?: Array<{ tenants: string[]; ok: boolean; rows?: number; error?: string }>;
    token_global?: boolean;
  };
}

const n = (v: any) => Number(v || 0).toLocaleString('es-CR');

// Rango por defecto: mes actual.
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const today = () => new Date().toISOString().slice(0, 10);

const COLS: { key: keyof CompanyRow; label: string; Icon: any }[] = [
  { key: 'invoices',        label: 'Facturas',   Icon: FileText },
  { key: 'tickets',         label: 'Tiquetes',   Icon: Receipt },
  { key: 'creditNotes',     label: 'N. Créd.',   Icon: FileMinus },
  { key: 'debitNotes',      label: 'N. Déb.',    Icon: FilePlus },
  { key: 'purchaseInvoices',label: 'F. Compra',  Icon: ShoppingCart },
  { key: 'receiverMessages',label: 'Msj. Recep.',Icon: Inbox },
];

export const AlanubeReportsView: React.FC = () => {
  const [env, setEnv] = useState<'production' | 'sandbox'>('production');
  const [from, setFrom] = useState(monthStart());
  const [until, setUntil] = useState(today());
  const [legalStatus, setLegalStatus] = useState('');   // ''=todos, ACCEPTED, REJECTED
  const [data, setData] = useState<ReportResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [raw, setRaw] = useState<any>(null);   // respuesta cruda de Alanube (diagnóstico)

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams({ env, from, until });
      if (legalStatus) qs.set('legalStatus', legalStatus);
      /**
       * 28 segundos, no los 20 de siempre.
       *
       * Este reporte consulta a Alanube UNA VEZ POR CUENTA —cada negocio con
       * token propio suma una llamada— y después cruza todo contra la base. Con
       * el corte por defecto se cancelaba a mitad de camino en cuanto había
       * varios negocios. El servidor muere a los 30 s, así que 28 es lo máximo
       * que tiene sentido esperar.
       */
      setData(await apiFetch<ReportResp>(`/admin/alanube/reports/emissions?${qs.toString()}`, {}, 28_000));
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar el reporte'); }
    finally { setLoading(false); }
  }, [env, from, until, legalStatus]);
  useEffect(() => { load(); }, [load]);

  // Diagnóstico: trae la respuesta CRUDA de Alanube (debug=1) para ver los nombres
  // reales de los campos y corregir el mapeo.
  const loadRaw = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ env, from, until, debug: '1' });
      if (legalStatus) qs.set('legalStatus', legalStatus);
      const r = await apiFetch<any>(`/admin/alanube/reports/emissions?${qs.toString()}`, {}, 28_000);
      setRaw(r?.raw ?? r);
    } catch (e) { setRaw({ error: e instanceof Error ? e.message : 'error' }); }
  }, [env, from, until, legalStatus]);

  /**
   * Rescate de un comprobante que está en Alanube pero NO en la base.
   *
   * Pasa cuando la emisión salió bien y la respuesta se perdió, o cuando el
   * comprobante se emitió por otra vía con la misma cuenta. Esa venta queda
   * fuera de los reportes, del cierre y de la declaración, y no hay forma de
   * traerla sin esto.
   */
  const [impClave, setImpClave] = useState('');
  const [impTenant, setImpTenant] = useState('');
  /** Id del documento en Alanube: es el «Consecutivo» que sale en el correo. */
  const [impDocId, setImpDocId] = useState('');
  const [impCompany, setImpCompany] = useState('');
  /** Monto, por si Alanube no lo devuelve en un campo reconocible. */
  const [impTotal, setImpTotal] = useState('');
  /** Carga a mano: para comprobantes que Alanube no tiene (ATV, otro sistema). */
  const [impManual, setImpManual] = useState(false);
  const [impCliente, setImpCliente] = useState('');
  const [impFecha, setImpFecha] = useState('');
  const [impIva, setImpIva] = useState('');
  const [impNumero, setImpNumero] = useState('');
  /** Detalle de UNA empresa, consultado aparte del reporte general. */
  const [detalleEmpresa, setDetalleEmpresa] = useState<{ id: string; nombre: string; datos: any } | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState<string | null>(null);

  /**
   * Consulta el total emitido por UNA empresa.
   *
   * El reporte general trae todas las cuentas y a veces no cabe en el tiempo del
   * servidor. Este mira una sola: es rápido, y es el que sirve cuando hay que
   * cuadrar un negocio contra lo que muestra la base.
   */
  const verEmpresa = async (id: string, nombre: string) => {
    setCargandoDetalle(id);
    try {
      const qs = new URLSearchParams({ env, from, until });
      const r = await apiFetch<any>(`/admin/alanube/reports/emissions/${id}?${qs.toString()}`);
      setDetalleEmpresa({ id, nombre, datos: r });
    } catch (e) {
      setDetalleEmpresa({ id, nombre, datos: { error: e instanceof Error ? e.message : 'No se pudo consultar' } });
    } finally { setCargandoDetalle(null); }
  };
  const [impBusy, setImpBusy] = useState(false);
  const [impMsg, setImpMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /** Respuesta cruda del último «solo ver», para inspeccionar los campos. */
  const [impCrudo, setImpCrudo] = useState<any>(null);

  const importar = async (soloVer = false) => {
    const clave = impClave.replace(/\D/g, '');
    // Sin clave solo se admite la carga a mano: es una factura corriente.
    if (!impManual && clave.length !== 50) {
      setImpMsg({ ok: false, text: 'La clave debe tener 50 dígitos.' });
      return;
    }
    if (impManual && clave && clave.length !== 50) {
      setImpMsg({ ok: false, text: 'Si ponés clave, tiene que tener 50 dígitos. Dejala vacía si es una factura corriente.' });
      return;
    }
    if (impManual && !clave && !impNumero.trim()) {
      setImpMsg({ ok: false, text: 'Poné el número de la factura: sin clave y sin número no hay cómo identificarla.' });
      return;
    }
    if (!impTenant.trim()) { setImpMsg({ ok: false, text: 'Poné el id del negocio al que pertenece.' }); return; }
    setImpBusy(true); setImpMsg(null); setImpCrudo(null);
    try {
      const r = await apiFetch<any>(`/admin/tenants/${impTenant.trim()}/fe-import`, {
        method: 'POST',
        body: JSON.stringify({
          clave,
          doc_id: impDocId.trim() || undefined,
          company_id: impCompany.trim() || undefined,
          total: Number(String(impTotal).replace(/[^\d.]/g, '')) || undefined,
          preview: soloVer || undefined,
          manual: impManual && !soloVer ? true : undefined,
          tax: Number(String(impIva).replace(/[^\d.]/g, '')) || undefined,
          customer_name: impCliente.trim() || undefined,
          issued_at: impFecha || undefined,
          invoice_number: impNumero.trim() || undefined,
        }),
      });
      if (soloVer) {
        setImpCrudo(r);
        setImpMsg({ ok: true, text: `Encontrado. Monto que se leería: ₡${Math.round(Number(r?.monto_leido ?? 0)).toLocaleString('es-CR')}. Revisá abajo antes de importar.` });
        return;
      }
      setImpMsg({
        ok: true,
        text: `Registrada como factura ${r?.invoice_number ?? ''} por ₡${Math.round(Number(r?.total ?? 0)).toLocaleString('es-CR')}`
          + (r?.completada
            ? ` — se le completaron las ${r.lineas} línea(s) que le faltaban.`
            : r?.completa
              ? ` — completa, con ${r.lineas} línea(s) y el cliente del comprobante.`
              : ' — SOLO EL ENCABEZADO: no se pudo bajar el XML, así que quedó sin el detalle de productos.'
                + ' Volvé a importarla más tarde y se le agregan las líneas.'),
      });
      setImpClave('');
    } catch (e: any) {
      // El detalle de cada intento viaja en el cuerpo del error: sin mostrarlo,
      // «no se encontró» no dice dónde se buscó ni qué falta configurar.
      const cuerpo = e?.body;
      const detalle = Array.isArray(cuerpo?.intentos)
        ? '\n\n' + cuerpo.intentos.map((x: any) => `· ${x.cuenta} · empresa ${x.empresa}: ${x.error}`).join('\n')
        : '';
      setImpMsg({
        ok: false,
        text: (cuerpo?.error ?? (e instanceof Error ? e.message : 'No se pudo importar'))
          + (cuerpo?.pista ? `\n\n${cuerpo.pista}` : '') + detalle,
      });
    } finally { setImpBusy(false); }
  };

  const companies = Array.isArray(data?.per_company) ? data!.per_company as CompanyRow[] : [];
  const users = Array.isArray(data?.by_user) ? data!.by_user as UserRow[] : [];
  const companyErr = !Array.isArray(data?.per_company) ? (data?.per_company as any)?.error : null;
  const userErr = !Array.isArray(data?.by_user) ? (data?.by_user as any)?.error : null;

  // Totales agregados de todas las empresas.
  const totals = companies.reduce((acc, r) => {
    for (const c of COLS) acc[c.key] = (acc[c.key] ?? 0) + Number(r[c.key] || 0);
    acc.total = (acc.total ?? 0) + Number(r.total || 0);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
          <BarChart3 size={22} className="text-white" />
        </div>
        <div>
          <h2 className="text-lg font-black text-gray-900">Reportes Alanube</h2>
          <p className="text-sm text-gray-500">Comprobantes emitidos por empresa y por usuario.</p>
        </div>
        <button onClick={loadRaw}
          title="Ver la respuesta cruda de Alanube (para diagnosticar el mapeo de campos)"
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 text-sm font-bold">
          <FileText size={15} /> Ver respuesta cruda
        </button>
        <button onClick={load} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 text-sm font-bold disabled:opacity-50">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {/* Rescatar un comprobante que Alanube tiene y la base no */}
      <details className="bg-white border-2 border-gray-200 rounded-2xl px-4 py-3">
        <summary className="text-sm font-black text-gray-800 cursor-pointer">
          Importar un comprobante por su clave
        </summary>
        <p className="text-xs font-semibold text-gray-500 mt-2">
          Para comprobantes que están en Hacienda pero no en el sistema: la emisión salió bien y la
          respuesta se perdió, o se emitió por otra vía con esta misma cuenta. Sin esto, esa venta
          no aparece en reportes ni en la declaración.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input value={impClave} onChange={e => setImpClave(e.target.value)}
            placeholder={impManual ? 'Clave (vacía si es corriente)' : 'Clave de 50 dígitos'}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono outline-none focus:border-indigo-400" />
          <input value={impTenant} onChange={e => setImpTenant(e.target.value)}
            placeholder="Id del negocio"
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono outline-none focus:border-indigo-400" />
          <input value={impDocId} onChange={e => setImpDocId(e.target.value)}
            placeholder="Consecutivo de Alanube (el del correo) — opcional pero recomendado"
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono outline-none focus:border-indigo-400" />
          <input value={impCompany} onChange={e => setImpCompany(e.target.value)}
            placeholder="company_id (solo si se emitió con otra empresa)"
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono outline-none focus:border-indigo-400" />
          <input value={impTotal} onChange={e => setImpTotal(e.target.value)}
            placeholder="Monto total (solo si Alanube no lo devuelve)" inputMode="decimal"
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" />
        </div>
        {/* Carga a mano: última salida cuando el comprobante no está en Alanube
            —emitido desde el ATV o desde otro sistema—. Sin esto, esas ventas
            quedaban fuera de los reportes para siempre. */}
        <label className="mt-2 flex items-center gap-2 text-xs font-bold text-gray-600">
          <input type="checkbox" checked={impManual} onChange={e => setImpManual(e.target.checked)}
            className="w-4 h-4 rounded" />
          Cargarla a mano (Alanube no la tiene)
        </label>
        {impManual && (
          <p className="mt-1 text-[11px] font-semibold text-gray-500">
            Dejá la <b>clave vacía</b> si es una factura <b>corriente</b> —sin comprobante electrónico—.
            Con clave se registra como electrónica.
          </p>
        )}
        {impManual && (
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <input value={impNumero} onChange={e => setImpNumero(e.target.value)}
              placeholder="N° de factura"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" />
            <input value={impCliente} onChange={e => setImpCliente(e.target.value)} placeholder="Cliente"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" />
            <input type="date" value={impFecha} onChange={e => setImpFecha(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" />
            <input value={impIva} onChange={e => setImpIva(e.target.value)} placeholder="IVA (opcional)" inputMode="decimal"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" />
          </div>
        )}

        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {/* Mirar antes de comprometerse: importar deja la venta en reportes y
              en la declaración, y deshacerlo es a mano. */}
          <button onClick={() => void importar(true)} disabled={impBusy || impManual}
            className="px-4 py-2 rounded-lg border-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50
                       disabled:opacity-50 text-sm font-black">
            Solo ver (no registra)
          </button>
          <button onClick={() => void importar(false)} disabled={impBusy}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200
                       disabled:text-gray-400 text-white text-sm font-black">
            {impBusy ? 'Buscando en Alanube…' : 'Buscar e importar'}
          </button>
        </div>
        {impCrudo && (
          <pre className="mt-2 max-h-72 overflow-auto bg-gray-900 text-gray-100 rounded-lg p-3 text-[11px] leading-relaxed">
            {JSON.stringify(impCrudo, null, 2)}
          </pre>
        )}
        {impMsg && (
          <p className={`mt-2 text-xs font-bold whitespace-pre-wrap ${impMsg.ok ? 'text-emerald-700' : 'text-red-600'}`}>
            {impMsg.text}
          </p>
        )}
        <p className="mt-2 text-[11px] font-semibold text-gray-400">
          No se importa dos veces la misma clave, y la venta NO entra en ninguna caja: no ocurrió en
          una sesión de este sistema y metería ruido en un arqueo ya cerrado.
        </p>
      </details>

      {/* Detalle de una empresa */}
      {detalleEmpresa && (
        <div className="bg-white border-2 border-indigo-200 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-black text-gray-900">
              {detalleEmpresa.nombre || 'Empresa'}
              <span className="block text-[11px] font-mono font-normal text-gray-400">{detalleEmpresa.id}</span>
            </p>
            <button onClick={() => setDetalleEmpresa(null)} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <pre className="mt-2 max-h-72 overflow-auto bg-gray-900 text-gray-100 rounded-lg p-3 text-[11px] leading-relaxed">
            {JSON.stringify(detalleEmpresa.datos, null, 2)}
          </pre>
        </div>
      )}

      {/* Panel de diagnóstico: respuesta CRUDA de Alanube */}
      {raw && (
        <div className="bg-gray-900 rounded-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-emerald-300 uppercase tracking-wider">Respuesta cruda de Alanube (diagnóstico)</span>
            <button onClick={() => setRaw(null)} className="text-xs text-gray-400 hover:text-gray-200">cerrar ✕</button>
          </div>
          <pre className="text-[11px] leading-relaxed text-emerald-200 overflow-auto max-h-96 whitespace-pre-wrap wrap-break-word">{JSON.stringify(raw, null, 2)}</pre>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Ambiente</label>
          <select value={env} onChange={e => setEnv(e.target.value as any)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="production">Producción</option>
            <option value="sandbox">QA / Pruebas</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Desde</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} max={until || undefined}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Hasta</label>
          <input type="date" value={until} onChange={e => setUntil(e.target.value)} min={from || undefined}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Estado Hacienda</label>
          <select value={legalStatus} onChange={e => setLegalStatus(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="">Todos</option>
            <option value="ACCEPTED">Aceptados</option>
            <option value="REJECTED">Rechazados</option>
          </select>
        </div>
        <span className="ml-auto text-xs text-gray-400 self-center">{companies.length} empresa(s)</span>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>}
      {companyErr && <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl px-4 py-3">Reporte por empresa no disponible: {companyErr}</div>}

      {/* Tarjetas resumen */}
      {!loading && companies.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {COLS.map(c => (
            <div key={c.key} className="bg-white border border-gray-100 rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-gray-400 text-[11px] font-bold uppercase"><c.Icon size={13} /> {c.label}</div>
              <div className="text-xl font-black text-gray-900 tabular-nums">{n(totals[c.key])}</div>
            </div>
          ))}
          <div className="bg-indigo-600 rounded-xl px-3 py-2.5 text-white">
            <div className="text-[11px] font-bold uppercase opacity-80">Total</div>
            <div className="text-xl font-black tabular-nums">{n(totals.total)}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-14 text-gray-400 gap-2"><Loader2 size={18} className="animate-spin" /> Cargando reporte…</div>
      ) : companies.length === 0 && !companyErr ? (
        <div className="bg-white border border-gray-100 rounded-2xl text-center py-14 px-6">
          <p className="text-gray-400">Sin emisiones en el rango seleccionado</p>
          {/* El motivo importa: un 403 del plan o un token inválido se veían igual
              que "no hubo ventas", y no había forma de distinguirlos. */}
          {(data?.diagnostico?.per_company || data?.diagnostico?.token_global === false) && (
            <div className="mt-4 inline-block text-left text-[11px] bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-800 max-w-lg">
              <p className="font-black mb-1">Puede no ser que no haya ventas:</p>
              {data?.diagnostico?.token_global === false && (
                <p>• No hay token de Alanube configurado en el servidor para <b>{data?.env}</b>.</p>
              )}
              {data?.diagnostico?.per_company && <p>• {data.diagnostico.per_company}</p>}
              {(data?.diagnostico?.cuentas_propias ?? []).filter(x => !x.ok).map((x, i) => (
                <p key={i}>• Cuenta propia de {x.tenants.length} negocio(s): {x.error}</p>
              ))}
            </div>
          )}
        </div>
      ) : companies.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-black text-gray-700">Por empresa</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase">Empresa</th>
                  {COLS.map(c => <th key={c.key} className="px-3 py-2.5 text-right text-[11px] font-bold text-gray-500 uppercase">{c.label}</th>)}
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold text-gray-700 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {companies.map((r, i) => (
                  <tr key={r.idCompany ?? i} className={`hover:bg-gray-50 ${r._noEmissions ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-2.5">
                      <div className="font-bold text-gray-800 flex items-center gap-2">
                        {r.companyName ?? '—'}
                        {r._noEmissions && (
                          <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">sin emisiones</span>
                        )}
                      </div>
                      {r.companyEmail && <div className="text-[11px] text-gray-400">{r.companyEmail}</div>}
                      {r.idCompany && (
                        <button onClick={() => void verEmpresa(r.idCompany!, r.companyName ?? '')}
                          disabled={cargandoDetalle === r.idCompany}
                          className="mt-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 disabled:opacity-50">
                          {cargandoDetalle === r.idCompany ? 'Consultando…' : 'Ver detalle de esta empresa'}
                        </button>
                      )}
                    </td>
                    {COLS.map(c => <td key={c.key} className="px-3 py-2.5 text-right tabular-nums text-gray-700">{n(r[c.key])}</td>)}
                    <td className="px-4 py-2.5 text-right font-black tabular-nums text-gray-900">{n(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reporte por usuario no disponible (plan/token de Alanube). */}
      {!loading && userErr && (
        <div className="bg-gray-50 border border-gray-200 text-gray-500 text-sm rounded-xl px-4 py-3">
          El reporte <b>por usuario</b> no está habilitado en tu cuenta de Alanube{/Forbidden/i.test(String(userErr)) ? '' : `: ${userErr}`}.
        </div>
      )}

      {/* Por usuario */}
      {!loading && users.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-black text-gray-700">Por usuario</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase">Usuario</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-bold text-gray-500 uppercase">Facturas</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-bold text-gray-500 uppercase">Tiquetes</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-bold text-gray-500 uppercase">N. Créd.</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-bold text-gray-500 uppercase">N. Déb.</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold text-gray-700 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((u, i) => (
                  <tr key={u.idUser ?? i} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-bold text-gray-800">{u.userEmail ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{n(u.invoices)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{n(u.tickets)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{n(u.creditNotes)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{n(u.debitNotes)}</td>
                    <td className="px-4 py-2.5 text-right font-black tabular-nums text-gray-900">{n(u.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlanubeReportsView;
