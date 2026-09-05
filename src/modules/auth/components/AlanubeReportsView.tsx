import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3, RefreshCw, Loader2, AlertTriangle, FileText, Receipt, FileMinus, FilePlus, Inbox, ShoppingCart } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { leerPdfComprobante } from '@/utils/leerPdfComprobante';

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
  /** Negocio dueño de esa cuenta propia: hay que consultarla con SU token. */
  _tenantId?: string | null;
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
  const [detalleEmpresa, setDetalleEmpresa] = useState<
    { id: string; nombre: string; datos: any; rango?: { from: string; until: string } } | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState<string | null>(null);
  /**
   * Búsqueda directa por id de empresa.
   *
   * El reporte general solo lista lo que alcanzó a traer dentro del plazo, y una
   * empresa en la cuenta propia de un negocio puede no aparecer del todo. Con el
   * id a mano se consulta igual, sin depender de que salga en la tabla.
   */
  const [buscaId, setBuscaId] = useState('');
  const [buscaTenant, setBuscaTenant] = useState('');
  /**
   * Rango PROPIO de la búsqueda por empresa.
   *
   * Compartir el rango de arriba obligaba a recargar el reporte general —que
   * consulta todas las cuentas y tarda— cada vez que se quería mirar otro mes de
   * una sola empresa. Arranca con las mismas fechas y de ahí se mueve solo.
   */
  const [buscaFrom, setBuscaFrom] = useState(from);
  const [buscaUntil, setBuscaUntil] = useState(until);

  /**
   * Comprobantes emitidos a un CLIENTE, con su clave.
   *
   * El reporte dice cuántos comprobantes hay en Hacienda, pero no cuáles, y para
   * importar uno hace falta su clave. Alanube solo permite listarlos por
   * receptor, así que se busca por la cédula del cliente y acá se marca cuáles
   * ya están en la base: lo que queda sin marcar es lo que hay que importar.
   */
  /**
   * El importador vive en un bloque PLEGABLE y arriba de esta lista.
   *
   * Al mandar una clave desde un resultado se llenaban campos que estaban
   * cerrados y fuera de pantalla: parecía que el botón no hacía nada. Con la
   * referencia se abre y se lleva a la vista, que es lo que el clic promete.
   */
  const importadorRef = useRef<HTMLDetailsElement>(null);
  const [recienLlenado, setRecienLlenado] = useState(false);

  /**
   * Cargar los datos desde el PDF que manda Alanube.
   *
   * De muchas facturas que no quedaron en la base, lo único que sobrevive es el
   * PDF del correo. Transcribir a mano una clave de 50 dígitos partida en varias
   * líneas es lento y un solo dígito mal la vuelve inservible.
   */
  const [pdfBusy, setPdfBusy] = useState(false);
  /** Líneas leídas del PDF: viajan con la carga a mano. */
  const [pdfLineas, setPdfLineas] = useState<any[]>([]);
  const cargarDesdePdf = async (file: File | null | undefined) => {
    if (!file) return;
    setPdfBusy(true); setImpMsg(null);
    try {
      const d = await leerPdfComprobante(file);
      if (!d.clave) {
        setImpMsg({
          ok: false,
          text: 'No se encontró una clave de 50 dígitos en ese PDF. '
            + 'Si es un comprobante corriente (sin clave), usá «Cargarla a mano».',
        });
        return;
      }
      setImpClave(d.clave);
      if (d.total != null) setImpTotal(String(d.total));
      if (d.iva != null) setImpIva(String(d.iva));
      if (d.fecha) setImpFecha(d.fecha);
      if (d.cliente) setImpCliente(d.cliente);
      setPdfLineas(d.lineas);
      /**
       * Con líneas leídas, se importa A MANO.
       *
       * Alanube no entrega el detalle a partir de la clave, así que la vía
       * normal dejaría la factura sin productos. El PDF sí los trae: cargarla a
       * mano con esas líneas es lo que la deja completa.
       */
      setImpManual(d.lineas.length > 0);
      setRecienLlenado(true);
      setTimeout(() => setRecienLlenado(false), 2000);
      setImpMsg({
        ok: true,
        text: `Leído del PDF: comprobante #${Number(d.consecutivo)} del ${d.fecha}`
          + `${d.total != null ? ` por ₡${d.total.toLocaleString('es-CR')}` : ''}`
          + (d.lineas.length > 0
            ? ` con ${d.lineas.length} línea(s) de detalle. Revisá el negocio y dale a importar.`
            : '. NO se pudieron leer las líneas de productos del PDF: '
              + 'se va a importar solo el encabezado.'),
      });
    } catch (e) {
      setImpMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo leer el PDF' });
    } finally { setPdfBusy(false); }
  };
  const usarParaImportar = (clave: string, tenant: string) => {
    setImpClave(clave);
    setImpTenant(tenant);
    setImpManual(false);
    setImpMsg(null);
    const d = importadorRef.current;
    if (d) {
      d.open = true;
      d.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // Resalte corto: después del salto hay que poder ver QUÉ campo cambió.
    setRecienLlenado(true);
    setTimeout(() => setRecienLlenado(false), 2000);
  };

  /**
   * Importa un comprobante de la lista DIRECTO, sin pasar por el formulario.
   *
   * La clave ya está a la vista y el negocio también: mandar al usuario a copiar
   * la clave a otro recuadro y llenar campos era trabajo inventado. Con 25
   * facturas que recuperar, cada paso de más se multiplica por 25.
   */
  const [impFila, setImpFila] = useState<string | null>(null);
  const [resFila, setResFila] = useState<Record<string, { ok: boolean; text: string }>>({});

  const importarFila = async (doc: any) => {
    const clave = String(doc.clave);
    const negocio = buscaTenant.trim();
    if (!negocio) {
      setResFila(p => ({ ...p, [clave]: { ok: false, text: 'Falta el «Id del negocio» arriba.' } }));
      return;
    }
    // Sin monto no se puede registrar la venta, y adivinarlo sería peor: se dice
    // qué hacer en vez de importar una factura en cero.
    if (!(Number(doc.total) > 0)) {
      setResFila(p => ({
        ...p,
        [clave]: {
          ok: false,
          text: 'Hacienda no devolvió el monto de este comprobante. Usá «editar» y poné el '
            + 'total a mano, o subí su PDF para leerlo con el detalle.',
        },
      }));
      return;
    }
    setImpFila(clave);
    try {
      /**
       * 28 segundos, no los 20 de siempre.
       *
       * Importar baja el XML del comprobante desde Alanube, y ese endpoint suele
       * tardar más que el corte por defecto: la importación se cancelaba de este
       * lado aunque del otro lado siguiera trabajando bien. El servidor muere a
       * los 30 s, así que 28 es lo máximo que tiene sentido esperar.
       */
      const r = await apiFetch<any>(`/admin/tenants/${negocio}/fe-import`, {
        method: 'POST',
        body: JSON.stringify({
          clave,
          company_id: buscaId.trim() || undefined,
          // El monto viene del registro de Hacienda: es el dato bueno.
          total: Number(doc.total),
          tax: Number(doc.iva) || undefined,
        }),
      }, 28_000);
      setResFila(p => ({
        ...p,
        [clave]: {
          ok: true,
          text: `Factura ${r?.invoice_number ?? ''} · ₡${Math.round(Number(r?.total ?? 0)).toLocaleString('es-CR')}`
            + (r?.completa || r?.completada
              ? ` · ${r.lineas} línea(s)`
              // Sin líneas casi siempre es porque se encontró por clave: Alanube
              // no entrega el detalle así. Se dice qué hacer, no solo qué faltó.
              : ' · SIN DETALLE de productos — usá «editar» y poné el Consecutivo'
                + ' de Alanube que viene en el correo para traer las líneas'),
        },
      }));
      // Deja de estar «faltante»: se marca en la lista sin volver a consultar.
      setDocs((prev: any) => !prev?.documentos ? prev : ({
        ...prev,
        faltan_en_base: Math.max(0, (prev.faltan_en_base ?? 1) - 1),
        documentos: prev.documentos.map((d: any) => d.clave === clave ? { ...d, en_base: true } : d),
      }));
    } catch (e) {
      setResFila(p => ({ ...p, [clave]: { ok: false, text: e instanceof Error ? e.message : 'No se pudo importar' } }));
    } finally { setImpFila(null); }
  };

  const [docCedula, setDocCedula] = useState('');
  const [docBusy, setDocBusy] = useState(false);
  const [docs, setDocs] = useState<any | null>(null);

  const buscarDocs = async () => {
    setDocBusy(true); setDocs(null);
    try {
      const qs = new URLSearchParams({ env, cedula: docCedula.replace(/\D/g, '') });
      // El negocio manda: si tiene cuenta propia, se pregunta con SU token. El id
      // de empresa solo acota dentro de esa cuenta.
      if (buscaTenant.trim()) qs.set('tenant', buscaTenant.trim());
      if (buscaId.trim()) qs.set('company', buscaId.trim());
      if (buscaFrom) qs.set('from', buscaFrom);
      if (buscaUntil) qs.set('until', buscaUntil);
      setDocs(await apiFetch<any>(`/admin/alanube/documents/query?${qs.toString()}`, {}, 28_000));
    } catch (e) {
      setDocs({ error: e instanceof Error ? e.message : 'No se pudo consultar' });
    } finally { setDocBusy(false); }
  };

  /**
   * Consulta el total emitido por UNA empresa.
   *
   * El reporte general trae todas las cuentas y a veces no cabe en el tiempo del
   * servidor. Este mira una sola: es rápido, y es el que sirve cuando hay que
   * cuadrar un negocio contra lo que muestra la base.
   */
  const verEmpresa = async (
    id: string, nombre: string, tenantId?: string | null,
    rango?: { from: string; until: string },
  ) => {
    setCargandoDetalle(id);
    // Fuera del try: el rango consultado se muestra también cuando falla, que es
    // cuando más importa saber qué se preguntó.
    const usado = { from: rango?.from || from, until: rango?.until || until };
    try {
      const qs = new URLSearchParams({ env, from: usado.from, until: usado.until });
      // Una empresa que vive en la cuenta propia del negocio NO aparece con el
      // token global: hay que decirle al servidor con qué cuenta preguntar.
      if (tenantId) qs.set('tenant', tenantId);
      const r = await apiFetch<any>(`/admin/alanube/reports/emissions/${id}?${qs.toString()}`);
      setDetalleEmpresa({ id, nombre, datos: r, rango: usado });
    } catch (e) {
      setDetalleEmpresa({
        id, nombre,
        datos: { error: e instanceof Error ? e.message : 'No se pudo consultar' },
        rango: usado,
      });
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
          // Detalle leído del PDF: es el único lugar donde existe cuando el
          // comprobante no se puede bajar de Alanube.
          lines: impManual && pdfLineas.length > 0 ? pdfLineas : undefined,
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
      }, 28_000);   // bajar el XML tarda más que el corte por defecto
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
      setPdfLineas([]);
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
      <details ref={importadorRef} className="bg-white border-2 border-gray-200 rounded-2xl px-4 py-3">
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
            className={`px-3 py-2 border rounded-lg text-sm font-mono outline-none focus:border-indigo-400 transition-colors ${
              recienLlenado ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200'}`} />
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

        {/* Atajo: sacar la clave del PDF en vez de transcribirla. */}
        <label className={`mt-2 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed text-xs font-black cursor-pointer ${
          pdfBusy ? 'border-gray-200 text-gray-400' : 'border-indigo-200 text-indigo-700 hover:bg-indigo-50'}`}>
          {pdfBusy ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
          {pdfBusy ? 'Leyendo el PDF…' : 'Cargar desde el PDF de Alanube'}
          <input type="file" accept="application/pdf" className="hidden" disabled={pdfBusy}
            onChange={e => { void cargarDesdePdf(e.target.files?.[0]); e.currentTarget.value = ''; }} />
        </label>
        <p className="text-[11px] font-semibold text-gray-400 text-center mt-1">
          Saca la clave, la fecha, el monto y las líneas de productos del comprobante
          que Alanube manda por correo.
        </p>
        {pdfLineas.length > 0 && (
          <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-[11px] font-black text-emerald-800">
              {pdfLineas.length} línea(s) leídas del PDF — se van a guardar con la factura
            </p>
            <div className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
              {pdfLineas.map((l: any, i: number) => (
                <p key={i} className="text-[11px] text-emerald-900 font-mono">
                  {l.quantity} × ₡{Number(l.unit_price).toLocaleString('es-CR')} = ₡
                  {Number(l.subtotal).toLocaleString('es-CR')} · {l.product_name}
                </p>
              ))}
            </div>
            <p className="mt-1 text-[10px] font-bold text-emerald-700">
              Suma de líneas: ₡{pdfLineas.reduce((a: number, l: any) => a + Number(l.subtotal || 0), 0).toLocaleString('es-CR')}
              {' '}· Total del comprobante: ₡{Number(String(impTotal).replace(/[^\d.]/g, '') || 0).toLocaleString('es-CR')}
            </p>
          </div>
        )}
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

      {/* Buscar el total emitido de UNA empresa por su id */}
      <div className="bg-white border-2 border-gray-100 rounded-2xl p-4 space-y-2">
        <p className="font-black text-gray-900 text-sm">Buscar por empresa</p>
        <p className="text-[11px] font-semibold text-gray-400">
          Consulta el total emitido de una empresa por su id de Alanube, en el rango de fechas de
          arriba. Sirve cuando no aparece en la tabla.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            value={buscaId}
            onChange={e => setBuscaId(e.target.value)}
            placeholder="Id de la empresa en Alanube"
            className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
          />
          <input
            value={buscaTenant}
            onChange={e => setBuscaTenant(e.target.value)}
            placeholder="Id del negocio (solo si tiene cuenta propia)"
            className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <label className="text-[11px] font-bold text-gray-500 flex flex-col gap-1">
            Desde
            <input type="date" value={buscaFrom} onChange={e => setBuscaFrom(e.target.value)}
              className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-normal text-gray-800" />
          </label>
          <label className="text-[11px] font-bold text-gray-500 flex flex-col gap-1">
            Hasta
            <input type="date" value={buscaUntil} onChange={e => setBuscaUntil(e.target.value)}
              className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-normal text-gray-800" />
          </label>
          <button
            onClick={() => void verEmpresa(
              buscaId.trim(), '', buscaTenant.trim() || null,
              { from: buscaFrom, until: buscaUntil },
            )}
            disabled={!buscaId.trim() || !buscaFrom || !buscaUntil || cargandoDetalle === buscaId.trim()}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400 flex items-center justify-center gap-2"
          >
            {cargandoDetalle === buscaId.trim()
              ? <Loader2 size={15} className="animate-spin" />
              : <BarChart3 size={15} />}
            Consultar
          </button>
        </div>
      </div>

      {/* Comprobantes emitidos a un cliente (para saber CUÁLES faltan) */}
      <div className="bg-white border-2 border-gray-100 rounded-2xl p-4 space-y-2">
        <p className="font-black text-gray-900 text-sm">Comprobantes por cliente</p>
        <p className="text-[11px] font-semibold text-gray-400">
          Lista lo que Hacienda tiene emitido a la cédula de un <b>cliente</b> (el receptor de la
          factura, no el negocio), con su clave, y marca cuáles ya están en la base.
          Usa el <b>id del negocio</b>, el id de empresa y las fechas del recuadro de arriba.
        </p>
        <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
          Si el negocio tiene su propia cuenta de Alanube, llená «Id del negocio» arriba. Sin eso se
          pregunta con la cuenta general y Alanube responde «Company not found».
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
          <input
            value={docCedula}
            onChange={e => setDocCedula(e.target.value)}
            placeholder="Cédula del CLIENTE al que se le facturó (ej. 3101612181)"
            className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={() => void buscarDocs()}
            disabled={docBusy || docCedula.replace(/\D/g, '').length < 9}
            className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-black text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400 flex items-center justify-center gap-2"
          >
            {docBusy ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
            Buscar
          </button>
        </div>

        {docs?.error && (
          <div className="text-xs font-bold text-red-600 space-y-1">
            <p>{docs.error}</p>
            {/* Traducción del error más común: no es un dato malo, es la cuenta. */}
            {/company not found|no encontrada/i.test(String(docs.error)) && (
              <p className="font-semibold text-gray-600">
                Alanube no encuentra esa empresa en la cuenta con la que se preguntó.
                Llená «Id del negocio» en el recuadro de arriba para usar su cuenta propia,
                o revisá que el id de empresa sea el del ambiente {env}.
              </p>
            )}
          </div>
        )}
        {docs && !docs.error && (
          <div className="space-y-1.5">
            {/* Con qué cuenta y empresa se preguntó: un resultado vacío no dice
                por sí solo si se buscó donde correspondía. */}
            {docs.consultado_con && (
              <p className="text-[10px] font-semibold text-gray-400">
                Consultado con {docs.consultado_con.cuenta} · {docs.consultado_con.empresa}
              </p>
            )}
            {docs.aviso && (
              <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                {docs.aviso}
              </p>
            )}
            <p className="text-xs font-bold text-gray-600">
              {docs.encontrados} comprobante(s) ·{' '}
              <span className={docs.faltan_en_base > 0 ? 'text-red-600' : 'text-emerald-600'}>
                {docs.faltan_en_base} sin registrar en la base
              </span>
            </p>
            <div className="max-h-80 overflow-y-auto space-y-1">
              {(docs.documentos ?? []).map((d: any) => (
                <div key={d.clave}
                  className={`rounded-xl px-3 py-2 text-[11px] border ${
                    d.en_base ? 'bg-gray-50 border-gray-100' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-gray-800">
                      {d.tipo === '01' ? 'Factura' : d.tipo === '04' ? 'Tiquete'
                        : d.tipo === '03' ? 'N. Crédito' : d.tipo === '02' ? 'N. Débito' : 'Doc'}
                      {' '}#{Number(d.consecutivo)}
                      <span className="ml-2 font-normal text-gray-400">
                        {String(d.fecha ?? '').slice(0, 10)}
                      </span>
                      {/* El monto viene del registro de Hacienda: es lo que se
                          va a registrar, así que se ve antes de importar. */}
                      {d.total != null && (
                        <span className="ml-2 font-black text-gray-900">
                          ₡{Number(d.total).toLocaleString('es-CR')}
                        </span>
                      )}
                      {!d.en_base && d.total == null && (
                        <span className="ml-2 font-bold text-amber-700"
                          title={d.motivo_sin_monto ?? 'Hacienda no devolvió el monto'}>
                          sin monto
                        </span>
                      )}
                    </span>
                    {d.en_base
                      ? <span className="font-bold text-emerald-600">en la base</span>
                      : (
                        <span className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => void importarFila(d)}
                            disabled={impFila === d.clave}
                            className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-black disabled:bg-gray-300 flex items-center gap-1">
                            {impFila === d.clave && <Loader2 size={11} className="animate-spin" />}
                            {impFila === d.clave ? 'Importando…' : 'Importar'}
                          </button>
                          {/* Salida por si hace falta ajustar algo antes de importar. */}
                          <button
                            onClick={() => usarParaImportar(d.clave, buscaTenant.trim())}
                            title="Abrir el formulario con esta clave, para revisar o corregir antes"
                            className="text-gray-400 hover:text-gray-700 font-bold">
                            editar
                          </button>
                        </span>
                      )}
                  </div>
                  <div className="font-mono text-[10px] text-gray-400 break-all">{d.clave}</div>
                  {/* Por qué no vino el monto: es lo que dice si hay que
                      corregir algo acá o si Hacienda simplemente no lo da. */}
                  {!d.en_base && d.motivo_sin_monto && (
                    <div className="text-[10px] text-amber-700 break-words">
                      Sin monto: {d.motivo_sin_monto}
                    </div>
                  )}
                  {resFila[d.clave] && (
                    <div className={`mt-1 font-bold ${resFila[d.clave].ok ? 'text-emerald-700' : 'text-red-700'}`}>
                      {resFila[d.clave].text}
                    </div>
                  )}
                  {d.notas_credito?.length > 0 && (
                    <div className="text-[10px] font-bold text-amber-700">
                      Con {d.notas_credito.length} nota(s) de crédito
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Detalle de una empresa */}
      {detalleEmpresa && (
        <div className="bg-white border-2 border-indigo-200 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-black text-gray-900">
              {detalleEmpresa.nombre || detalleEmpresa.datos?.companyName || 'Empresa'}
              <span className="block text-[11px] font-mono font-normal text-gray-400">{detalleEmpresa.id}</span>
              {/* El rango consultado va a la vista: sin él, los números se leen
                  contra las fechas equivocadas cuando el buscador tiene otras. */}
              {detalleEmpresa.rango && (
                <span className="block text-[11px] font-normal text-gray-500">
                  {detalleEmpresa.rango.from} → {detalleEmpresa.rango.until}
                </span>
              )}
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
                        <button onClick={() => void verEmpresa(r.idCompany!, r.companyName ?? '', r._tenantId)}
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
