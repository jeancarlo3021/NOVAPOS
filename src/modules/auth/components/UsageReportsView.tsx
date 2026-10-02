import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3, RefreshCw, Search, Download, AlertTriangle, Loader2, ArrowUpDown, Settings2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface FilaUso {
  tenant_id: string;
  name: string;
  is_demo: boolean;
  status: string;
  plan_name: string | null;
  ventas: number;
  monto: number;
  electronicos: number;
  anuladas: number;
  cajas: number;
  ultima_venta: string | null;
  dias_sin_vender: number | null;
  usuarios: number;
  usuarios_activos: number;
  ultimo_ingreso: string | null;
  dias_sin_entrar: number | null;
}

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const VENTANAS = [7, 30, 90] as const;

type Columna = 'name' | 'ventas' | 'monto' | 'electronicos' | 'cajas' | 'dias_sin_vender' | 'usuarios_activos';

/** Hace cuántos días, en palabras. */
const hace = (dias: number | null) =>
  dias == null ? 'nunca'
    : dias <= 0 ? 'hoy'
    : dias === 1 ? 'ayer'
    : `hace ${dias} días`;

/**
 * USO POR NEGOCIO (Panel Admin).
 *
 * Contesta de un golpe dos preguntas que antes había que ir a buscar negocio por
 * negocio:
 *
 *   ¿A quién le estoy cobrando de menos? Un negocio que factura mil veces al mes
 *   no puede pagar lo mismo que uno que factura veinte.
 *
 *   ¿A quién estoy por perder? El que dejó de vender hace tres semanas no avisa
 *   que se va: se va callado, y cuando le llega la factura la cancela. Con la
 *   última venta y el último ingreso a la vista se lo puede llamar antes.
 */
export const UsageReportsView: React.FC = () => {
  const [dias, setDias] = useState<number>(30);
  const [filas, setFilas] = useState<FilaUso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [verDemos, setVerDemos] = useState(false);
  const [orden, setOrden] = useState<{ col: Columna; desc: boolean }>({ col: 'ventas', desc: true });
  const [verConfigFe, setVerConfigFe] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const r = await apiFetch<{ negocios: FilaUso[] }>(`/admin/usage?days=${dias}`);
      setFilas(Array.isArray(r?.negocios) ? r.negocios : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el reporte de uso');
    } finally { setCargando(false); }
  }, [dias]);

  useEffect(() => { void cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    const lista = filas.filter(f =>
      (verDemos || !f.is_demo)
      && (!texto || f.name.toLowerCase().includes(texto) || (f.plan_name ?? '').toLowerCase().includes(texto)));
    const { col, desc } = orden;
    return [...lista].sort((a, b) => {
      if (col === 'name') return desc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
      // «Nunca vendió» va al final de los que más tiempo llevan sin vender.
      const va = col === 'dias_sin_vender' ? (a.dias_sin_vender ?? 9999) : Number(a[col] ?? 0);
      const vb = col === 'dias_sin_vender' ? (b.dias_sin_vender ?? 9999) : Number(b[col] ?? 0);
      return desc ? vb - va : va - vb;
    });
  }, [filas, q, verDemos, orden]);

  const resumen = useMemo(() => {
    const base = filas.filter(f => !f.is_demo);
    return {
      negocios: base.length,
      vendieron: base.filter(f => f.ventas > 0).length,
      quietos: base.filter(f => f.ventas === 0).length,
      monto: base.reduce((t, f) => t + f.monto, 0),
      comprobantes: base.reduce((t, f) => t + f.ventas, 0),
      electronicos: base.reduce((t, f) => t + f.electronicos, 0),
    };
  }, [filas]);

  const ordenarPor = (col: Columna) =>
    setOrden(o => ({ col, desc: o.col === col ? !o.desc : col !== 'name' }));

  const csv = () => {
    const cab = ['Negocio', 'Plan', 'Demo', 'Estado', 'Ventas', 'Monto', 'Electronicos',
      'Anuladas', 'Cajas', 'Ultima venta', 'Dias sin vender', 'Usuarios', 'Usuarios activos', 'Ultimo ingreso'];
    const filasCsv = visibles.map(f => [
      f.name, f.plan_name ?? '', f.is_demo ? 'si' : 'no', f.status,
      f.ventas, f.monto, f.electronicos, f.anuladas, f.cajas,
      f.ultima_venta ?? '', f.dias_sin_vender ?? '', f.usuarios, f.usuarios_activos, f.ultimo_ingreso ?? '',
    ]);
    const texto = [cab, ...filasCsv]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${texto}`], { type: 'text/csv;charset=utf-8' }));
    a.download = `uso-por-negocio-${dias}d.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const Th: React.FC<{ col: Columna; children: React.ReactNode; right?: boolean }> = ({ col, children, right }) => (
    <th className={`px-3 py-2 font-black text-[11px] uppercase tracking-wide text-gray-500 ${right ? 'text-right' : 'text-left'}`}>
      <button onClick={() => ordenarPor(col)}
        className={`inline-flex items-center gap-1 hover:text-gray-900 ${orden.col === col ? 'text-emerald-600' : ''}`}>
        {children} <ArrowUpDown size={11} />
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <BarChart3 size={18} className="text-emerald-600" /> Uso por negocio
          </h2>
          <p className="text-sm text-gray-500">
            Cuánto usa el sistema cada negocio en los últimos {dias} días: ventas, monto facturado,
            comprobantes electrónicos y cuándo fue la última vez que vendieron o entraron.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-xl border border-gray-200 overflow-hidden">
            {VENTANAS.map(d => (
              <button key={d} onClick={() => setDias(d)}
                className={`px-3 py-2 text-xs font-bold ${
                  dias === d ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {d} días
              </button>
            ))}
          </div>
          <button onClick={() => void cargar()} disabled={cargando}
            title="Actualizar" className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40">
            <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />
          </button>
          <button onClick={csv} disabled={visibles.length === 0}
            className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1.5">
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-semibold">
          <AlertTriangle size={16} className="mt-0.5" /> {error}
        </div>
      )}

      {/* Resumen (sin contar demos: no son clientes) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          ['Negocios de pago', String(resumen.negocios), 'text-gray-900'],
          ['Vendieron', String(resumen.vendieron), 'text-emerald-600'],
          ['Sin una sola venta', String(resumen.quietos), resumen.quietos > 0 ? 'text-amber-600' : 'text-gray-400'],
          ['Comprobantes', `${resumen.comprobantes.toLocaleString('es-CR')} · ${resumen.electronicos.toLocaleString('es-CR')} FE`, 'text-gray-900'],
          ['Facturado', money(resumen.monto), 'text-gray-900'],
        ].map(([t, v, color]) => (
          <div key={t} className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
            <p className="text-[11px] font-bold text-gray-500 uppercase">{t}</p>
            <p className={`text-lg font-black ${color}`}>{v}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar negocio o plan…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400" />
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
          <input type="checkbox" checked={verDemos} onChange={e => setVerDemos(e.target.checked)}
            className="w-4 h-4 accent-emerald-600" />
          Incluir demos
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
        {cargando ? (
          <p className="py-14 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Midiendo el uso de {dias} días…
          </p>
        ) : visibles.length === 0 ? (
          <p className="py-14 text-center text-gray-400 text-sm">No hay negocios que mostrar.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <Th col="name">Negocio</Th>
                <Th col="ventas" right>Ventas</Th>
                <Th col="monto" right>Facturado</Th>
                <Th col="electronicos" right>FE</Th>
                <Th col="cajas" right>Cajas</Th>
                <Th col="dias_sin_vender">Última venta</Th>
                <Th col="usuarios_activos">Usuarios</Th>
                <th className="px-3 py-2 text-left font-black text-[11px] uppercase tracking-wide text-gray-500">
                  Último ingreso
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visibles.map(f => {
                // Riesgo: sin vender en más de una semana (o nunca) en la ventana.
                const quieto = f.ventas === 0;
                const flojo = !quieto && (f.dias_sin_vender ?? 0) > 7;
                return (
                  <tr key={f.tenant_id} className={quieto ? 'bg-amber-50/60' : ''}>
                    <td className="px-3 py-2">
                      <p className="font-bold text-gray-900 flex items-center gap-1.5">
                        {f.name}
                        {f.is_demo && <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">DEMO</span>}
                        {f.status !== 'active' && <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">{f.status}</span>}
                      </p>
                      <p className="text-[11px] text-gray-400">{f.plan_name ?? 'sin plan'}</p>
                    </td>
                    <td className="px-3 py-2 text-right font-black text-gray-900">
                      {f.ventas.toLocaleString('es-CR')}
                      {f.anuladas > 0 && (
                        <span className="block text-[10px] font-bold text-red-500">{f.anuladas} anuladas</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-gray-800 whitespace-nowrap">{money(f.monto)}</td>
                    <td className="px-3 py-2 text-right font-bold text-gray-600">{f.electronicos.toLocaleString('es-CR')}</td>
                    <td className="px-3 py-2 text-right font-bold text-gray-600">{f.cajas}</td>
                    <td className={`px-3 py-2 font-bold whitespace-nowrap ${
                      quieto ? 'text-amber-700' : flojo ? 'text-amber-600' : 'text-gray-600'}`}>
                      {quieto ? 'nada en la ventana' : hace(f.dias_sin_vender)}
                    </td>
                    <td className="px-3 py-2 font-bold text-gray-600 whitespace-nowrap">
                      {f.usuarios_activos}/{f.usuarios}
                    </td>
                    <td className="px-3 py-2 font-bold text-gray-600 whitespace-nowrap">
                      {hace(f.dias_sin_entrar)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[11px] text-gray-400">
        Las ventas anuladas no suman al monto. «FE» son los comprobantes que de verdad se emitieron a
        Hacienda (con clave y sin rechazo). «Cajas» son las aperturas de caja del período: un negocio
        que vende sin abrir caja aparece en 0, y eso también dice algo.
      </p>

      {/* La configuración de FE y Kiosk por sucursal vivía en esta pestaña. Se
          deja a un clic para no perderla: ahí está el proveedor de sistemas
          (global) y el interruptor de kiosk, que no se configuran en otro lado. */}
      <div className="pt-2 border-t border-gray-100">
        <button onClick={() => setVerConfigFe(v => !v)}
          className="text-xs font-bold text-gray-500 hover:text-gray-900 flex items-center gap-1.5">
          <Settings2 size={13} /> {verConfigFe ? 'Ocultar' : 'Mostrar'} configuración de FE y Kiosk por sucursal
        </button>
        {verConfigFe && (
          <div className="mt-4">
            <ConfigFeKiosk />
          </div>
        )}
      </div>
    </div>
  );
};

/** Se carga solo si se pide: trae la config de FE de cada sucursal. */
const ConfigFeKiosk: React.FC = () => {
  const [Vista, setVista] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    void import('./AdminFeKioskView').then(m => setVista(() => m.AdminFeKioskView));
  }, []);
  if (!Vista) {
    return <p className="text-sm text-gray-400 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Cargando…</p>;
  }
  return <Vista />;
};

export default UsageReportsView;
