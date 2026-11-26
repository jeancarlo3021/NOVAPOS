'use client';

import React from 'react';
import { Loader2, Clock, HandCoins, Wallet } from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * ANTIGÜEDAD DE SALDOS.
 *
 * ── Por qué no alcanza el total ──────────────────────────────────────────
 * «Dos millones por cobrar» no es una sola situación: si son facturas de
 * esta semana, es operación normal; si tienen seis meses, es plata que
 * probablemente no vuelve y el balance la está mostrando como activo. El
 * corte por tramos es lo único que separa esas dos cosas.
 */

const crc = (n: any) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;

const COLOR: Record<string, string> = {
  al_dia: 'bg-emerald-500', d1_30: 'bg-lime-500', d31_60: 'bg-amber-500',
  d61_90: 'bg-orange-500', d90: 'bg-red-500',
};
const TEXTO: Record<string, string> = {
  al_dia: 'text-emerald-700', d1_30: 'text-lime-700', d31_60: 'text-amber-700',
  d61_90: 'text-orange-700', d90: 'text-red-700',
};

export const Antiguedad: React.FC<{ hasta: string }> = ({ hasta }) => {
  const [d, setD] = React.useState<any>(null);
  const [cargando, setCargando] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let vivo = true;
    setCargando(true); setError('');
    apiFetch<any>(`/accounting/antiguedad?hasta=${hasta}`, {}, 60000)
      .then(r => { if (vivo) setD(r); })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo calcular'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [hasta]);

  if (cargando) return <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Midiendo los atrasos…</p>;
  if (error) return <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>;
  if (!d) return null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 flex items-center gap-1.5">
        <Clock size={13} /> Atrasos medidos al <b>{d.hoy}</b>. Una cuenta sin fecha de vencimiento
        cuenta como al día: no se le puso plazo, así que no se puede decir que esté atrasada.
      </p>

      <Lado titulo="Cuentas por cobrar" icono={HandCoins} datos={d.cobrar} tramos={d.tramos}
        queEs="clientes" vacio="Nadie le debe nada al negocio." />
      <Lado titulo="Cuentas por pagar" icono={Wallet} datos={d.pagar} tramos={d.tramos}
        queEs="proveedores" vacio="El negocio no le debe nada a nadie." />
    </div>
  );
};

const Lado: React.FC<{
  titulo: string; icono: React.ElementType; datos: any;
  tramos: Array<{ id: string; label: string }>; queEs: string; vacio: string;
}> = ({ titulo, icono: Icono, datos, tramos, queEs, vacio }) => {
  const [abierto, setAbierto] = React.useState(true);

  if (!datos?.disponible) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-black text-gray-900 flex items-center gap-2 mb-1">
          <Icono size={15} className="text-gray-400" /> {titulo}
        </h3>
        <p className="text-xs text-gray-500">Este negocio no tiene el módulo de {queEs} activo.</p>
      </div>
    );
  }

  const total = Number(datos.total) || 0;
  const atrasado = tramos.filter(t => t.id !== 'al_dia')
    .reduce((s, t) => s + (Number(datos.tramos[t.id]) || 0), 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
            <Icono size={15} className="text-indigo-600" /> {titulo}
          </h3>
          <div className="text-right">
            <p className="text-xl font-black tabular-nums text-gray-900">{crc(total)}</p>
            <p className="text-[11px] text-gray-500">
              {datos.cuantas} documento(s) · {datos.partes.length} {queEs}
            </p>
          </div>
        </div>

        {total === 0 ? (
          <p className="text-xs text-gray-500 mt-2">{vacio}</p>
        ) : (
          <>
            {/* La barra: de un vistazo, cuánto está sano y cuánto no. */}
            <div className="flex h-3 rounded-full overflow-hidden mt-3 bg-gray-100">
              {tramos.map(t => {
                const v = Number(datos.tramos[t.id]) || 0;
                if (v <= 0) return null;
                return (
                  <div key={t.id} className={COLOR[t.id]} title={`${t.label}: ${crc(v)}`}
                    style={{ width: `${(v / total) * 100}%` }} />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {tramos.map(t => {
                const v = Number(datos.tramos[t.id]) || 0;
                if (v <= 0) return null;
                return (
                  <span key={t.id} className="text-[11px] flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${COLOR[t.id]}`} />
                    <span className="text-gray-500">{t.label}</span>
                    <b className={`tabular-nums ${TEXTO[t.id]}`}>{crc(v)}</b>
                  </span>
                );
              })}
            </div>
            {atrasado > 0 && (
              <p className="text-[11px] text-gray-600 mt-2">
                <b>{crc(atrasado)}</b> ya pasó su fecha de vencimiento
                — el {Math.round((atrasado / total) * 100)}% del saldo.
              </p>
            )}
          </>
        )}
      </div>

      {total > 0 && (
        <>
          <button onClick={() => setAbierto(a => !a)}
            className="w-full px-4 py-2 text-left text-xs font-bold text-indigo-600 hover:bg-gray-50 border-b border-gray-50">
            {abierto ? 'Ocultar el detalle' : `Ver los ${datos.partes.length} ${queEs}`}
          </button>
          {abierto && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2 font-bold">Nombre</th>
                    {tramos.map(t => (
                      <th key={t.id} className="text-right px-2 py-2 font-bold whitespace-nowrap">{t.label}</th>
                    ))}
                    <th className="text-right px-4 py-2 font-bold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {datos.partes.map((p: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-1.5">
                        <span className="text-gray-800">{p.nombre}</span>
                        {p.mas_viejo > 90 && (
                          <span className="ml-2 text-[9px] font-black uppercase bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                            {p.mas_viejo} días
                          </span>
                        )}
                        <span className="block text-[10px] text-gray-400">{p.docs} documento(s)</span>
                      </td>
                      {tramos.map(t => (
                        <td key={t.id} className={`px-2 py-1.5 text-right tabular-nums text-xs ${TEXTO[t.id]}`}>
                          {Number(p.tramos[t.id]) ? crc(p.tramos[t.id]) : ''}
                        </td>
                      ))}
                      <td className="px-4 py-1.5 text-right tabular-nums font-bold">{crc(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Antiguedad;
