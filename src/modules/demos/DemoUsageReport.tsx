import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3, RefreshCw, Loader2, AlertCircle, Download, Flame, Phone, MessageCircle, Search,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

export interface UsoDemo {
  id: string;
  number: string | null;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  status: string;
  requester_name: string | null;
  modules: number;
  demo_tenant_id: string | null;
  delivered_at: string | null;
  expires_on: string | null;
  purge_on: string | null;
  dias_restantes: number | null;
  dias_para_borrarse: number | null;
  dias_desde_entrega: number | null;
  ventas: number;
  monto: number;
  dias_con_ventas: number;
  productos: number;
  usuarios: number;
  cajas: number;
  ultima_venta: string | null;
  dias_sin_vender: number | null;
  ultimo_ingreso: string | null;
  dias_sin_entrar: number | null;
  interes: 'caliente' | 'tibio' | 'cargando' | 'sin uso';
}

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;

const INTERES: Record<UsoDemo['interes'], { label: string; cls: string; que: string }> = {
  caliente: {
    label: 'Caliente', cls: 'bg-red-100 text-red-700',
    que: 'Vendió en tres días distintos o más: ya está trabajando con el sistema.',
  },
  tibio: {
    label: 'Tibio', cls: 'bg-amber-100 text-amber-800',
    que: 'Hizo ventas, pero pocos días: lo probó y hay que empujarlo.',
  },
  cargando: {
    label: 'Cargando', cls: 'bg-sky-100 text-sky-800',
    que: 'Metió productos pero no vendió: se quedó a mitad de camino, conviene acompañarlo.',
  },
  'sin uso': {
    label: 'Sin uso', cls: 'bg-gray-200 text-gray-600',
    que: 'No cargó nada ni vendió. O no entendió por dónde empezar, o no le interesó.',
  },
};

const hace = (dias: number | null) =>
  dias == null ? 'nunca'
    : dias <= 0 ? 'hoy'
    : dias === 1 ? 'ayer'
    : `hace ${dias} días`;

const waNumber = (phone?: string | null) => {
  const d = String(phone ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 8) return `506${d}`;
  if (d.startsWith('00')) return d.slice(2);
  return d;
};

/**
 * USO DE LAS DEMOS.
 *
 * Una demo entregada no dice nada por sí sola. El prospecto que facturó treinta
 * veces en seis días distintos está vendiendo con el sistema y hay que llamarlo
 * HOY, antes de que se le venza; el que hizo tres ventas el primer día y no
 * volvió a entrar lo probó y lo dejó. Hasta ahora eso solo se sabía entrando a
 * cada demo a mirar —así que en la práctica no se sabía— y el vendedor llamaba
 * a todos igual, a ciegas.
 *
 * Lo que más pesa son los DÍAS DISTINTOS con ventas, no el total: veinte
 * facturas de una tarde son una prueba; cinco facturas en cinco días es un
 * negocio que ya cambió de sistema sin darse cuenta.
 */
export const DemoUsageReport: React.FC = () => {
  const [filas, setFilas] = useState<UsoDemo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [soloVivas, setSoloVivas] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const r = await apiFetch<{ demos: UsoDemo[] }>('/demo-requests/usage', {}, 25_000);
      setFilas(Array.isArray(r?.demos) ? r.demos : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el uso de las demos');
    } finally { setCargando(false); }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return filas.filter(f =>
      (!soloVivas || (f.dias_restantes ?? -1) >= 0)
      && (!t || f.business_name.toLowerCase().includes(t)
        || (f.contact_name ?? '').toLowerCase().includes(t)
        || (f.number ?? '').toLowerCase().includes(t)));
  }, [filas, q, soloVivas]);

  const resumen = useMemo(() => ({
    total: filas.length,
    calientes: filas.filter(f => f.interes === 'caliente').length,
    sinUso: filas.filter(f => f.interes === 'sin uso').length,
    vivas: filas.filter(f => (f.dias_restantes ?? -1) >= 0).length,
  }), [filas]);

  const csv = () => {
    const cab = ['Demo', 'Negocio', 'Contacto', 'Telefono', 'Estado', 'Interes', 'Ventas',
      'Monto', 'Dias con ventas', 'Productos', 'Cajas', 'Usuarios', 'Ultima venta',
      'Ultimo ingreso', 'Dias restantes', 'Vendedor'];
    const cuerpo = visibles.map(f => [
      f.number ?? '', f.business_name, f.contact_name ?? '', f.phone ?? '', f.status,
      INTERES[f.interes].label, f.ventas, f.monto, f.dias_con_ventas, f.productos,
      f.cajas, f.usuarios, f.ultima_venta ?? '', f.ultimo_ingreso ?? '',
      f.dias_restantes ?? '', f.requester_name ?? '',
    ]);
    const texto = [cab, ...cuerpo]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${texto}`], { type: 'text/csv;charset=utf-8' }));
    a.download = `uso-demos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-3">
      <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-2 font-black text-gray-900">
          <BarChart3 size={18} className="text-indigo-600" /> Uso de las demos
        </span>
        <div className="hidden sm:block flex-1" />
        <div className="relative flex-1 sm:flex-none sm:w-52 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Negocio o contacto…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-700" />
        </div>
        <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
          <input type="checkbox" checked={soloVivas} onChange={e => setSoloVivas(e.target.checked)}
            className="w-4 h-4 accent-indigo-600" />
          Solo vigentes
        </label>
        <button onClick={() => void cargar()} title="Actualizar"
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <RefreshCw size={16} className={cargando ? 'animate-spin text-gray-400' : 'text-gray-500'} />
        </button>
        <button onClick={csv} disabled={visibles.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 font-bold text-sm disabled:opacity-40">
          <Download size={15} /> CSV
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-semibold">
          <AlertCircle size={16} className="mt-0.5" /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Demos entregadas', String(resumen.total), 'text-gray-900'],
          ['Vigentes', String(resumen.vivas), 'text-gray-900'],
          ['Calientes', String(resumen.calientes), 'text-red-600'],
          ['Sin uso', String(resumen.sinUso), resumen.sinUso > 0 ? 'text-amber-600' : 'text-gray-400'],
        ].map(([t, v, color]) => (
          <div key={t} className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
            <p className="text-[11px] font-bold text-gray-500 uppercase">{t}</p>
            <p className={`text-lg font-black ${color}`}>{v}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {cargando ? (
          <p className="py-14 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Midiendo el uso de cada demo…
          </p>
        ) : visibles.length === 0 ? (
          <p className="py-14 text-center text-gray-400 text-sm">
            {filas.length === 0
              ? 'Todavía no hay demos creadas. El uso aparece cuando una solicitud ya tiene su negocio de prueba armado.'
              : 'Ninguna demo coincide con el filtro.'}
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {visibles.map(f => {
              const int = INTERES[f.interes];
              const wa = waNumber(f.phone);
              const vencida = (f.dias_restantes ?? 0) < 0;
              return (
                <div key={f.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-gray-900 flex items-center gap-2 flex-wrap">
                        {f.interes === 'caliente' && <Flame size={14} className="text-red-500" />}
                        {f.business_name}
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${int.cls}`}>
                          {int.label.toUpperCase()}
                        </span>
                        <span className="text-[11px] font-bold text-gray-400">{f.number}</span>
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {[f.contact_name, f.requester_name && `vendedor: ${f.requester_name}`]
                          .filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {f.phone && (
                        <a href={`tel:${f.phone}`} title="Llamar"
                          className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50">
                          <Phone size={14} />
                        </a>
                      )}
                      {wa && (
                        <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" title="WhatsApp"
                          className="p-2 rounded-xl border border-emerald-200 text-emerald-600 hover:bg-emerald-50">
                          <MessageCircle size={14} />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-center">
                    {[
                      ['Ventas', f.ventas.toLocaleString('es-CR')],
                      ['Días con ventas', String(f.dias_con_ventas)],
                      ['Facturado', money(f.monto)],
                      ['Productos', f.productos.toLocaleString('es-CR')],
                      ['Cajas', String(f.cajas)],
                      ['Usuarios', String(f.usuarios)],
                    ].map(([t, v]) => (
                      <div key={t} className="bg-gray-50 rounded-xl px-2 py-1.5">
                        <p className="text-[10px] font-bold text-gray-400 uppercase leading-tight">{t}</p>
                        <p className="text-sm font-black text-gray-900">{v}</p>
                      </div>
                    ))}
                  </div>

                  <p className="text-[11px] text-gray-500">
                    Última venta: <b>{hace(f.dias_sin_vender)}</b> · Último ingreso: <b>{hace(f.dias_sin_entrar)}</b>
                    {f.dias_restantes != null && (
                      <> · <span className={vencida ? 'text-red-600 font-bold' : 'font-bold'}>
                        {vencida
                          ? `venció hace ${Math.abs(f.dias_restantes)} día(s)`
                          : `le quedan ${f.dias_restantes} día(s)`}
                      </span></>
                    )}
                    {vencida && f.dias_para_borrarse != null && f.status !== 'convertida' && (
                      <> · <span className="text-amber-700 font-bold">
                        {f.dias_para_borrarse >= 0
                          ? `se borra en ${f.dias_para_borrarse} día(s)`
                          : 'pendiente de borrado'}
                      </span></>
                    )}
                  </p>
                  <p className="text-[11px] text-gray-400">{int.que}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400">
        Solo aparecen las solicitudes que ya tienen su negocio de prueba armado: antes de eso no hay
        nada que medir. Las ventas anuladas no cuentan.
      </p>
    </div>
  );
};

export default DemoUsageReport;
