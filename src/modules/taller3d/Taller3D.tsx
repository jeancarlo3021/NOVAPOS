import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Printer, TrendingUp, TrendingDown, CalendarDays, Plus, Trash2, Loader2, X,
  AlertCircle, CheckCircle2, Clock, Play, Package, Settings2, RefreshCw, Zap,
} from 'lucide-react';
import {
  taller3d, type Venta, type Gasto, type Resumen, type Impresora,
  type Impresion, type Calendario, type ConfigTaller,
} from '@/services/taller3d/taller3dService';

/**
 * TALLER 3D — el día del taller en una sola pantalla.
 *
 * Cuatro pestañas que son las cuatro preguntas del dueño: cuánto entró, cuánto
 * salió, qué hay que imprimir y con qué máquinas cuento.
 *
 * Las ventas y los gastos se anotan A MANO porque en este negocio la venta no
 * pasa por la caja: se cotiza por WhatsApp y se cobra por SINPE. Lo que hace
 * falta es una bitácora honesta del día, no una factura por cada llavero.
 */

const plata = (n: number) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;
const hoyCR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const dia = (f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' });
const hora = (s?: string | null) =>
  s ? new Date(s).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const MEDIOS = [
  { v: 'efectivo', l: 'Efectivo' }, { v: 'sinpe', l: 'SINPE' }, { v: 'tarjeta', l: 'Tarjeta' },
  { v: 'transferencia', l: 'Transferencia' }, { v: 'otro', l: 'Otro' },
] as const;
const CAT_VENTA = [
  { v: 'impresion', l: 'Impresión' }, { v: 'diseno', l: 'Diseño' }, { v: 'material', l: 'Material' },
  { v: 'reparacion', l: 'Reparación' }, { v: 'otro', l: 'Otro' },
] as const;
const CAT_GASTO = [
  { v: 'filamento', l: 'Filamento' }, { v: 'resina', l: 'Resina' }, { v: 'electricidad', l: 'Electricidad' },
  { v: 'repuestos', l: 'Repuestos' }, { v: 'envio', l: 'Envío' }, { v: 'otro', l: 'Otro' },
] as const;
const ETIQUETA: Record<string, string> = Object.fromEntries(
  [...MEDIOS, ...CAT_VENTA, ...CAT_GASTO].map(x => [x.v, x.l]));

type Pestania = 'ventas' | 'gastos' | 'impresiones' | 'maquinas';

export const Taller3D: React.FC = () => {
  const [tab, setTab] = useState<Pestania>('ventas');
  const [fecha, setFecha] = useState(hoyCR());
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-gray-100 p-3 sm:p-6 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Printer size={24} className="text-violet-600" />
        <h1 className="text-2xl font-black text-gray-900">Taller 3D</h1>
        {(tab === 'ventas' || tab === 'gastos') && (
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value || hoyCR())}
            className="ml-auto px-3 py-2 border-2 border-gray-200 rounded-xl text-sm font-black text-gray-800" />
        )}
        {(tab === 'ventas' || tab === 'gastos') && fecha !== hoyCR() && (
          <button onClick={() => setFecha(hoyCR())}
            className="px-3 py-2 rounded-xl border-2 border-gray-200 bg-white text-xs font-black text-gray-600">
            Hoy
          </button>
        )}
      </div>

      <nav className="bg-white border border-gray-200 rounded-2xl p-1.5 flex gap-1 overflow-x-auto">
        <Tab on={tab === 'ventas'} onClick={() => setTab('ventas')} icon={TrendingUp} label="Ventas del día" />
        <Tab on={tab === 'gastos'} onClick={() => setTab('gastos')} icon={TrendingDown} label="Gastos" />
        <Tab on={tab === 'impresiones'} onClick={() => setTab('impresiones')} icon={CalendarDays} label="Impresiones" />
        <Tab on={tab === 'maquinas'} onClick={() => setTab('maquinas')} icon={Settings2} label="Impresoras" />
      </nav>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-bold text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={15} /></button>
        </div>
      )}
      {aviso && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-bold text-emerald-800">
          <CheckCircle2 size={16} /> {aviso}
        </div>
      )}

      {tab === 'ventas' && <PanelVentas fecha={fecha} onError={setError} onAviso={setAviso} />}
      {tab === 'gastos' && <PanelGastos fecha={fecha} onError={setError} onAviso={setAviso} />}
      {tab === 'impresiones' && <PanelImpresiones onError={setError} onAviso={setAviso} />}
      {tab === 'maquinas' && <PanelMaquinas onError={setError} onAviso={setAviso} />}
    </div>
  );
};

// ══════════════════════════ VENTAS ══════════════════════════

function PanelVentas({ fecha, onError, onAviso }: {
  fecha: string; onError: (s: string) => void; onAviso: (s: string) => void;
}) {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const vacio = { descripcion: '', cliente: '', cantidad: '1', precio_unitario: '', medio_pago: 'sinpe', categoria: 'impresion' };
  const [f, setF] = useState<Record<string, string>>(vacio);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [v, r] = await Promise.all([taller3d.ventas(fecha), taller3d.resumen(fecha)]);
      setVentas(v); setResumen(r);
    } catch (e) { onError(e instanceof Error ? e.message : 'No se pudo cargar el día'); }
    finally { setCargando(false); }
  }, [fecha, onError]);
  useEffect(() => { void cargar(); }, [cargar]);

  const total = (Number(f.cantidad) || 0) * (Number(f.precio_unitario) || 0);

  const agregar = async () => {
    if (!f.descripcion.trim()) { onError('¿Qué se vendió?'); return; }
    setGuardando(true);
    try {
      await taller3d.nuevaVenta({
        fecha, descripcion: f.descripcion.trim(), cliente: f.cliente.trim() || null,
        cantidad: Number(f.cantidad) || 1, precio_unitario: Number(f.precio_unitario) || 0,
        medio_pago: f.medio_pago as any, categoria: f.categoria as any,
      });
      setF({ ...vacio, medio_pago: f.medio_pago, categoria: f.categoria });
      onAviso('Venta anotada');
      await cargar();
    } catch (e) { onError(e instanceof Error ? e.message : 'No se pudo anotar'); }
    finally { setGuardando(false); }
  };

  const borrar = async (v: Venta) => {
    if (!confirm(`¿Borrar "${v.descripcion}" de ${plata(v.total)}?`)) return;
    try { await taller3d.borrarVenta(v.id); await cargar(); }
    catch (e) { onError(e instanceof Error ? e.message : 'No se pudo borrar'); }
  };

  return (
    <div className="space-y-4">
      {/* El día en números */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tarjeta label="Vendido" valor={plata(resumen?.ventas.total ?? 0)} color="text-emerald-700" />
        <Tarjeta label="Ventas" valor={String(resumen?.ventas.cuantas ?? 0)} />
        <Tarjeta label="Gastado" valor={plata(resumen?.gastos.total ?? 0)} color="text-red-600" />
        <Tarjeta label="Queda" valor={plata(resumen?.queda ?? 0)}
          color={(resumen?.queda ?? 0) >= 0 ? 'text-gray-900' : 'text-red-600'} />
      </div>

      {/* El desglose: por dónde entró y de qué fue */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Desglose titulo="Por medio de pago" filas={resumen?.ventas.por_medio ?? []} />
        <Desglose titulo="Por tipo de trabajo" filas={resumen?.ventas.por_categoria ?? []} />
      </div>

      {/* Anotar una venta */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <h2 className="font-black text-gray-900 flex items-center gap-2"><Plus size={17} className="text-emerald-600" /> Anotar una venta</h2>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
          <input value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })}
            placeholder="Qué se vendió" className="sm:col-span-2 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          <input value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })}
            placeholder="Cliente (opcional)" className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          <input type="number" inputMode="decimal" value={f.cantidad} onChange={e => setF({ ...f, cantidad: e.target.value })}
            placeholder="Cant." className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm text-right" />
          <input type="number" inputMode="decimal" value={f.precio_unitario} onChange={e => setF({ ...f, precio_unitario: e.target.value })}
            placeholder="Precio c/u" className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm text-right" />
          <div className="flex items-center justify-end font-black text-lg tabular-nums text-emerald-700">{plata(total)}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={f.medio_pago} onChange={e => setF({ ...f, medio_pago: e.target.value })}
            className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold bg-white">
            {MEDIOS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
          <select value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })}
            className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold bg-white">
            {CAT_VENTA.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
          <button onClick={() => void agregar()} disabled={guardando}
            className="ml-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center gap-1.5 disabled:opacity-50">
            {guardando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Agregar
          </button>
        </div>
      </div>

      <Listado
        cargando={cargando} vacio="Todavía no hay ventas anotadas este día."
        filas={ventas.map(v => ({
          id: v.id,
          titulo: v.descripcion,
          sub: [v.cliente, `${v.cantidad} × ${plata(v.precio_unitario)}`, ETIQUETA[v.medio_pago], ETIQUETA[v.categoria]]
            .filter(Boolean).join(' · '),
          monto: plata(v.total), color: 'text-emerald-700',
          onBorrar: () => void borrar(v),
        }))} />
    </div>
  );
}

// ══════════════════════════ GASTOS ══════════════════════════

function PanelGastos({ fecha, onError, onAviso }: {
  fecha: string; onError: (s: string) => void; onAviso: (s: string) => void;
}) {
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const vacio = { descripcion: '', proveedor: '', monto: '', medio_pago: 'efectivo', categoria: 'filamento' };
  const [f, setF] = useState<Record<string, string>>(vacio);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [g, r] = await Promise.all([taller3d.gastos(fecha), taller3d.resumen(fecha)]);
      setGastos(g); setResumen(r);
    } catch (e) { onError(e instanceof Error ? e.message : 'No se pudieron cargar los gastos'); }
    finally { setCargando(false); }
  }, [fecha, onError]);
  useEffect(() => { void cargar(); }, [cargar]);

  const agregar = async () => {
    if (!f.descripcion.trim()) { onError('¿En qué se gastó?'); return; }
    setGuardando(true);
    try {
      await taller3d.nuevoGasto({
        fecha, descripcion: f.descripcion.trim(), proveedor: f.proveedor.trim() || null,
        monto: Number(f.monto) || 0, medio_pago: f.medio_pago as any, categoria: f.categoria as any,
      });
      setF({ ...vacio, medio_pago: f.medio_pago, categoria: f.categoria });
      onAviso('Gasto anotado');
      await cargar();
    } catch (e) { onError(e instanceof Error ? e.message : 'No se pudo anotar'); }
    finally { setGuardando(false); }
  };

  const borrar = async (g: Gasto) => {
    if (!confirm(`¿Borrar "${g.descripcion}" de ${plata(g.monto)}?`)) return;
    try { await taller3d.borrarGasto(g.id); await cargar(); }
    catch (e) { onError(e instanceof Error ? e.message : 'No se pudo borrar'); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tarjeta label="Gastado" valor={plata(resumen?.gastos.total ?? 0)} color="text-red-600" />
        <Tarjeta label="Gastos" valor={String(resumen?.gastos.cuantos ?? 0)} />
        <Tarjeta label="Vendido" valor={plata(resumen?.ventas.total ?? 0)} color="text-emerald-700" />
        <Tarjeta label="Queda" valor={plata(resumen?.queda ?? 0)}
          color={(resumen?.queda ?? 0) >= 0 ? 'text-gray-900' : 'text-red-600'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Desglose titulo="En qué se fue" filas={resumen?.gastos.por_categoria ?? []} />
        <Desglose titulo="Con qué se pagó" filas={resumen?.gastos.por_medio ?? []} />
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <h2 className="font-black text-gray-900 flex items-center gap-2"><Plus size={17} className="text-red-500" /> Anotar un gasto</h2>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          <input value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })}
            placeholder="En qué se gastó" className="sm:col-span-2 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          <input value={f.proveedor} onChange={e => setF({ ...f, proveedor: e.target.value })}
            placeholder="Proveedor (opcional)" className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          <input type="number" inputMode="decimal" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })}
            placeholder="Monto" className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm text-right font-black" />
          <div className="flex items-center justify-end font-black text-lg tabular-nums text-red-600">{plata(Number(f.monto) || 0)}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })}
            className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold bg-white">
            {CAT_GASTO.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
          <select value={f.medio_pago} onChange={e => setF({ ...f, medio_pago: e.target.value })}
            className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold bg-white">
            {MEDIOS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
          <button onClick={() => void agregar()} disabled={guardando}
            className="ml-auto px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-sm flex items-center gap-1.5 disabled:opacity-50">
            {guardando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Agregar
          </button>
        </div>
      </div>

      <Listado
        cargando={cargando} vacio="Sin gastos anotados este día."
        filas={gastos.map(g => ({
          id: g.id,
          titulo: g.descripcion,
          sub: [g.proveedor, ETIQUETA[g.categoria], ETIQUETA[g.medio_pago]].filter(Boolean).join(' · '),
          monto: plata(g.monto), color: 'text-red-600',
          onBorrar: () => void borrar(g),
        }))} />
    </div>
  );
}

// ══════════════════════════ IMPRESIONES ══════════════════════════

function PanelImpresiones({ onError, onAviso }: { onError: (s: string) => void; onAviso: (s: string) => void }) {
  const [cal, setCal] = useState<Calendario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const vacio = { pieza: '', cliente: '', cantidad: '1', horas: '', material: '', color: '', fecha_limite: '', urgente: false };
  const [f, setF] = useState<any>(vacio);
  /** Lo que el planificador respondió al meter la última pieza. */
  const [recien, setRecien] = useState<{ pieza: string; impresora: string; entrega: string; fin: string; tarde: boolean } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setCal(await taller3d.calendario()); }
    catch (e) { onError(e instanceof Error ? e.message : 'No se pudo cargar el calendario'); }
    finally { setCargando(false); }
  }, [onError]);
  useEffect(() => { void cargar(); }, [cargar]);

  const nombreMaquina = useMemo(() => {
    const m = new Map<string, string>();
    (cal?.impresoras ?? []).forEach(i => m.set(i.id, i.nombre));
    return m;
  }, [cal]);

  const agregar = async () => {
    if (!f.pieza.trim()) { onError('¿Qué pieza es?'); return; }
    if (!(Number(f.horas) > 0)) { onError('Decime cuánto dura la pieza, en horas.'); return; }
    setGuardando(true);
    try {
      const r = await taller3d.nuevaImpresion({
        pieza: f.pieza.trim(), cliente: f.cliente.trim() || null,
        cantidad: Number(f.cantidad) || 1, horas: Number(f.horas),
        material: f.material.trim() || null, color: f.color.trim() || null,
        prioridad: f.urgente ? 1 : 0, fecha_limite: f.fecha_limite || null,
      });
      setF({ ...vacio });
      if (r.plan) {
        setRecien({
          pieza: r.pieza, impresora: nombreMaquina.get(r.plan.impresora_id) ?? 'una impresora',
          entrega: r.plan.entrega_estimada, fin: r.plan.fin, tarde: r.plan.tarde,
        });
      } else {
        onAviso('Pieza en cola. Agregá una impresora para poder programarla.');
      }
      await cargar();
    } catch (e) { onError(e instanceof Error ? e.message : 'No se pudo agregar la pieza'); }
    finally { setGuardando(false); }
  };

  const replanificar = async () => {
    try {
      const r = await taller3d.planificar();
      onAviso(`${r.programados} pieza(s) reprogramadas${r.tarde > 0 ? ` · ${r.tarde} no llegan a la fecha` : ''}`);
      await cargar();
    } catch (e) { onError(e instanceof Error ? e.message : 'No se pudo replanificar'); }
  };

  const mover = async (t: Impresion, estado: any) => {
    try { await taller3d.estadoImpresion(t.id, estado); await cargar(); }
    catch (e) { onError(e instanceof Error ? e.message : 'No se pudo cambiar'); }
  };

  const borrar = async (t: Impresion) => {
    if (!confirm(`¿Quitar "${t.pieza}" de la cola?`)) return;
    try { await taller3d.borrarImpresion(t.id); await cargar(); }
    catch (e) { onError(e instanceof Error ? e.message : 'No se pudo quitar'); }
  };

  const sinMaquinas = (cal?.impresoras ?? []).filter(i => i.activa).length === 0;

  return (
    <div className="space-y-4">
      {sinMaquinas && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 border-2 border-amber-200 px-4 py-3 text-sm font-bold text-amber-900">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>Todavía no hay impresoras. Agregá al menos una en la pestaña «Impresoras» para que el planificador pueda repartir el trabajo.</span>
        </div>
      )}

      {/* Nueva pieza: lo único que hay que saber es cuánto dura. */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <h2 className="font-black text-gray-900 flex items-center gap-2">
          <Plus size={17} className="text-violet-600" /> Nueva pieza
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
          <input value={f.pieza} onChange={e => setF({ ...f, pieza: e.target.value })}
            placeholder="Qué pieza" className="sm:col-span-2 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          <input value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })}
            placeholder="Cliente" className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          <input type="number" inputMode="numeric" value={f.cantidad} onChange={e => setF({ ...f, cantidad: e.target.value })}
            placeholder="Cant." className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm text-right" />
          <input type="number" inputMode="decimal" step="0.5" value={f.horas} onChange={e => setF({ ...f, horas: e.target.value })}
            placeholder="Horas c/u" className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm text-right font-black" />
          <div className="flex items-center text-xs font-bold text-gray-500">
            {Number(f.horas) > 0 ? `${(Number(f.horas) * (Number(f.cantidad) || 1)).toFixed(1)} h de máquina` : 'cuánto dura'}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input value={f.material} onChange={e => setF({ ...f, material: e.target.value })}
            placeholder="Material (PLA, PETG…)" className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          <input value={f.color} onChange={e => setF({ ...f, color: e.target.value })}
            placeholder="Color" className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          {/* La fecha va con su rótulo pegado: un campo de fecha vacío y
              suelto no dice si es la fecha de hoy, la de entrega o cuál. */}
          <label className="col-span-2 flex items-center gap-2 px-3 py-1.5 border-2 border-gray-200 rounded-xl">
            <span className="text-xs font-bold text-gray-500 shrink-0">Para cuándo la quiere</span>
            <input type="date" value={f.fecha_limite} onChange={e => setF({ ...f, fecha_limite: e.target.value })}
              className="flex-1 min-w-0 py-1 text-sm outline-none bg-transparent" />
          </label>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setF({ ...f, urgente: !f.urgente })}
            className={`px-3 py-2 rounded-xl text-xs font-black border-2 flex items-center gap-1.5 ${
              f.urgente ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-gray-200 text-gray-500'}`}>
            <Zap size={13} /> Urgente
          </button>
          <button onClick={() => void replanificar()}
            className="px-3 py-2 rounded-xl text-xs font-black border-2 border-gray-200 bg-white text-gray-600 flex items-center gap-1.5">
            <RefreshCw size={13} /> Replanificar
          </button>
          <button onClick={() => void agregar()} disabled={guardando}
            className="ml-auto px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black text-sm flex items-center gap-1.5 disabled:opacity-50">
            {guardando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Programar
          </button>
        </div>

        {/* La respuesta del planificador, que es a lo que uno vino. */}
        {recien && (
          <div className={`rounded-xl border-2 px-4 py-3 ${recien.tarde
            ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-violet-50 border-violet-200 text-violet-900'}`}>
            <p className="font-black">
              {recien.pieza} entra en {recien.impresora}.
            </p>
            <p className="text-sm mt-0.5">
              Termina el {hora(recien.fin)} · se puede entregar el <b>{dia(recien.entrega)}</b>.
              {recien.tarde && ' No llega para la fecha que pediste.'}
            </p>
          </div>
        )}
      </div>

      {/* El calendario: por día de entrega */}
      {cargando && !cal ? (
        <div className="flex items-center justify-center py-14 text-gray-400 gap-2">
          <Loader2 size={18} className="animate-spin" /> Cargando…
        </div>
      ) : (
        <>
          {(cal?.sin_programar.length ?? 0) > 0 && (
            <Dia fecha={null} items={cal!.sin_programar} nombreMaquina={nombreMaquina} onMover={mover} onBorrar={borrar} />
          )}
          {(cal?.dias.length ?? 0) === 0 && (cal?.sin_programar.length ?? 0) === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl text-center py-14">
              <Package size={40} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">No hay piezas en cola.</p>
            </div>
          ) : (cal?.dias ?? []).map(d => (
            <Dia key={d.fecha} fecha={d.fecha} items={d.items} nombreMaquina={nombreMaquina} onMover={mover} onBorrar={borrar} />
          ))}
        </>
      )}
    </div>
  );
}

const ESTADO_TEXTO: Record<string, { l: string; c: string }> = {
  en_cola: { l: 'En cola', c: 'bg-gray-100 text-gray-600' },
  programado: { l: 'Programada', c: 'bg-violet-100 text-violet-700' },
  imprimiendo: { l: 'Imprimiendo', c: 'bg-blue-100 text-blue-700' },
  listo: { l: 'Lista', c: 'bg-emerald-100 text-emerald-700' },
  entregado: { l: 'Entregada', c: 'bg-gray-100 text-gray-500' },
  cancelado: { l: 'Cancelada', c: 'bg-red-100 text-red-600' },
};

function Dia({ fecha, items, nombreMaquina, onMover, onBorrar }: {
  fecha: string | null; items: Impresion[];
  nombreMaquina: Map<string, string>;
  onMover: (t: Impresion, estado: string) => void;
  onBorrar: (t: Impresion) => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className={`px-4 py-2.5 font-black text-sm flex items-center gap-2 ${
        fecha ? 'bg-violet-50 text-violet-900' : 'bg-amber-50 text-amber-900'}`}>
        <CalendarDays size={15} />
        {fecha ? dia(fecha) : 'Sin programar'}
        <span className="ml-auto text-xs font-bold opacity-70">{items.length} pieza(s)</span>
      </div>
      <div className="divide-y divide-gray-100">
        {items.map(t => (
          <div key={t.id} className="px-4 py-3 flex items-start gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-gray-900">
                {t.cantidad > 1 ? `${t.cantidad} × ` : ''}{t.pieza}
                {t.prioridad > 0 && (
                  <span className="ml-1.5 text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">URGENTE</span>
                )}
                {t.tarde && (
                  <span className="ml-1.5 text-[10px] font-black px-1.5 py-0.5 rounded bg-red-100 text-red-700">NO LLEGA</span>
                )}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {[t.cliente, [t.material, t.color].filter(Boolean).join(' '),
                  t.impresora_id ? nombreMaquina.get(t.impresora_id) : null,
                  `${t.horas} h c/u`].filter(Boolean).join(' · ')}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                <Clock size={10} /> {hora(t.inicio)} → {hora(t.fin)}
                {t.fecha_limite ? ` · pedida para ${dia(t.fecha_limite)}` : ''}
              </p>
            </div>
            <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${ESTADO_TEXTO[t.estado]?.c ?? ''}`}>
              {ESTADO_TEXTO[t.estado]?.l ?? t.estado}
            </span>
            <div className="flex items-center gap-1.5">
              {(t.estado === 'programado' || t.estado === 'en_cola') && (
                <button onClick={() => onMover(t, 'imprimiendo')} title="Arrancó la impresión"
                  className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-black flex items-center gap-1">
                  <Play size={12} /> Arrancó
                </button>
              )}
              {t.estado === 'imprimiendo' && (
                <button onClick={() => onMover(t, 'listo')} title="Terminó"
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-black flex items-center gap-1">
                  <CheckCircle2 size={12} /> Lista
                </button>
              )}
              {t.estado === 'listo' && (
                <button onClick={() => onMover(t, 'entregado')}
                  className="px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-black flex items-center gap-1">
                  <Package size={12} /> Entregada
                </button>
              )}
              <button onClick={() => onBorrar(t)} title="Quitar de la cola"
                className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════ IMPRESORAS ══════════════════════════

function PanelMaquinas({ onError, onAviso }: { onError: (s: string) => void; onAviso: (s: string) => void }) {
  const [maquinas, setMaquinas] = useState<Impresora[]>([]);
  const [cfg, setCfg] = useState<ConfigTaller | null>(null);
  const [nombre, setNombre] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [m, c] = await Promise.all([taller3d.impresoras(), taller3d.config()]);
      setMaquinas(m); setCfg(c);
    } catch (e) { onError(e instanceof Error ? e.message : 'No se pudo cargar'); }
    finally { setCargando(false); }
  }, [onError]);
  useEffect(() => { void cargar(); }, [cargar]);

  const agregar = async () => {
    if (!nombre.trim()) return;
    try { await taller3d.nuevaImpresora(nombre.trim()); setNombre(''); onAviso('Impresora agregada'); await cargar(); }
    catch (e) { onError(e instanceof Error ? e.message : 'No se pudo agregar'); }
  };

  const guardarCfg = async (patch: Partial<ConfigTaller>) => {
    try {
      const c = await taller3d.guardarConfig({ ...cfg, ...patch });
      setCfg(c); onAviso('Guardado · se replanificó la cola');
    } catch (e) { onError(e instanceof Error ? e.message : 'No se pudo guardar'); }
  };

  const DIAS = [{ n: 1, l: 'Lun' }, { n: 2, l: 'Mar' }, { n: 3, l: 'Mié' }, { n: 4, l: 'Jue' },
    { n: 5, l: 'Vie' }, { n: 6, l: 'Sáb' }, { n: 0, l: 'Dom' }];

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <h2 className="font-black text-gray-900">Impresoras</h2>
        <p className="text-xs text-gray-500">
          El planificador reparte el trabajo entre las que estén encendidas, y da por hecho que
          trabajan de corrido, también de noche.
        </p>
        <div className="flex gap-2">
          <input value={nombre} onChange={e => setNombre(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void agregar()}
            placeholder="Nombre (ej. Ender 3 · Bambu A1)"
            className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          <button onClick={() => void agregar()} disabled={!nombre.trim()}
            className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-gray-200 text-white font-black text-sm flex items-center gap-1.5">
            <Plus size={15} /> Agregar
          </button>
        </div>
        {cargando ? (
          <p className="text-sm text-gray-400 py-4 text-center">Cargando…</p>
        ) : maquinas.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Sin impresoras todavía.</p>
        ) : (
          <div className="space-y-1.5">
            {maquinas.map(m => (
              <div key={m.id} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-100">
                <Printer size={15} className={m.activa ? 'text-violet-600' : 'text-gray-300'} />
                <span className={`flex-1 font-bold ${m.activa ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{m.nombre}</span>
                <button onClick={() => void taller3d.cambiarImpresora(m.id, { activa: !m.activa }).then(cargar)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black ${
                    m.activa ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {m.activa ? 'Encendida' : 'Apagada'}
                </button>
                <button onClick={async () => {
                  if (!confirm(`¿Quitar "${m.nombre}"?`)) return;
                  try { await taller3d.borrarImpresora(m.id); await cargar(); }
                  catch (e) { onError(e instanceof Error ? e.message : 'No se pudo'); }
                }} className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {cfg && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
          <h2 className="font-black text-gray-900">Cómo se calculan las entregas</h2>
          <div>
            <label className="block font-bold text-gray-800 text-sm">Horas entre que termina y puede salir</label>
            <p className="text-xs text-gray-500 mb-2">Enfriar, quitar soportes y empacar. Se suman al final de cada pieza.</p>
            <input type="number" min={0} max={72} value={cfg.margen_horas}
              onChange={e => setCfg({ ...cfg, margen_horas: Number(e.target.value) || 0 })}
              onBlur={() => void guardarCfg({ margen_horas: cfg.margen_horas })}
              className="w-28 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-right font-black" />
          </div>
          <div>
            <label className="block font-bold text-gray-800 text-sm">Hora de corte de entregas</label>
            <p className="text-xs text-gray-500 mb-2">Lo que queda listo después de esta hora se entrega al día siguiente.</p>
            <input type="time" value={cfg.hora_corte_entrega}
              onChange={e => setCfg({ ...cfg, hora_corte_entrega: e.target.value })}
              onBlur={() => void guardarCfg({ hora_corte_entrega: cfg.hora_corte_entrega })}
              className="px-3 py-2.5 border-2 border-gray-200 rounded-xl font-black" />
          </div>
          <div>
            <label className="block font-bold text-gray-800 text-sm mb-2">Días en que se entrega</label>
            <div className="flex flex-wrap gap-1.5">
              {DIAS.map(d => {
                const on = cfg.dias_entrega.includes(d.n);
                return (
                  <button key={d.n}
                    onClick={() => void guardarCfg({
                      dias_entrega: on ? cfg.dias_entrega.filter(x => x !== d.n) : [...cfg.dias_entrega, d.n],
                    })}
                    className={`px-3.5 py-2 rounded-xl text-sm font-black border-2 ${
                      on ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-gray-200 text-gray-500'}`}>
                    {d.l}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════ piezas sueltas ══════════════════════════

function Tab({ on, onClick, icon: Icon, label }: {
  on: boolean; onClick: () => void;
  icon: React.ComponentType<{ size?: number; className?: string }>; label: string;
}) {
  return (
    <button onClick={onClick}
      className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-black transition ${
        on ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
      <Icon size={15} /> {label}
    </button>
  );
}

function Tarjeta({ label, valor, color = 'text-gray-900' }: { label: string; valor: string; color?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
      <p className="text-[11px] font-bold text-gray-500">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${color}`}>{valor}</p>
    </div>
  );
}

function Desglose({ titulo, filas }: { titulo: string; filas: Array<{ clave: string; monto: number; cuantos: number }> }) {
  const total = filas.reduce((s, f) => s + f.monto, 0);
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <h3 className="font-black text-gray-900 text-sm mb-2">{titulo}</h3>
      {filas.length === 0 ? (
        <p className="text-xs text-gray-400 py-3">Nada todavía.</p>
      ) : (
        <div className="space-y-2">
          {filas.map(f => (
            <div key={f.clave}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-bold text-gray-700">{ETIQUETA[f.clave] ?? f.clave}</span>
                <span className="tabular-nums font-black text-gray-900">{plata(f.monto)}</span>
              </div>
              {/* La barra hace comparable de un vistazo lo que la lista solo deja sumar. */}
              <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-violet-400 rounded-full"
                  style={{ width: `${total > 0 ? Math.max(3, (f.monto / total) * 100) : 0}%` }} />
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">{f.cuantos} apunte(s)</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Listado({ cargando, vacio, filas }: {
  cargando: boolean; vacio: string;
  filas: Array<{ id: string; titulo: string; sub: string; monto: string; color: string; onBorrar: () => void }>;
}) {
  if (cargando && filas.length === 0) {
    return <div className="flex items-center justify-center py-12 text-gray-400 gap-2"><Loader2 size={18} className="animate-spin" /> Cargando…</div>;
  }
  if (filas.length === 0) {
    return <div className="bg-white border border-gray-200 rounded-2xl text-center py-12 text-sm text-gray-400">{vacio}</div>;
  }
  return (
    <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden">
      {filas.map(f => (
        <div key={f.id} className="px-4 py-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-gray-900 truncate">{f.titulo}</p>
            {f.sub && <p className="text-xs text-gray-500 truncate">{f.sub}</p>}
          </div>
          <span className={`font-black tabular-nums ${f.color}`}>{f.monto}</span>
          <button onClick={f.onBorrar} className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default Taller3D;
