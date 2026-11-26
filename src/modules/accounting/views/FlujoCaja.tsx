'use client';

import React from 'react';
import { Loader2, ArrowDownCircle, ArrowUpCircle, Waves, AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * FLUJO DE CAJA.
 *
 * ── Qué pregunta responde ────────────────────────────────────────────────
 * «El estado de resultados dice que gané, ¿por qué no hay plata?». La
 * utilidad incluye ventas a crédito que no se han cobrado y no incluye el
 * pago del préstamo; el flujo es lo contrario. Son dos informes porque son
 * dos preguntas distintas.
 *
 * ── Lo que esta pantalla admite ──────────────────────────────────────────
 * Sale del libro diario, así que solo ve lo CONTABILIZADO. Si hay ventas sin
 * asiento, lo dice con el número en vez de mostrar un saldo que no es.
 */

const crc = (n: any) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;

export const FlujoCaja: React.FC<{ desde: string; hasta: string }> = ({ desde, hasta }) => {
  const [d, setD] = React.useState<any>(null);
  const [cargando, setCargando] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let vivo = true;
    setCargando(true); setError('');
    apiFetch<any>(`/accounting/flujo?desde=${desde}&hasta=${hasta}`, {}, 60000)
      .then(r => { if (vivo) setD(r); })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo calcular'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [desde, hasta]);

  if (cargando) return <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Siguiendo la plata…</p>;
  if (error) return <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>;
  if (!d) return null;
  if (d.sin_tabla) return <p className="text-sm text-amber-900 bg-amber-50 border-2 border-amber-300 rounded-xl px-4 py-3">Falta correr la migración <b>122_contabilidad.sql</b>.</p>;

  const entradas = d.categorias.filter((x: any) => x.entradas > 0);
  const salidas = d.categorias.filter((x: any) => x.salidas > 0);

  return (
    <div className="space-y-4">
      {/* EL RECORRIDO: de dónde salió el saldo de hoy */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tarjeta titulo="Saldo al empezar" valor={crc(d.saldo_inicial)} />
        <Tarjeta titulo="Entró" valor={crc(d.entradas)} color="text-emerald-700" />
        <Tarjeta titulo="Salió" valor={crc(d.salidas)} color="text-red-600" />
        <Tarjeta titulo="Saldo al terminar" valor={crc(d.saldo_final)}
          color={d.saldo_final < 0 ? 'text-red-600' : 'text-gray-900'}
          nota={`Neto del período: ${d.neto >= 0 ? '+' : ''}${crc(d.neto)}`} />
      </div>

      {d.saldo_final < 0 && (
        <p className="text-sm font-bold text-red-800 bg-red-50 border-2 border-red-300 rounded-xl px-3 py-2">
          El saldo de caja y bancos quedó en negativo según los libros. Eso no puede pasar en la
          realidad: o hay movimientos sin registrar, o algún asiento sacó plata de la cuenta
          equivocada.
        </p>
      )}

      {d.ventas_sin_asiento > 0 && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            <b>{d.ventas_sin_asiento} venta(s) del período sin asiento.</b> Su plata no está en este
            flujo. Tocá «Contabilizar pendientes» arriba y volvé a mirar.
          </span>
        </p>
      )}

      {d.traspasos?.cuantos > 0 && (
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex items-start gap-2">
          <ArrowRightLeft size={14} className="shrink-0 mt-0.5 text-gray-400" />
          <span>
            {d.traspasos.cuantos} traspaso(s) entre caja y bancos por {crc(d.traspasos.monto)} quedaron
            fuera de las dos columnas: la plata solo cambió de bolsillo, no entró ni salió del negocio.
          </span>
        </p>
      )}

      {/* POR DÓNDE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Columna titulo="Por dónde entró" icono={ArrowDownCircle} color="emerald"
          filas={entradas} campo="entradas" total={d.entradas}
          vacio="No entró plata en este período." />
        <Columna titulo="Por dónde salió" icono={ArrowUpCircle} color="red"
          filas={salidas} campo="salidas" total={d.salidas}
          vacio="No salió plata en este período." />
      </div>

      {/* MES A MES */}
      {(d.por_mes ?? []).length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
            <Waves size={14} className="text-indigo-600" />
            <h3 className="text-sm font-black text-gray-900">Mes a mes</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2 font-bold">Mes</th>
                <th className="text-right px-3 py-2 font-bold">Entró</th>
                <th className="text-right px-3 py-2 font-bold">Salió</th>
                <th className="text-right px-4 py-2 font-bold">Neto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {d.por_mes.map((m: any) => (
                <tr key={m.mes}>
                  <td className="px-4 py-1.5 font-mono text-xs text-gray-600">{m.mes}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{crc(m.entradas)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-red-600">{crc(m.salidas)}</td>
                  <td className={`px-4 py-1.5 text-right tabular-nums font-bold ${
                    m.neto < 0 ? 'text-red-600' : 'text-gray-900'}`}>{crc(m.neto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-gray-400 leading-snug">
        Las cuentas que cuentan como plata son {(d.cuentas_de_plata ?? []).map((x: any) => `${x.code} ${x.name}`).join(' · ')}.
        Cuando un asiento mueve plata contra varias cuentas (una venta mueve ventas e IVA a la vez),
        el movimiento se reparte entre ellas en proporción a su monto: así la suma por categoría da
        exactamente lo que entró y salió, sin que ninguna categoría se lleve plata que no le toca.
      </p>
    </div>
  );
};

const Tarjeta: React.FC<{ titulo: string; valor: string; nota?: string; color?: string }> =
  ({ titulo, valor, nota, color }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-4">
    <p className="text-xs font-bold text-gray-500">{titulo}</p>
    <p className={`text-2xl font-black tabular-nums ${color ?? 'text-gray-900'}`}>{valor}</p>
    {nota && <p className="text-[11px] text-gray-400 mt-1">{nota}</p>}
  </div>
);

const Columna: React.FC<{
  titulo: string; icono: React.ElementType; color: 'emerald' | 'red';
  filas: any[]; campo: 'entradas' | 'salidas'; total: number; vacio: string;
}> = ({ titulo, icono: Icono, color, filas, campo, total, vacio }) => (
  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
    <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
      <Icono size={15} className={color === 'emerald' ? 'text-emerald-600' : 'text-red-500'} />
      <h3 className="text-sm font-black text-gray-900">{titulo}</h3>
      <span className="ml-auto text-sm font-black tabular-nums text-gray-700">{crc(total)}</span>
    </div>
    {filas.length === 0 ? (
      <p className="px-4 py-3 text-sm text-gray-500">{vacio}</p>
    ) : (
      <div className="divide-y divide-gray-50">
        {filas.map(f => (
          <div key={f.code} className="px-4 py-2">
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-gray-700 truncate">
                <span className="font-mono text-xs text-gray-400">{f.code}</span> {f.name}
              </span>
              <span className="tabular-nums font-semibold shrink-0">{crc(f[campo])}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
              <div className={color === 'emerald' ? 'bg-emerald-500 h-full' : 'bg-red-400 h-full'}
                style={{ width: `${total ? (f[campo] / total) * 100 : 0}%` }} />
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

export default FlujoCaja;
