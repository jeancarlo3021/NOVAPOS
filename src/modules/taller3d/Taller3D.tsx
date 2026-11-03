import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Printer, TrendingUp, TrendingDown, CalendarDays, Plus, Trash2, Loader2, X,
  AlertCircle, CheckCircle2, Clock, Play, Package, Settings2, RefreshCw, Zap,
  BookOpen, Truck, Pencil, Power,
} from 'lucide-react';
import {
  taller3d, type Venta, type Gasto, type Resumen, type Impresora,
  type Impresion, type Calendario, type ConfigTaller, type Articulo,
  type Tarifa, type Variante,
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

type Pestania = 'ventas' | 'gastos' | 'catalogo' | 'impresiones' | 'maquinas';

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
        <Tab on={tab === 'catalogo'} onClick={() => setTab('catalogo')} icon={BookOpen} label="Catálogo" />
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
      {tab === 'catalogo' && <PanelCatalogo onError={setError} onAviso={setAviso} />}
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
  const [catalogo, setCatalogo] = useState<Articulo[]>([]);
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const vacio = {
    descripcion: '', cliente: '', cantidad: '1', precio_unitario: '',
    medio_pago: 'sinpe', categoria: 'impresion',
    producto_id: '', variante: '', envio: '0', envio_etiqueta: '',
  };
  const [f, setF] = useState<Record<string, string>>(vacio);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [v, r, cat, tar] = await Promise.all([
        taller3d.ventas(fecha), taller3d.resumen(fecha),
        taller3d.catalogo().catch(() => [] as Articulo[]),
        taller3d.tarifas().catch(() => [] as Tarifa[]),
      ]);
      setVentas(v); setResumen(r); setCatalogo(cat); setTarifas(tar.filter(t => t.activo));
    } catch (e) { onError(e instanceof Error ? e.message : 'No se pudo cargar el día'); }
    finally { setCargando(false); }
  }, [fecha, onError]);
  useEffect(() => { void cargar(); }, [cargar]);

  const articulo = catalogo.find(a => a.id === f.producto_id) ?? null;
  const precios: Variante[] = articulo
    ? (articulo.variantes.length > 0 ? articulo.variantes : [{ nombre: 'Precio', precio: articulo.precio }])
    : [];

  /** Elegir del catálogo llena la descripción y el precio: para eso existe. */
  const elegirArticulo = (id: string) => {
    const a = catalogo.find(x => x.id === id);
    if (!a) { setF({ ...f, producto_id: '', variante: '' }); return; }
    const v0 = a.variantes[0];
    setF({
      ...f, producto_id: a.id, descripcion: a.nombre,
      categoria: a.categoria, variante: v0?.nombre ?? '',
      precio_unitario: String(v0?.precio ?? a.precio),
    });
  };

  const elegirVariante = (nombre: string) => {
    const p = precios.find(x => x.nombre === nombre);
    setF({ ...f, variante: nombre, precio_unitario: String(p?.precio ?? f.precio_unitario) });
  };

  const elegirTarifa = (id: string) => {
    const t = tarifas.find(x => x.id === id);
    setF({ ...f, envio: String(t?.monto ?? 0), envio_etiqueta: t?.nombre ?? '' });
  };

  const envio = Number(f.envio) || 0;
  const piezas = (Number(f.cantidad) || 0) * (Number(f.precio_unitario) || 0);
  const total = piezas + envio;

  const agregar = async () => {
    if (!f.descripcion.trim()) { onError('¿Qué se vendió?'); return; }
    setGuardando(true);
    try {
      await taller3d.nuevaVenta({
        fecha, descripcion: f.descripcion.trim(), cliente: f.cliente.trim() || null,
        cantidad: Number(f.cantidad) || 1, precio_unitario: Number(f.precio_unitario) || 0,
        medio_pago: f.medio_pago as any, categoria: f.categoria as any,
        producto_id: f.producto_id || null, variante: f.variante || null,
        envio, envio_etiqueta: f.envio_etiqueta || null,
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tarjeta label="Vendido" valor={plata(resumen?.ventas.total ?? 0)} color="text-emerald-700" />
        {/* El envío aparte: es la respuesta a «¿cuánto cobré de envíos?», que
            del total mezclado no se puede sacar. */}
        <Tarjeta label="Piezas" valor={plata(resumen?.ventas.piezas ?? 0)} />
        <Tarjeta label="Envíos cobrados" valor={plata(resumen?.ventas.envios ?? 0)} color="text-cyan-700" />
        <Tarjeta label="Gastado" valor={plata(resumen?.gastos.total ?? 0)} color="text-red-600" />
        <Tarjeta label="Queda" valor={plata(resumen?.queda ?? 0)}
          color={(resumen?.queda ?? 0) >= 0 ? 'text-gray-900' : 'text-red-600'} />
      </div>

      {/* El desglose: por dónde entró y de qué fue */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Desglose titulo="Por medio de pago" filas={resumen?.ventas.por_medio ?? []} />
        <Desglose titulo="Por artículo" filas={resumen?.ventas.por_producto ?? []} />
      </div>

      {/* Anotar una venta */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <h2 className="font-black text-gray-900 flex items-center gap-2"><Plus size={17} className="text-emerald-600" /> Anotar una venta</h2>

        {/* Del catálogo: llena la descripción y el precio de una. El campo de
            texto sigue ahí para lo que no está en el catálogo. */}
        {catalogo.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <select value={f.producto_id} onChange={e => elegirArticulo(e.target.value)}
              aria-label="Artículo del catálogo"
              className="flex-1 min-w-[200px] px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold bg-white">
              <option value="">Del catálogo…</option>
              {catalogo.map(a => (
                <option key={a.id} value={a.id}>
                  {a.nombre}{a.variantes.length > 1 ? ` (${a.variantes.length} precios)` : ` · ${plata(a.precio)}`}
                </option>
              ))}
            </select>
            {/* Los varios precios del MISMO artículo. */}
            {precios.length > 1 && (
              <select value={f.variante} onChange={e => elegirVariante(e.target.value)}
                aria-label="Precio"
                className="px-3 py-2.5 border-2 border-violet-200 bg-violet-50 rounded-xl text-sm font-black text-violet-800">
                {precios.map(p => <option key={p.nombre} value={p.nombre}>{p.nombre} · {plata(p.precio)}</option>)}
              </select>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
          <input value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value, producto_id: '', variante: '' })}
            placeholder="Qué se vendió" className="sm:col-span-2 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          <input value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })}
            placeholder="Cliente (opcional)" className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          <input type="number" inputMode="decimal" value={f.cantidad} onChange={e => setF({ ...f, cantidad: e.target.value })}
            placeholder="Cant." className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm text-right" />
          <input type="number" inputMode="decimal" value={f.precio_unitario} onChange={e => setF({ ...f, precio_unitario: e.target.value })}
            placeholder="Precio c/u" className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm text-right" />
          <div className="flex flex-col items-end justify-center">
            <span className="font-black text-lg tabular-nums text-emerald-700">{plata(total)}</span>
            {envio > 0 && (
              <span className="text-[11px] font-bold text-gray-500">{plata(piezas)} + {plata(envio)} de envío</span>
            )}
          </div>
        </div>

        {/* El envío, que acá se cobra aparte de la pieza. */}
        <div className="flex gap-2 flex-wrap items-center">
          <span className="flex items-center gap-1.5 text-xs font-black text-gray-500">
            <Truck size={14} /> Envío
          </span>
          {tarifas.length > 0 && (
            <select value={tarifas.find(t => t.nombre === f.envio_etiqueta)?.id ?? ''}
              onChange={e => elegirTarifa(e.target.value)} aria-label="Tarifa de envío"
              className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold bg-white">
              <option value="">Sin envío</option>
              {tarifas.map(t => <option key={t.id} value={t.id}>{t.nombre} · {plata(t.monto)}</option>)}
            </select>
          )}
          <input type="number" inputMode="decimal" value={f.envio}
            onChange={e => setF({ ...f, envio: e.target.value })}
            placeholder="Monto del envío"
            className="w-36 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm text-right" />
          {tarifas.length === 0 && (
            <span className="text-[11px] text-gray-400">
              Podés guardar tus tarifas en la pestaña «Catálogo» y elegirlas acá.
            </span>
          )}
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
          sub: [v.cliente, v.variante, `${v.cantidad} × ${plata(v.precio_unitario)}`,
            Number(v.envio) > 0 ? `+ ${plata(v.envio)} de envío${v.envio_etiqueta ? ` (${v.envio_etiqueta})` : ''}` : null,
            ETIQUETA[v.medio_pago]].filter(Boolean).join(' · '),
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

// ══════════════════════════ CATÁLOGO ══════════════════════════

/**
 * EL CATÁLOGO — lo que el taller vende, con su precio.
 *
 * Un artículo puede tener VARIOS precios: el mismo llavero vale distinto en
 * chico que en grande, en PLA que en resina. Por eso los precios son una lista
 * y no una casilla: obligar a crear tres artículos llamados casi igual es lo
 * que termina con un catálogo que nadie mantiene.
 *
 * Las tarifas de envío viven acá al lado porque son lo mismo: un precio que se
 * repite y que no se tiene que escribir de memoria en cada venta.
 */
function PanelCatalogo({ onError, onAviso }: { onError: (s: string) => void; onAviso: (s: string) => void }) {
  const [lista, setLista] = useState<Articulo[]>([]);
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<Articulo | 'nuevo' | null>(null);
  const [tNombre, setTNombre] = useState('');
  const [tMonto, setTMonto] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [c, t] = await Promise.all([taller3d.catalogo(true), taller3d.tarifas()]);
      setLista(c); setTarifas(t);
    } catch (e) { onError(e instanceof Error ? e.message : 'No se pudo cargar el catálogo'); }
    finally { setCargando(false); }
  }, [onError]);
  useEffect(() => { void cargar(); }, [cargar]);

  const borrar = async (a: Articulo) => {
    if (!confirm(`¿Quitar "${a.nombre}" del catálogo?`)) return;
    try {
      const r: any = await taller3d.borrarArticulo(a.id);
      onAviso(r?.data?.desactivado || r?.desactivado
        ? 'Ya tenía ventas: se desactivó en vez de borrarse, para no romper el historial'
        : 'Artículo borrado');
      await cargar();
    } catch (e) { onError(e instanceof Error ? e.message : 'No se pudo'); }
  };

  const agregarTarifa = async () => {
    if (!tNombre.trim()) return;
    try {
      await taller3d.nuevaTarifa(tNombre.trim(), Number(tMonto) || 0);
      setTNombre(''); setTMonto(''); onAviso('Tarifa guardada'); await cargar();
    } catch (e) { onError(e instanceof Error ? e.message : 'No se pudo'); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-black text-gray-900 flex items-center gap-2">
            <BookOpen size={17} className="text-violet-600" /> Lo que vendés
          </h2>
          <button onClick={() => setEditando('nuevo')}
            className="ml-auto px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black text-sm flex items-center gap-1.5">
            <Plus size={15} /> Artículo
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Cada artículo puede tener varios precios —chico y grande, PLA y resina—. Al anotar
          una venta se elige el artículo y el precio entra solo.
        </p>

        {cargando ? (
          <p className="text-sm text-gray-400 py-6 text-center">Cargando…</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            El catálogo está vacío. Agregá lo que más vendés y dejá de escribir el precio cada vez.
          </p>
        ) : (
          <div className="space-y-2">
            {lista.map(a => (
              <div key={a.id} className={`rounded-xl border p-3 ${a.activo ? 'border-gray-100' : 'border-gray-200 bg-gray-50 opacity-70'}`}>
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-900">
                      {a.nombre}
                      {!a.activo && <span className="ml-2 text-[10px] font-black px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded">INACTIVO</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {[ETIQUETA[a.categoria], a.material, a.color, a.horas ? `${a.horas} h de impresión` : null]
                        .filter(Boolean).join(' · ')}
                    </p>
                    {/* Los precios, todos a la vista: es la razón de ser del catálogo. */}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {(a.variantes.length > 0 ? a.variantes : [{ nombre: 'Precio', precio: a.precio }]).map(v => (
                        <span key={v.nombre} className="text-xs font-black px-2 py-1 rounded-lg bg-violet-50 text-violet-800">
                          {v.nombre} · {plata(v.precio)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setEditando(a)} title="Editar"
                      className="p-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100"><Pencil size={14} /></button>
                    <button onClick={() => void taller3d.cambiarArticulo(a.id, { activo: !a.activo }).then(cargar)}
                      title={a.activo ? 'Desactivar' : 'Activar'}
                      className={`p-2 rounded-lg ${a.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      <Power size={14} />
                    </button>
                    <button onClick={() => void borrar(a)}
                      className="p-2 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tarifas de envío */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <h2 className="font-black text-gray-900 flex items-center gap-2">
          <Truck size={17} className="text-cyan-600" /> Tarifas de envío
        </h2>
        <p className="text-xs text-gray-500">
          Lo que cobrás por mandar. Se elige al anotar la venta y se suma aparte del precio de
          la pieza, para poder saber después cuánto entró por envíos.
        </p>
        <div className="flex gap-2 flex-wrap">
          <input value={tNombre} onChange={e => setTNombre(e.target.value)}
            placeholder="Ej. Correos GAM" className="flex-1 min-w-[160px] px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          <input type="number" inputMode="decimal" value={tMonto} onChange={e => setTMonto(e.target.value)}
            placeholder="Monto" className="w-32 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm text-right" />
          <button onClick={() => void agregarTarifa()} disabled={!tNombre.trim()}
            className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-200 text-white font-black text-sm flex items-center gap-1.5">
            <Plus size={15} /> Agregar
          </button>
        </div>
        {tarifas.length === 0 ? (
          <p className="text-sm text-gray-400 py-3 text-center">Sin tarifas todavía.</p>
        ) : (
          <div className="space-y-1.5">
            {tarifas.map(t => (
              <div key={t.id} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-100">
                <Truck size={14} className={t.activo ? 'text-cyan-600' : 'text-gray-300'} />
                <span className={`flex-1 font-bold ${t.activo ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{t.nombre}</span>
                <span className="font-black tabular-nums text-gray-900">{plata(t.monto)}</span>
                <button onClick={() => void taller3d.cambiarTarifa(t.id, { activo: !t.activo }).then(cargar)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black ${
                    t.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {t.activo ? 'Activa' : 'Inactiva'}
                </button>
                <button onClick={async () => {
                  if (!confirm(`¿Borrar la tarifa "${t.nombre}"?`)) return;
                  try { await taller3d.borrarTarifa(t.id); await cargar(); }
                  catch (e) { onError(e instanceof Error ? e.message : 'No se pudo'); }
                }} className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editando && (
        <ArticuloModal
          articulo={editando === 'nuevo' ? null : editando}
          onClose={() => setEditando(null)}
          onGuardado={async () => { setEditando(null); onAviso('Guardado'); await cargar(); }}
          onError={onError}
        />
      )}
    </div>
  );
}

/** Alta y edición de un artículo, con su lista de precios. */
function ArticuloModal({ articulo, onClose, onGuardado, onError }: {
  articulo: Articulo | null; onClose: () => void; onGuardado: () => void; onError: (s: string) => void;
}) {
  const [f, setF] = useState({
    nombre: articulo?.nombre ?? '', descripcion: articulo?.descripcion ?? '',
    categoria: articulo?.categoria ?? 'impresion',
    horas: articulo?.horas != null ? String(articulo.horas) : '',
    material: articulo?.material ?? '', color: articulo?.color ?? '',
  });
  const [variantes, setVariantes] = useState<Variante[]>(
    articulo?.variantes?.length ? articulo.variantes : [{ nombre: 'Precio', precio: articulo?.precio ?? 0 }]);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!f.nombre.trim()) { onError('¿Cómo se llama el artículo?'); return; }
    const limpias = variantes
      .map(v => ({ nombre: v.nombre.trim() || 'Precio', precio: Number(v.precio) || 0 }))
      .filter((v, i, a) => a.findIndex(x => x.nombre === v.nombre) === i);
    setGuardando(true);
    try {
      const datos: any = {
        nombre: f.nombre.trim(), descripcion: f.descripcion.trim() || null,
        categoria: f.categoria as any, variantes: limpias, precio: limpias[0]?.precio ?? 0,
        horas: f.horas ? Number(f.horas) : null,
        material: f.material.trim() || null, color: f.color.trim() || null,
      };
      if (articulo) await taller3d.cambiarArticulo(articulo.id, datos);
      else await taller3d.nuevoArticulo(datos);
      onGuardado();
    } catch (e) { onError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <BookOpen size={18} className="text-violet-600" />
          <h2 className="font-black text-gray-900 flex-1">{articulo ? 'Editar artículo' : 'Nuevo artículo'}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })}
            placeholder="Nombre (ej. Llavero personalizado)"
            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          <input value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })}
            placeholder="Descripción (opcional)"
            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <select value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value as any })}
              className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold bg-white">
              {CAT_VENTA.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}
            </select>
            <input type="number" inputMode="decimal" step="0.5" value={f.horas}
              onChange={e => setF({ ...f, horas: e.target.value })}
              placeholder="Horas de impresión"
              className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm text-right" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={f.material} onChange={e => setF({ ...f, material: e.target.value })}
              placeholder="Material" className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
            <input value={f.color} onChange={e => setF({ ...f, color: e.target.value })}
              placeholder="Color" className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2">
            <p className="text-xs font-black text-gray-700">Precios</p>
            <p className="text-[11px] text-gray-500">
              Uno por tamaño, material o lo que cambie el precio. Si solo hay uno, dejalo como
              está y listo.
            </p>
            {variantes.map((v, i) => (
              <div key={i} className="flex gap-2">
                <input value={v.nombre}
                  onChange={e => setVariantes(vs => vs.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                  placeholder="Ej. Grande"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <input type="number" inputMode="decimal" value={v.precio}
                  onChange={e => setVariantes(vs => vs.map((x, j) => j === i ? { ...x, precio: Number(e.target.value) || 0 } : x))}
                  className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm text-right font-black" />
                {variantes.length > 1 && (
                  <button onClick={() => setVariantes(vs => vs.filter((_, j) => j !== i))}
                    className="p-2 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
                )}
              </div>
            ))}
            <button onClick={() => setVariantes(vs => [...vs, { nombre: '', precio: 0 }])}
              className="text-xs font-black text-violet-700 flex items-center gap-1">
              <Plus size={13} /> Otro precio
            </button>
          </div>
        </div>
        <div className="border-t border-gray-100 p-4 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-bold text-sm">
            Cancelar
          </button>
          <button onClick={() => void guardar()} disabled={guardando}
            className="flex-[2] py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════ IMPRESIONES ══════════════════════════

function PanelImpresiones({ onError, onAviso }: { onError: (s: string) => void; onAviso: (s: string) => void }) {
  const [cal, setCal] = useState<Calendario | null>(null);
  const [catalogo, setCatalogo] = useState<Articulo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const vacio = { pieza: '', cliente: '', cantidad: '1', horas: '', material: '', color: '', fecha_limite: '', urgente: false, producto_id: '' };
  const [f, setF] = useState<any>(vacio);

  /**
   * Elegir del catálogo trae TAMBIÉN las horas.
   *
   * Es la mitad del valor de tener catálogo: lo que uno no se acuerda de un
   * mes para otro no es el precio, es cuánto tardó la última vez.
   */
  const elegirArticulo = (id: string) => {
    const a = catalogo.find(x => x.id === id);
    if (!a) { setF({ ...f, producto_id: '' }); return; }
    setF({
      ...f, producto_id: a.id, pieza: a.nombre,
      horas: a.horas != null ? String(a.horas) : f.horas,
      material: a.material ?? f.material, color: a.color ?? f.color,
    });
  };
  /** Lo que el planificador respondió al meter la última pieza. */
  const [recien, setRecien] = useState<{ pieza: string; impresora: string; entrega: string; fin: string; tarde: boolean } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [c, cat] = await Promise.all([
        taller3d.calendario(),
        taller3d.catalogo().catch(() => [] as Articulo[]),
      ]);
      setCal(c); setCatalogo(cat);
    }
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
        producto_id: f.producto_id || null,
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
        {catalogo.length > 0 && (
          <select value={f.producto_id} onChange={e => elegirArticulo(e.target.value)}
            aria-label="Pieza del catálogo"
            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold bg-white">
            <option value="">Del catálogo…</option>
            {catalogo.map(a => (
              <option key={a.id} value={a.id}>
                {a.nombre}{a.horas != null ? ` · ${a.horas} h` : ' · sin horas guardadas'}
              </option>
            ))}
          </select>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
          <input value={f.pieza} onChange={e => setF({ ...f, pieza: e.target.value, producto_id: '' })}
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
