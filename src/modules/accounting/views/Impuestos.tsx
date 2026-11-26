'use client';

import React from 'react';
import { Loader2, AlertTriangle, CheckCircle2, Receipt } from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * EL IVA DEL PERÍODO.
 *
 * ── Por qué muestra DOS números para lo mismo ────────────────────────────
 * El IVA se puede sacar de los documentos (las facturas y los gastos) o de
 * los libros (las cuentas 2102 y 1105). Si todo está contabilizado dan igual.
 * Cuando no, la diferencia es exactamente la lista de documentos que faltan
 * asentar — y eso se quiere ver ANTES de declarar, no en una revisión.
 *
 * Un informe que muestra un solo número elige por el usuario cuál creer.
 */

const crc = (n: any) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;

export const Impuestos: React.FC<{ desde: string; hasta: string }> = ({ desde, hasta }) => {
  const [d, setD] = React.useState<any>(null);
  const [cargando, setCargando] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let vivo = true;
    setCargando(true); setError('');
    apiFetch<any>(`/accounting/impuestos?desde=${desde}&hasta=${hasta}`, {}, 60000)
      .then(r => { if (vivo) setD(r); })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo calcular'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [desde, hasta]);

  if (cargando) return <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Calculando el IVA…</p>;
  if (error) return <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>;
  if (!d) return null;

  const aFavor = d.iva_por_pagar < 0;

  return (
    <div className="space-y-4">
      {/* LO QUE SE DECLARA */}
      <div className={`rounded-xl border-2 p-4 ${aFavor ? 'bg-sky-50 border-sky-200' : 'bg-indigo-50 border-indigo-200'}`}>
        <p className="text-xs font-bold text-gray-500 uppercase">
          {aFavor ? 'Saldo a favor del período' : 'IVA a pagar del período'}
        </p>
        <p className={`text-3xl font-black tabular-nums ${aFavor ? 'text-sky-700' : 'text-indigo-700'}`}>
          {crc(Math.abs(d.iva_por_pagar))}
        </p>
        <p className="text-xs text-gray-600 mt-1">
          Débito fiscal {crc(d.debito_fiscal)} − crédito fiscal {crc(d.credito_fiscal)}
          {aFavor && ' · el crédito es mayor: queda a favor para el mes siguiente.'}
        </p>
      </div>

      {/* EL CRUCE CONTRA LOS LIBROS */}
      {d.libros?.disponible && (
        <div className={`rounded-xl border-2 p-3 flex items-start gap-3 ${
          d.calza ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-300'}`}>
          {d.calza
            ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            : <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />}
          <div className="text-sm">
            <p className="font-black text-gray-900">
              {d.calza
                ? 'Los documentos y los libros dicen lo mismo'
                : 'Los documentos y los libros NO dicen lo mismo'}
            </p>
            {d.calza ? (
              <p className="text-gray-700 text-xs">
                Todo lo del período está contabilizado: el número de arriba es el que sale del libro mayor.
              </p>
            ) : (
              <p className="text-gray-700 text-xs">
                Según los documentos el débito es {crc(d.debito_fiscal)} y el crédito {crc(d.credito_fiscal)};
                según las cuentas 2102 y 1105 son {crc(d.libros.debito)} y {crc(d.libros.credito)}.
                Diferencia de {crc(d.diferencia_debito)} en el débito y {crc(d.diferencia_credito)} en el
                crédito. Casi siempre son documentos sin asiento: tocá
                <b> «Contabilizar pendientes»</b> y volvé a mirar.
              </p>
            )}
          </div>
        </div>
      )}
      {d.libros && !d.libros.disponible && (
        <p className="text-xs text-gray-500">
          El cruce contra los libros necesita el módulo contable con la migración 122 corrida.
        </p>
      )}

      {/* EL DESGLOSE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Bloque titulo="Ventas (débito fiscal)" color="emerald" filas={[
          ['Gravado', crc(d.ventas.gravado)],
          ['Exento o no sujeto', crc(d.ventas.exento)],
          ['IVA cobrado', crc(d.ventas.iva)],
          ['Comprobantes', String(d.ventas.docs)],
        ]} nota={d.ventas.anuladas > 0
          ? `${d.ventas.anuladas} comprobante(s) anulado(s) quedaron fuera, como corresponde.`
          : undefined} />

        <Bloque titulo="Compras (crédito fiscal)" color="sky" filas={[
          ['Neto', crc(d.compras.neto)],
          ['IVA pagado', crc(d.compras.iva)],
          ['Documentos', String(d.compras.docs)],
        ]} nota={d.compras.sin_impuesto > 0
          ? `${d.compras.sin_impuesto} compra(s) sin impuesto anotado. Si llevaban IVA, ese crédito no se está pidiendo.`
          : undefined} />

        <Bloque titulo="Gastos (crédito fiscal)" color="sky" filas={[
          ['Neto', crc(d.gastos.neto)],
          ['IVA pagado', crc(d.gastos.iva)],
          ['Documentos', String(d.gastos.docs)],
        ]} nota={d.gastos.sin_impuesto > 0
          ? `${d.gastos.sin_impuesto} gasto(s) sin impuesto anotado. Si llevaban IVA, ese crédito no se está pidiendo.`
          : undefined} />
      </div>

      {/* MES A MES */}
      {(d.por_mes ?? []).length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
            <Receipt size={14} className="text-indigo-600" />
            <h3 className="text-sm font-black text-gray-900">Mes a mes</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2 font-bold">Mes</th>
                <th className="text-right px-3 py-2 font-bold">Débito</th>
                <th className="text-right px-3 py-2 font-bold">Crédito</th>
                <th className="text-right px-4 py-2 font-bold">A pagar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {d.por_mes.map((m: any) => (
                <tr key={m.mes}>
                  <td className="px-4 py-1.5 font-mono text-xs text-gray-600">{m.mes}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{crc(m.debito)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{crc(m.credito)}</td>
                  <td className={`px-4 py-1.5 text-right tabular-nums font-bold ${
                    m.por_pagar < 0 ? 'text-sky-700' : 'text-gray-900'}`}>{crc(m.por_pagar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-50">
            El IVA se declara por mes: este corte es el que hay que llevar a cada D-104, no el total del rango.
          </p>
        </div>
      )}

      <p className="text-[11px] text-gray-400 leading-snug">
        Las ventas se agrupan por el día de Costa Rica, no por UTC: una factura de las 7 p.m. del último día
        del mes pertenece a ese mes y no al siguiente. Este informe es una ayuda para llenar la D-104;
        no la presenta ni la firma.
      </p>
    </div>
  );
};

const Bloque: React.FC<{
  titulo: string; color: 'emerald' | 'sky'; filas: Array<[string, string]>; nota?: string;
}> = ({ titulo, color, filas, nota }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-4">
    <h3 className={`text-sm font-black mb-2 ${color === 'emerald' ? 'text-emerald-700' : 'text-sky-700'}`}>
      {titulo}
    </h3>
    {filas.map(([k, v]) => (
      <div key={k} className="flex justify-between text-xs py-1 border-b border-gray-50 last:border-0">
        <span className="text-gray-600">{k}</span>
        <span className="tabular-nums font-semibold text-gray-900">{v}</span>
      </div>
    ))}
    {nota && (
      <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-2 leading-snug">
        {nota}
      </p>
    )}
  </div>
);

export default Impuestos;
