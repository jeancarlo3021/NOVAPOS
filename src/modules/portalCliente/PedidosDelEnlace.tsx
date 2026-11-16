import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home, Link2, RefreshCw, Loader2, ShoppingCart, Clock, Ban, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, Phone, StickyNote, Package,
} from 'lucide-react';
import {
  agentOrdersService, type AgentOrder, type AgentOrderStatus,
} from '@/services/agents/salesAgentsService';
import { customersService } from '@/services/customers/customersService';
import { useAuth } from '@/context/AuthContext';

/**
 * PEDIDOS DEL ENLACE DEL CLIENTE.
 *
 * Los pedidos que llegan por el portal caen en la misma bandeja que los de los
 * agentes de venta, y esa bandeja —«Caja»— es un módulo aparte del plan. Un
 * negocio que compró SOLO el portal del cliente no tenía dónde verlos: los
 * pedidos entraban a la base y nadie se enteraba. Esta pantalla es ese lugar, y
 * se abre con la llave del portal.
 *
 * ── Qué hace, y qué no ────────────────────────────────────────────────────
 * No cobra acá. Pasa el pedido AL POS, que es donde está el medio de pago, la
 * factura electrónica, la impresora y la caja abierta. Duplicar el cobro en
 * esta pantalla sería mantener dos cajas que tarde o temprano calculan
 * distinto.
 *
 * ── Tomarlo antes de pasarlo ──────────────────────────────────────────────
 * Al pasarlo al POS el pedido se marca TOMADO. Mientras está «pendiente» el
 * cliente lo puede seguir cambiando desde su teléfono: cobrar algo que el
 * cliente está editando en ese momento es la forma de facturar lo que no se
 * pidió.
 */

const plata = (n: number) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;

const hora = (iso?: string | null) => {
  if (!iso) return '';
  try {
    /* Las fechas del servidor vienen en UTC sin marca de zona: sin la Z, el
       navegador las lee como locales y el pedido aparece seis horas antes. */
    const s = /Z|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
    return new Date(s).toLocaleString('es-CR', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
};

/** «Todavía lo puede cambiar (12 min)» — o nada, si ya se le pasó la hora. */
const ventanaDelCliente = (o: AgentOrder): string | null => {
  const hasta = (o as any).editable_hasta as string | undefined;
  if (!hasta || o.status !== 'pending') return null;
  const s = /Z|[+-]\d{2}:?\d{2}$/.test(hasta) ? hasta : `${hasta}Z`;
  const min = Math.round((new Date(s).getTime() - Date.now()) / 60000);
  return min > 0 ? `El cliente todavía lo puede cambiar (${min} min)` : null;
};

const ESTADOS: Array<{ v: AgentOrderStatus | 'todos'; label: string }> = [
  { v: 'pending', label: 'Por atender' },
  { v: 'taken', label: 'En proceso' },
  { v: 'charged', label: 'Cobrados' },
  { v: 'todos', label: 'Todos' },
];

export const PedidosDelEnlace: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [estado, setEstado] = useState<AgentOrderStatus | 'todos'>('pending');

  /**
   * LA ZONA: así se reparte y así se alista.
   *
   * Cada cliente tiene su zona y el pedido se la lleva copiada. El repartidor
   * de Pavas no quiere ver los pedidos de Escazú, y en la bodega hay que
   * alistar «lo de Pavas» de una.
   *
   * Si el usuario tiene zona asignada, la pantalla ABRE en la suya: un
   * repartidor que entra y ve los pedidos de todo el país tiene que empezar
   * por filtrar, y la mitad de las veces no lo hace.
   */
  const zonaDelUsuario = (user as any)?.zone ?? '';
  const [zona, setZona] = useState<string>(zonaDelUsuario || 'todas');
  const [zonas, setZonas] = useState<string[]>([]);

  /** Las dos vistas: pedido por pedido, o la suma para alistar. */
  const [vista, setVista] = useState<'detalle' | 'alistar'>('detalle');

  useEffect(() => {
    customersService.listZones()
      .then(z => setZonas((z ?? []).map((x: any) => (typeof x === 'string' ? x : x?.name)).filter(Boolean)))
      .catch(() => setZonas([]));
  }, []);
  const [orders, setOrders] = useState<AgentOrder[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [pasando, setPasando] = useState<string | null>(null);

  /**
   * Se piden los estados que se van a mostrar y se filtra a los del PORTAL.
   *
   * El filtro por origen es acá y no en el servidor porque el endpoint ya
   * existe y lo comparten la caja y la agenda; pedirle un parámetro nuevo
   * obligaría a tocar los tres. La lista de un día son decenas de filas, no
   * miles.
   */
  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
      const pedir = (st?: string, rango?: any) => agentOrdersService.list(st, undefined, rango);
      const zonaFiltro = zona !== 'todas' ? { zone: zona } : {};
      const tandas = estado === 'todos'
        ? await Promise.all([
            pedir('pending', { ...zonaFiltro }),
            pedir('taken', { ...zonaFiltro }),
            pedir('charged', { date: hoy, ...zonaFiltro }),
          ])
        /* Los cobrados se limitan a HOY: la bandeja es para trabajar el día, y
           traer el historial completo la vuelve ilegible y lenta. */
        : [await pedir(estado, estado === 'charged' ? { date: hoy, ...zonaFiltro } : { ...zonaFiltro })];
      const todos = tandas.flat().filter(o => (o as any).origen === 'cliente');
      /* Lo más nuevo primero: lo que acaba de entrar es lo que hay que atender. */
      todos.sort((a, b) => String((b as any).created_at ?? '').localeCompare(String((a as any).created_at ?? '')));
      setOrders(todos);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron traer los pedidos');
    } finally { setCargando(false); }
  }, [estado, zona]);

  useEffect(() => { void cargar(); }, [cargar]);

  /* Los pedidos entran mientras alguien mira la pantalla: se refresca sola.
     Cada 30 s y solo con la pestaña a la vista, para no consultar toda la
     tarde desde una pantalla que nadie está viendo. */
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void cargar();
    }, 30_000);
    return () => clearInterval(t);
  }, [cargar]);

  const porAtender = useMemo(() => orders.filter(o => o.status === 'pending').length, [orders]);

  /**
   * LA SUMA PARA ALISTAR.
   *
   * Lo que la bodega necesita no es la lista de pedidos: es «cuánto hay que
   * bajar de cada cosa» para cargar el carro de esa zona. Con doce pedidos en
   * pantalla, sumar a mano doce veces «2 arroz» es como se cargan de menos las
   * rutas.
   *
   * Se suma por PRODUCTO y se ordena por lo que más sale: lo que se alista de
   * primero es lo que más pesa en el carro.
   *
   * Los pedidos COBRADOS no entran: esa mercadería ya salió. Alistarla otra
   * vez sería cargar el doble.
   */
  const paraAlistar = useMemo(() => {
    const m = new Map<string, { nombre: string; cantidad: number; monto: number; pedidos: number }>();
    for (const o of orders) {
      if (o.status !== 'pending' && o.status !== 'taken') continue;
      for (const l of (((o as any).items ?? []) as any[])) {
        const clave = String(l.product_id ?? l.product_name ?? '');
        const prev = m.get(clave) ?? { nombre: l.product_name ?? 'Artículo', cantidad: 0, monto: 0, pedidos: 0 };
        prev.cantidad += Number(l.quantity) || 0;
        prev.monto += Number(l.subtotal) || 0;
        prev.pedidos += 1;
        m.set(clave, prev);
      }
    }
    const lista = [...m.values()].sort((a, b) => b.cantidad - a.cantidad);
    const total = lista.reduce((s2, x) => s2 + x.monto, 0);
    const bultos = lista.reduce((s2, x) => s2 + x.cantidad, 0);
    const cuantos = orders.filter(o => o.status === 'pending' || o.status === 'taken').length;
    return { lista, total, bultos, cuantos };
  }, [orders]);

  /** Pasa el pedido al POS: lo toma (lo cierra al cliente) y lo deja en el carrito. */
  const pasarAlPos = async (o: AgentOrder) => {
    setPasando(o.id); setError('');
    try {
      const completo = await agentOrdersService.get(o.id).catch(() => o);
      const items = ((completo as any).items ?? []) as Array<any>;
      if (items.length === 0) {
        setError(`El pedido ${o.number ?? ''} no trae líneas. Abrilo en la bandeja de caja.`);
        return;
      }

      /* TOMARLO primero: mientras está pendiente el cliente lo puede cambiar
         desde el teléfono, y cobrar algo que se está editando es facturar lo
         que no se pidió. Si el pedido ya estaba tomado, el error no detiene el
         cobro —solo se avisa—. */
      if (o.status === 'pending') {
        try { await agentOrdersService.take(o.id); }
        catch (e) {
          setError(`No se pudo marcar el pedido como tomado (${e instanceof Error ? e.message : 'error'}). `
            + 'Se pasa igual al punto de venta, pero avisale al cliente que ya no lo cambie.');
        }
      }

      sessionStorage.setItem('novapos_pending_agent_order', JSON.stringify({
        order_id: o.id,
        number: o.number ?? '',
        agent_name: 'enlace del cliente',
        customer_name: o.customer_name ?? '',
        items: items.map(it => ({
          product_id: it.product_id ?? null,
          product_name: it.product_name,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          subtotal: Number(it.subtotal) || 0,
          notes: it.notes ?? null,
        })),
      }));
      navigate('/pos');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo pasar el pedido al punto de venta');
    } finally { setPasando(null); }
  };

  const rechazar = async (o: AgentOrder) => {
    const motivo = prompt(`¿Por qué se rechaza el pedido ${o.number ?? ''}?\n`
      + 'El cliente lo va a ver en su enlace.');
    if (motivo === null) return;
    try {
      await agentOrdersService.reject(o.id, motivo.trim() || 'Rechazado por el negocio');
      void cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo rechazar');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Encabezado */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <button onClick={() => navigate('/')}
            className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50">
            <Home size={16} /> Menú
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
              <Link2 size={22} className="text-cyan-600" /> Pedidos del enlace
            </h1>
            <p className="text-sm text-gray-400">
              Lo que tus clientes mandaron desde su enlace. Pasalos al punto de venta para cobrarlos.
            </p>
          </div>
          {porAtender > 0 && (
            <span className="px-3 py-1.5 rounded-xl bg-cyan-600 text-white text-sm font-black">
              {porAtender} por atender
            </span>
          )}
          <button onClick={() => void cargar()}
            className="p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50">
            <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Las DOS VISTAS. Es lo primero porque son dos trabajos distintos:
            repartir (pedido por pedido, con el cliente y su teléfono) y
            alistar (cuánto bajar de cada cosa para cargar el carro). */}
        <div className="flex gap-2 mb-3">
          {([['detalle', 'Detallado'], ['alistar', 'Para alistar']] as const).map(([v2, label]) => (
            <button key={v2} onClick={() => setVista(v2)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-black border-2 transition ${
                vista === v2 ? 'bg-cyan-600 border-cyan-600 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Zona y estado */}
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <select value={zona} onChange={e => setZona(e.target.value)}
            aria-label="Zona"
            className="px-3 py-2 rounded-xl border-2 border-gray-200 text-sm font-bold bg-white">
            <option value="todas">Todas las zonas</option>
            {zonaDelUsuario && <option value={zonaDelUsuario}>Mi zona ({zonaDelUsuario})</option>}
            {zonas.filter(z => z !== zonaDelUsuario).map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          {ESTADOS.map(e => (
            <button key={e.v} onClick={() => setEstado(e.v)}
              className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition ${
                estado === e.v ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>
              {e.label}
            </button>
          ))}
        </div>

        {/* Los clientes SIN zona no son de nadie: si alguien filtra por zona,
            esos pedidos no los ve nadie. Se avisa donde se puede arreglar. */}
        {zona !== 'todas' && orders.length === 0 && !cargando && (
          <p className="mb-4 text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Si esperabas pedidos acá, revisá que esos clientes tengan la zona puesta en su ficha:
            el pedido se queda con la zona que el cliente tenía al mandarlo.
          </p>
        )}

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-bold text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} className="text-red-400">✕</button>
          </div>
        )}

        {/* ── PARA ALISTAR: la suma, que es lo que se baja de bodega ── */}
        {vista === 'alistar' && (
          paraAlistar.lista.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
              <Package size={30} className="text-gray-300 mx-auto mb-2" />
              <p className="font-bold text-gray-500">Nada que alistar</p>
              <p className="text-xs text-gray-400 mt-1">
                Se suman los pedidos por atender y en proceso{zona !== 'todas' ? ` de ${zona}` : ''}.
                Lo ya cobrado no entra: esa mercadería salió.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border-2 border-cyan-200 overflow-hidden">
              <div className="px-4 py-3 bg-cyan-50 border-b border-cyan-200">
                <p className="font-black text-cyan-900">
                  {zona !== 'todas' ? `Para alistar · ${zona}` : 'Para alistar · todas las zonas'}
                </p>
                <p className="text-xs font-bold text-cyan-700">
                  {paraAlistar.cuantos} pedido(s) · {paraAlistar.bultos} unidad(es) · {plata(paraAlistar.total)}
                </p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-2 font-bold">Artículo</th>
                    <th className="text-right px-4 py-2 font-bold">Cantidad</th>
                    <th className="text-right px-4 py-2 font-bold">En pedidos</th>
                    <th className="text-right px-4 py-2 font-bold">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paraAlistar.lista.map((x, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 font-bold text-gray-900">{x.nombre}</td>
                      {/* La cantidad en grande: es el número con el que se
                          cuenta la mercadería en la bodega. */}
                      <td className="px-4 py-2.5 text-right text-lg font-black tabular-nums text-cyan-800">{x.cantidad}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-400 tabular-nums">{x.pedidos}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{plata(x.monto)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-black">
                  <tr>
                    <td className="px-4 py-3">TOTAL</td>
                    <td className="px-4 py-3 text-right tabular-nums">{paraAlistar.bultos}</td>
                    <td />
                    <td className="px-4 py-3 text-right tabular-nums">{plata(paraAlistar.total)}</td>
                  </tr>
                </tfoot>
              </table>
              <div className="p-3 border-t border-gray-100">
                <button onClick={() => window.print()}
                  className="w-full py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 font-black text-sm">
                  Imprimir la lista
                </button>
              </div>
            </div>
          )
        )}

        {/* Lista */}
        {vista === 'detalle' && (cargando && orders.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
            <Loader2 size={18} className="animate-spin" /> Cargando pedidos…
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
            <Link2 size={30} className="text-gray-300 mx-auto mb-2" />
            <p className="font-bold text-gray-500">
              {estado === 'pending' ? 'Ningún cliente tiene pedidos por atender'
                : estado === 'charged' ? 'Hoy no se ha cobrado ningún pedido del enlace'
                : 'No hay pedidos del enlace'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Los pedidos aparecen acá en cuanto el cliente los manda desde su enlace.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(o => {
              const ventana = ventanaDelCliente(o);
              const lineas = ((o as any).items ?? []) as Array<any>;
              const expandido = abierto === o.id;
              return (
                <div key={o.id}
                  className={`bg-white rounded-2xl border-2 p-4 ${
                    o.status === 'pending' ? 'border-cyan-200' : 'border-gray-100'}`}>
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-gray-900 truncate">
                        {o.customer_name ?? 'Cliente'}
                        {o.number && <span className="text-gray-400 font-bold text-sm"> · {o.number}</span>}
                      </p>
                      <p className="text-xs text-gray-500 flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="flex items-center gap-1"><Clock size={11} />{hora((o as any).created_at)}</span>
                        {o.customer_phone && (
                          <a href={`tel:${o.customer_phone}`} className="flex items-center gap-1 text-cyan-700 font-bold">
                            <Phone size={11} />{o.customer_phone}
                          </a>
                        )}
                        <span className={`px-1.5 py-0.5 rounded font-black text-[10px] ${
                          o.status === 'pending' ? 'bg-cyan-100 text-cyan-800'
                          : o.status === 'taken' ? 'bg-amber-100 text-amber-800'
                          : o.status === 'charged' ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-gray-100 text-gray-600'}`}>
                          {o.status === 'pending' ? 'POR ATENDER' : o.status === 'taken' ? 'EN PROCESO'
                            : o.status === 'charged' ? 'COBRADO' : 'CANCELADO'}
                        </span>
                      </p>
                    </div>
                    <p className="text-xl font-black text-gray-900 tabular-nums">{plata(o.total)}</p>
                  </div>

                  {/* La ventana del cliente: pasar al POS algo que se está
                      editando es facturar lo que no se pidió. */}
                  {ventana && (
                    <p className="mt-2 text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      {ventana}. Al pasarlo al punto de venta se cierra y ya no lo podrá cambiar.
                    </p>
                  )}

                  {o.notes && (
                    <p className="mt-2 text-xs text-gray-600 flex items-start gap-1.5">
                      <StickyNote size={12} className="mt-0.5 shrink-0 text-gray-400" />
                      <span>{o.notes}</span>
                    </p>
                  )}

                  {lineas.length > 0 && (
                    <>
                      <button onClick={() => setAbierto(expandido ? null : o.id)}
                        className="mt-2 text-xs font-black text-gray-500 flex items-center gap-1">
                        {expandido ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        {lineas.length} artículo(s)
                      </button>
                      {expandido && (
                        <ul className="mt-1.5 space-y-0.5 text-xs text-gray-700">
                          {lineas.map((l, i) => (
                            <li key={i} className="flex justify-between gap-2">
                              <span className="truncate">{l.quantity} × {l.product_name}</span>
                              <span className="tabular-nums shrink-0">{plata(l.subtotal)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}

                  {(o.status === 'pending' || o.status === 'taken') && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                      <button onClick={() => void pasarAlPos(o)} disabled={pasando === o.id}
                        className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-sm flex items-center justify-center gap-1.5">
                        {pasando === o.id
                          ? <><Loader2 size={15} className="animate-spin" /> Pasando…</>
                          : <><ShoppingCart size={15} /> Pasar al punto de venta</>}
                      </button>
                      <button onClick={() => void rechazar(o)}
                        className="px-4 py-3 rounded-xl bg-red-50 text-red-700 font-black text-sm flex items-center gap-1.5">
                        <Ban size={14} /> Rechazar
                      </button>
                    </div>
                  )}

                  {o.status === 'charged' && (
                    <p className="mt-3 pt-3 border-t border-gray-100 text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle2 size={13} /> Cobrado
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PedidosDelEnlace;
