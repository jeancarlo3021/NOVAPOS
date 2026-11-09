import React, { useEffect, useState } from 'react';
import { Bike, Loader2, AlertCircle, MapPin, User } from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * REPORTE DE REPARTO PROPIO — cuántos viajes, de quién y cuánto entró.
 *
 * Distinto del reporte de Delivery, que es el de plataformas (comisión y
 * plata que llega después). Acá el domicilio lo cobra el repartidor del
 * negocio y la plata entra a la caja del día.
 *
 * Tres cortes, que son las tres preguntas que se hacen de verdad: cómo se
 * movió la semana, quién hizo cuántos viajes, y hacia dónde.
 */
interface Corte { clave: string; viajes: number; reparto: number; ventas: number }
interface Datos {
  sin_configurar?: boolean; aviso?: string;
  viajes: number; total: number; promedio: number; total_con_ventas: number;
  por_dia: Corte[]; por_repartidor: Corte[]; por_zona: Corte[];
  ventas: Array<{
    id: string; invoice_number: string; customer_name: string | null; issued_at: string;
    total: number; reparto: number; delivery_person: string | null; delivery_zone: string | null;
  }>;
}

const crc = (n: number) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;
const dia = (f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' });
const hora = (s: string) => new Date(s).toLocaleString('es-CR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export const RepartoReport: React.FC<{ from?: string; to?: string }> = ({ from, to }) => {
  const [d, setD] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true); setError(null);
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    apiFetch<Datos>(`/reports/reparto${q.toString() ? `?${q}` : ''}`)
      .then(r => { if (vivo) setD(r); })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [from, to]);

  if (cargando) {
    return <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
      <Loader2 size={18} className="animate-spin" /> Cargando…
    </div>;
  }
  if (error) {
    return <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-bold text-red-700">
      <AlertCircle size={16} className="mt-0.5" /> {error}
    </div>;
  }
  /* Sin artículo configurado no se puede saber qué línea es el domicilio. Se
     dice cómo arreglarlo, en vez de mostrar ceros que se leen como «no hubo
     repartos». */
  if (d?.sin_configurar) {
    return <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-900">
      {d.aviso} <span className="block font-normal mt-1">
        Creá un servicio «Entrega a domicilio» en Inventario y elegilo en Ajustes → Delivery → Reparto propio.
      </span>
    </div>;
  }
  if (!d || d.viajes === 0) {
    return <div className="bg-white border border-gray-200 rounded-2xl text-center py-14">
      <Bike size={40} className="mx-auto text-gray-200 mb-2" />
      <p className="text-sm text-gray-400">No hay repartos cobrados en este período.</p>
    </div>;
  }

  const Tarjeta = ({ label, valor, color = 'text-gray-900' }: { label: string; valor: string; color?: string }) => (
    <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
      <p className="text-[11px] font-bold text-gray-500">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${color}`}>{valor}</p>
    </div>
  );

  const Corte = ({ titulo, filas, icono: Icono }: { titulo: string; filas: Corte[]; icono: any }) => {
    const tope = Math.max(1, ...filas.map(f => f.reparto));
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <h3 className="font-black text-gray-900 text-sm mb-3 flex items-center gap-1.5"><Icono size={15} /> {titulo}</h3>
        {filas.length === 0 ? <p className="text-xs text-gray-400 py-2">Nada todavía.</p> : (
          <div className="space-y-2.5">
            {filas.map(f => (
              <div key={f.clave}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-bold text-gray-700">{f.clave}</span>
                  <span className="tabular-nums text-xs text-gray-500">
                    {f.viajes} viaje{f.viajes === 1 ? '' : 's'} · <b className="text-emerald-700">{crc(f.reparto)}</b>
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(f.reparto / tope) * 100}%` }} />
                </div>
                {/* Lo vendido va aparte del domicilio: mezclarlos haría parecer
                    que el repartidor vendió el viaje. */}
                <p className="text-[10px] text-gray-400 mt-0.5">y {crc(f.ventas)} en mercadería</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tarjeta label="Viajes" valor={String(d.viajes)} />
        <Tarjeta label="Cobrado de reparto" valor={crc(d.total)} color="text-emerald-700" />
        <Tarjeta label="Promedio por viaje" valor={crc(d.promedio)} />
        <Tarjeta label="Vendido con reparto" valor={crc(d.total_con_ventas)} />
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <h3 className="font-black text-gray-900 text-sm mb-3">Día por día</h3>
        <div className="space-y-2.5">
          {d.por_dia.map(f => {
            const tope = Math.max(1, ...d.por_dia.map(x => x.reparto));
            return (
              <div key={f.clave}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-bold text-gray-700">{dia(f.clave)}</span>
                  <span className="tabular-nums text-xs text-gray-500">
                    {f.viajes} viaje{f.viajes === 1 ? '' : 's'} · <b className="text-emerald-700">{crc(f.reparto)}</b>
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(f.reparto / tope) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Corte titulo="Por repartidor" filas={d.por_repartidor} icono={User} />
        <Corte titulo="Por zona" filas={d.por_zona} icono={MapPin} />
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 font-black text-sm text-gray-700">Viaje por viaje</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Factura</th>
                <th className="px-4 py-2 text-left">Cliente</th>
                <th className="px-4 py-2 text-left">Repartidor</th>
                <th className="px-4 py-2 text-left">Zona</th>
                <th className="px-4 py-2 text-right">Reparto</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {d.ventas.map(v => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <span className="font-bold text-gray-800">{v.invoice_number}</span>
                    <span className="block text-[11px] text-gray-400">{hora(v.issued_at)}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{v.customer_name ?? '—'}</td>
                  <td className="px-4 py-2 text-gray-600">{v.delivery_person ?? <span className="text-gray-300">sin anotar</span>}</td>
                  <td className="px-4 py-2 text-gray-600">{v.delivery_zone ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-2 text-right font-black tabular-nums text-emerald-700">{crc(v.reparto)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-700">{crc(v.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RepartoReport;
