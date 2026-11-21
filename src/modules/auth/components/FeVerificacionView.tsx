'use client';

import React, { useMemo, useState } from 'react';
import {
  ShieldCheck, Loader2, AlertTriangle, CheckCircle2, XCircle, Clock, HelpCircle, Download,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { downloadXlsx } from '@/utils/xlsx';

/**
 * COMPROBAR CONTRA HACIENDA.
 *
 * La bitácora muestra lo que NOSOTROS guardamos. Eso basta casi siempre, pero
 * no contesta la pregunta que importa cuando un cliente reclama: «¿Hacienda la
 * tiene aceptada?». Nuestro estado puede haberse quedado viejo —el webhook no
 * llegó, la respuesta se perdió, la factura quedó en «enviado» hace semanas— y
 * nadie se entera hasta que alguien la busca una por una.
 *
 * Acá se vuelve a preguntar por cada comprobante y se compara con lo guardado.
 */
interface Fila {
  id: string;
  tenant_id: string;
  negocio: string;
  invoice_number: string;
  customer_name: string | null;
  total: number;
  issued_at: string | null;
  document_type: string | null;
  fe_clave: string | null;
  emailed: boolean;
  estado_guardado: string;
  estado_hacienda: string | null;
  aviso: string | null;
  resultado: 'coincide' | 'corregido' | 'sin_consultar';
  motivo?: string;
}

interface Resumen {
  revisados: number; coinciden: number; corregidos: number; sin_consultar: number;
  aceptados: number; rechazados: number; pendientes: number; con_aviso: number;
  cortado_por_tiempo: boolean; total_en_rango: number;
}

const ESTADO: Record<string, { label: string; cls: string }> = {
  accepted: { label: 'Aceptado', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Rechazado', cls: 'bg-red-100 text-red-700' },
  error:    { label: 'Error', cls: 'bg-red-100 text-red-700' },
  sent:     { label: 'En proceso', cls: 'bg-amber-100 text-amber-700' },
};
const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const haceDias = (d: number) =>
  new Date(Date.now() - d * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

export const FeVerificacionView: React.FC<{ owners: Array<{ id: string; name: string }> }> = ({ owners }) => {
  const [tenantId, setTenantId] = useState('');
  const [from, setFrom] = useState(haceDias(7));
  const [to, setTo] = useState(hoy());
  const [estado, setEstado] = useState('');
  const [limite, setLimite] = useState(100);
  const [corriendo, setCorriendo] = useState(false);
  const [err, setErr] = useState('');
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [soloProblemas, setSoloProblemas] = useState(true);

  const comprobar = async () => {
    setCorriendo(true); setErr('');
    try {
      const r = await apiFetch<{ resumen: Resumen; detalle: Fila[] }>('/admin/fe-verificar', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: tenantId || undefined,
          from: from || undefined, to: to || undefined,
          status: estado || undefined, limit: limite,
        }),
      }, 60_000);
      setResumen(r.resumen); setFilas(r.detalle ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo comprobar');
    } finally { setCorriendo(false); }
  };

  /**
   * Lo que hay que mirar: lo que no coincidía, lo que no se pudo consultar, lo
   * rechazado y lo aceptado CON observación. Una lista de doscientas facturas
   * en orden se lee igual que no haber comprobado nada.
   */
  const esProblema = (f: Fila) =>
    f.resultado !== 'coincide'
    || f.estado_hacienda === 'rejected' || f.estado_hacienda === 'error'
    || (f.estado_hacienda === 'accepted' && !!String(f.aviso ?? '').trim())
    || (f.estado_hacienda !== 'accepted' && f.estado_hacienda !== null);

  const visibles = useMemo(
    () => (soloProblemas ? filas.filter(esProblema) : filas),
    [filas, soloProblemas]);

  const bajarExcel = () => {
    downloadXlsx(`verificacion-hacienda-${from}-${to}`, [{
      name: 'Verificación',
      rows: [
      ['Negocio', 'Factura', 'Cliente', 'Monto', 'Emitida', 'Clave',
        'Estado guardado', 'Estado en Hacienda', 'Resultado', 'Aviso de Hacienda'],
      ...filas.map(f => [
        f.negocio, f.invoice_number, f.customer_name ?? '', f.total,
        f.issued_at ? String(f.issued_at).slice(0, 16).replace('T', ' ') : '',
        f.fe_clave ?? '',
        ESTADO[f.estado_guardado]?.label ?? f.estado_guardado,
        f.estado_hacienda ? (ESTADO[f.estado_hacienda]?.label ?? f.estado_hacienda) : (f.motivo ?? 'no se pudo consultar'),
        f.resultado, f.aviso ?? '',
      ]),
      ],
    }]);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
          <ShieldCheck size={20} className="text-emerald-600" /> Comprobar en Hacienda
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Vuelve a preguntarle a Hacienda por cada comprobante y lo compara con lo que tenemos
          guardado. No manda correos.
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-bold text-gray-600">
          Negocio
          <select value={tenantId} onChange={e => setTenantId(e.target.value)}
            className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[200px]">
            <option value="">Todos</option>
            {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-gray-600">
          Desde
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-bold text-gray-600">
          Hasta
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-bold text-gray-600">
          Estado guardado
          <select value={estado} onChange={e => setEstado(e.target.value)}
            className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Cualquiera</option>
            <option value="sent">En proceso</option>
            <option value="accepted">Aceptado</option>
            <option value="rejected">Rechazado</option>
            <option value="error">Error</option>
          </select>
        </label>
        <label className="text-xs font-bold text-gray-600">
          Máximo
          <select value={limite} onChange={e => setLimite(Number(e.target.value))}
            className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm">
            {[25, 50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button onClick={comprobar} disabled={corriendo}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-sm font-black">
          {corriendo ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
          {corriendo ? 'Comprobando…' : 'Comprobar'}
        </button>
      </div>

      {/* Es lento a propósito: una consulta por comprobante. Decirlo evita que
          alguien crea que se trabó y recargue a la mitad. */}
      {corriendo && (
        <p className="text-xs text-gray-500">
          Se consulta uno por uno, así que tarda. Si el rango es grande, se corta y lo avisa.
        </p>
      )}

      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2">{err}</div>}

      {resumen && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi label="Revisados" valor={`${resumen.revisados} de ${resumen.total_en_rango}`} />
            <Kpi label="Aceptados" valor={String(resumen.aceptados)} cls="text-emerald-600" />
            <Kpi label="Rechazados" valor={String(resumen.rechazados)} cls="text-red-600" />
            <Kpi label="En proceso" valor={String(resumen.pendientes)} cls="text-amber-600" />
            <Kpi label="Estado corregido" valor={String(resumen.corregidos)} cls="text-blue-600" />
            <Kpi label="No se pudo consultar" valor={String(resumen.sin_consultar)} cls="text-gray-500" />
          </div>

          {resumen.con_aviso > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                <b>{resumen.con_aviso}</b> comprobante{resumen.con_aviso === 1 ? '' : 's'} está
                {resumen.con_aviso === 1 ? '' : 'n'} <b>aceptado{resumen.con_aviso === 1 ? '' : 's'} con observación</b> de
                Hacienda. La factura vale, pero hay un dato que corregir — el más común es la
                ubicación del emisor, que no concuerda con lo registrado en ATV.
              </p>
            </div>
          )}

          {/* Cortado por tiempo: se dice. Un resumen parcial que parece completo
              hace creer que todo lo demás está bien. */}
          {resumen.cortado_por_tiempo && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
              <Clock size={15} className="text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800">
                Se revisaron <b>{resumen.revisados}</b> de <b>{resumen.total_en_rango}</b> y se cortó por tiempo.
                Acotá las fechas o el negocio y volvé a comprobar para ver el resto.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
              <input type="checkbox" checked={soloProblemas} onChange={e => setSoloProblemas(e.target.checked)} />
              Mostrar solo lo que hay que mirar ({filas.filter(esProblema).length} de {filas.length})
            </label>
            {filas.length > 0 && (
              <button onClick={bajarExcel}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">
                <Download size={13} /> Excel
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm min-w-[52rem]">
              <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Negocio</th>
                  <th className="text-left px-4 py-2">Factura</th>
                  <th className="text-left px-4 py-2">Cliente</th>
                  <th className="text-right px-4 py-2">Monto</th>
                  <th className="text-left px-4 py-2">Guardado</th>
                  <th className="text-left px-4 py-2">En Hacienda</th>
                  <th className="text-left px-4 py-2">Observación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibles.map(f => (
                  <tr key={f.id} className="hover:bg-gray-50/60 align-top">
                    <td className="px-4 py-2 text-gray-700">{f.negocio}</td>
                    <td className="px-4 py-2 font-mono text-xs font-bold text-gray-800">
                      {f.invoice_number}
                      <div className="text-[9px] text-gray-400 break-all max-w-[160px]">{f.fe_clave}</div>
                    </td>
                    <td className="px-4 py-2 text-gray-600 max-w-[150px] truncate">{f.customer_name ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-bold text-gray-900">{fmt(f.total)}</td>
                    <td className="px-4 py-2">
                      <Pill estado={f.estado_guardado} />
                    </td>
                    <td className="px-4 py-2">
                      {f.estado_hacienda ? (
                        <>
                          <Pill estado={f.estado_hacienda} />
                          {f.resultado === 'corregido' && (
                            <div className="text-[10px] font-bold text-blue-600 mt-0.5">corregido</div>
                          )}
                        </>
                      ) : (
                        /* No se pudo preguntar. Se dice el motivo y NO se toca el
                           estado: borrar un «aceptado» por una consulta fallida
                           sería peor que no haber consultado. */
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-500"
                          title={f.motivo}>
                          <HelpCircle size={12} /> no se pudo consultar
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-[11px] text-amber-800 max-w-[260px]">
                      {f.aviso ? f.aviso : (f.motivo ?? '')}
                    </td>
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-gray-400 py-8">
                      {filas.length === 0
                        ? 'Sin comprobantes en el rango elegido'
                        : <span className="inline-flex items-center gap-1.5 text-emerald-600 font-bold">
                            <CheckCircle2 size={15} /> Todo lo revisado coincide con Hacienda
                          </span>}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

const Kpi: React.FC<{ label: string; valor: string; cls?: string }> = ({ label, valor, cls }) => (
  <div className="bg-white rounded-xl border border-gray-100 p-3">
    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
    <p className={`text-lg font-black ${cls ?? 'text-gray-900'}`}>{valor}</p>
  </div>
);

const Pill: React.FC<{ estado: string }> = ({ estado }) => {
  const e = ESTADO[estado] ?? { label: estado || '—', cls: 'bg-gray-100 text-gray-600' };
  const Icon = estado === 'accepted' ? CheckCircle2
    : (estado === 'rejected' || estado === 'error') ? XCircle : Clock;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${e.cls}`}>
      <Icon size={11} /> {e.label}
    </span>
  );
};

export default FeVerificacionView;
