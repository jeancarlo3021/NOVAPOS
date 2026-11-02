import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ShoppingCart, Search, Minus, Plus, X, Loader2, Receipt, Store, Clock,
  AlertCircle, CheckCircle2, Trash2, Pencil, RefreshCw, Lock, Package, ListOrdered,
} from 'lucide-react';
import {
  portalPublico, type PortalInicio, type PortalCatalogo, type PortalProducto,
  type PortalPedido, type PortalCuenta, type PedidoEnviado,
} from '@/services/customers/portalClienteService';

/**
 * PORTAL DEL CLIENTE — lo que abre el cliente con el enlace que le mandaron.
 *
 * Se abre sin sesión, desde el teléfono de otra persona, muchas veces en una
 * bodega con mala señal. De ahí las decisiones de la pantalla:
 *
 *  · Un viaje por sección y nada que se recargue solo.
 *  · Los PRECIOS a la vista, y los del cliente: si tiene precio acordado se
 *    muestra el suyo y, tachado, el de lista. Esconder el precio en un portal
 *    de pedidos es pedirle que compre a ciegas.
 *  · Las EXISTENCIAS a la vista: no se puede pedir más de lo que hay, y se
 *    dice en el momento, no cuando el negocio llama a avisar.
 *  · El carrito sobrevive a que el teléfono se bloquee (queda guardado acá
 *    mismo, en el navegador).
 *  · Botones grandes: se usa de pie y con una mano.
 *
 * NADA de esto decide el precio de verdad. El servidor vuelve a resolver
 * precio y existencias al recibir el pedido: mandar otro precio desde el
 * navegador no sirve de nada.
 */

const plata = (n: number) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;

const DIA = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('es-CR', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
};

/** «Faltan 2 h 15 min» — para que se entienda cuánto queda sin hacer cuentas. */
const faltante = (min: number) => {
  if (min <= 0) return 'ya cerró';
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
};

type Carrito = Record<string, number>;
type Vista = 'catalogo' | 'pedidos' | 'cuenta';

export const PortalCliente: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();

  const [inicio, setInicio] = useState<PortalInicio | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'no-sirve' | 'error'>('cargando');
  const [vista, setVista] = useState<Vista>('catalogo');

  const [catalogo, setCatalogo] = useState<PortalCatalogo | null>(null);
  const [cargandoCat, setCargandoCat] = useState(false);
  const [busca, setBusca] = useState('');
  const [cat, setCat] = useState<string>('todas');

  /* El carrito aguanta que el teléfono se bloquee o que se cambie de pestaña:
     armar un pedido de treinta líneas y perderlo por mirar un WhatsApp es la
     forma más rápida de que nadie vuelva a usar el portal. */
  const llaveCarrito = `portal-cliente:${token}`;
  const [carrito, setCarrito] = useState<Carrito>(() => {
    try { return JSON.parse(localStorage.getItem(`portal-cliente:${token}`) ?? '{}') ?? {}; }
    catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(llaveCarrito, JSON.stringify(carrito)); } catch { /* modo privado */ }
  }, [carrito, llaveCarrito]);

  const [hojaCarrito, setHojaCarrito] = useState(false);
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState<PedidoEnviado | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Pedido que se está CAMBIANDO (null = se está armando uno nuevo). */
  const [editando, setEditando] = useState<PortalPedido | null>(null);

  const [pedidos, setPedidos] = useState<PortalPedido[] | null>(null);
  const [cargandoPedidos, setCargandoPedidos] = useState(false);

  const [cuenta, setCuenta] = useState<PortalCuenta | null>(null);
  const [pin, setPin] = useState('');
  const [errCuenta, setErrCuenta] = useState<string | null>(null);
  const [cargandoCuenta, setCargandoCuenta] = useState(false);

  // ── Abrir ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    portalPublico.abrir(token)
      .then(d => { if (vivo) { setInicio(d); setEstado('ok'); } })
      .catch(e => {
        if (!vivo) return;
        setEstado(/ya no sirve|404|no encontrad/i.test(String(e?.message)) ? 'no-sirve' : 'error');
      });
    return () => { vivo = false; };
  }, [token]);

  const puedePedir = !!inicio?.permisos?.pedir;
  const verSaldo = !!inicio?.permisos?.ver_saldo;
  const abierto = !!inicio?.corte?.abierto;

  // ── Catálogo ───────────────────────────────────────────────────────────────
  const cargarCatalogo = useCallback(async () => {
    setCargandoCat(true);
    try { setCatalogo(await portalPublico.catalogo(token)); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo traer el catálogo'); }
    finally { setCargandoCat(false); }
  }, [token]);

  useEffect(() => {
    if (estado === 'ok' && puedePedir && !catalogo) void cargarCatalogo();
    // El enlace de solo consulta abre directo en la cuenta: no hay nada que pedir.
    if (estado === 'ok' && !puedePedir && verSaldo) setVista('cuenta');
  }, [estado, puedePedir, verSaldo, catalogo, cargarCatalogo]);

  const porId = useMemo(() => {
    const m = new Map<string, PortalProducto>();
    (catalogo?.productos ?? []).forEach(p => m.set(p.id, p));
    return m;
  }, [catalogo]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (catalogo?.productos ?? []).filter(p => {
      if (cat !== 'todas' && p.categoria_id !== cat) return false;
      if (q && !p.nombre.toLowerCase().includes(q) && !(p.sku ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalogo, busca, cat]);

  const lineas = useMemo(
    () => Object.entries(carrito)
      .filter(([, q]) => q > 0)
      .map(([id, q]) => ({ p: porId.get(id), q }))
      .filter((l): l is { p: PortalProducto; q: number } => !!l.p),
    [carrito, porId]);

  const total = useMemo(() => lineas.reduce((s, l) => s + l.p.precio * l.q, 0), [lineas]);
  const cuantos = useMemo(() => lineas.reduce((s, l) => s + l.q, 0), [lineas]);

  /** Sube o baja una línea, sin pasarse de lo que hay. */
  const mover = (p: PortalProducto, delta: number) => {
    setCarrito(c => {
      const ahora = Number(c[p.id] ?? 0);
      let nuevo = Math.max(0, ahora + delta);
      if (p.existencias != null && nuevo > p.existencias) {
        nuevo = p.existencias;
        setError(p.existencias <= 0 ? `${p.nombre} está agotado.` : `De ${p.nombre} solo quedan ${p.existencias}.`);
      }
      const r = { ...c };
      if (nuevo <= 0) delete r[p.id]; else r[p.id] = nuevo;
      return r;
    });
  };

  const vaciar = () => { setCarrito({}); setNotas(''); setEditando(null); };

  // ── Enviar o cambiar ───────────────────────────────────────────────────────
  const enviar = async () => {
    if (lineas.length === 0) return;
    setEnviando(true); setError(null);
    const items = lineas.map(l => ({ product_id: l.p.id, quantity: l.q }));
    try {
      if (editando) {
        const r = await portalPublico.cambiar(token, editando.id, items, notas || null);
        setHojaCarrito(false); vaciar();
        setListo({ numero: editando.numero ?? '', id: editando.id, total: r.total,
          editable_hasta: '', problemas: r.problemas ?? [], aviso: null });
      } else {
        const r = await portalPublico.pedir(token, items, notas || null);
        setHojaCarrito(false); vaciar();
        setListo(r);
      }
      setPedidos(null);
      /* Las existencias cambiaron con el pedido: traerlas de nuevo evita que
         el siguiente pedido se arme contra números viejos. */
      void cargarCatalogo();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el pedido');
    } finally { setEnviando(false); }
  };

  // ── Mis pedidos ────────────────────────────────────────────────────────────
  const cargarPedidos = useCallback(async () => {
    setCargandoPedidos(true);
    try { setPedidos(await portalPublico.pedidos(token)); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron traer tus pedidos'); }
    finally { setCargandoPedidos(false); }
  }, [token]);

  useEffect(() => {
    if (vista === 'pedidos' && pedidos === null && estado === 'ok') void cargarPedidos();
  }, [vista, pedidos, estado, cargarPedidos]);

  /** «Cambiar»: el pedido vuelve al carrito y se reenvía corregido. */
  const editar = async (p: PortalPedido) => {
    if (!catalogo) await cargarCatalogo();
    const c: Carrito = {};
    const sinId: string[] = [];
    p.lineas.forEach(l => {
      if (l.product_id) c[l.product_id] = (c[l.product_id] ?? 0) + l.cantidad;
      else sinId.push(l.nombre);
    });
    setCarrito(c); setNotas(p.notas ?? ''); setEditando(p);
    setVista('catalogo'); setHojaCarrito(true);
    if (sinId.length) setError(`No se pudo recuperar: ${sinId.join(', ')}. Agregalo de nuevo si lo querés.`);
  };

  const cancelar = async (p: PortalPedido) => {
    if (!confirm(`¿Cancelar el pedido ${p.numero ?? ''}?`)) return;
    try { await portalPublico.cancelar(token, p.id); await cargarPedidos(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cancelar'); }
  };

  // ── Mi cuenta ──────────────────────────────────────────────────────────────
  const cargarCuenta = useCallback(async (conPin?: string) => {
    setCargandoCuenta(true); setErrCuenta(null);
    try { setCuenta(await portalPublico.cuenta(token, conPin)); }
    catch (e) {
      setCuenta(null);
      setErrCuenta(e instanceof Error ? e.message : 'No se pudo traer tu cuenta');
    } finally { setCargandoCuenta(false); }
  }, [token]);

  useEffect(() => {
    if (vista !== 'cuenta' || estado !== 'ok' || !verSaldo) return;
    if (cuenta || errCuenta || cargandoCuenta) return;
    // Con PIN no se pide nada hasta que el cliente lo escriba.
    if (!inicio?.permisos?.pide_pin) void cargarCuenta();
  }, [vista, estado, verSaldo, cuenta, errCuenta, cargandoCuenta, inicio, cargarCuenta]);

  // ── Pantallas de borde ─────────────────────────────────────────────────────
  if (estado === 'cargando') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400 gap-2">
        <Loader2 size={20} className="animate-spin" /> Abriendo…
      </div>
    );
  }
  if (estado === 'no-sirve' || (estado === 'ok' && inicio?.atiende === false)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
        <Lock size={40} className="text-gray-300 mb-3" />
        <h1 className="text-xl font-black text-gray-800">Este enlace ya no sirve</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-xs">
          Pedile uno nuevo al negocio{inicio?.negocio?.nombre ? ` (${inicio.negocio.nombre})` : ''}.
        </p>
      </div>
    );
  }
  if (estado === 'error' || !inicio?.cliente) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
        <AlertCircle size={40} className="text-amber-400 mb-3" />
        <h1 className="text-xl font-black text-gray-800">No se pudo abrir</h1>
        <p className="text-sm text-gray-500 mt-2">Revisá la señal y volvé a intentar.</p>
        <button onClick={() => window.location.reload()}
          className="mt-4 px-5 py-3 rounded-xl bg-emerald-600 text-white font-black text-sm">
          Intentar otra vez
        </button>
      </div>
    );
  }

  const corte = inicio.corte;

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Encabezado: de quién es y quién soy. Sin esto el cliente no sabe si el
          enlace que le llegó por WhatsApp es el del negocio correcto. */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <Store size={20} className="text-emerald-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-black text-gray-900 truncate leading-tight">{inicio.negocio.nombre}</p>
            <p className="text-[11px] text-gray-500 truncate">{inicio.cliente.nombre}</p>
          </div>
        </div>
        {/* La hora de corte, dicha como la entiende quien pide. */}
        {puedePedir && corte && (
          <div className={`mt-2 flex items-start gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold ${
            corte.abierto ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
            <Clock size={14} className="mt-0.5 shrink-0" />
            <span>
              {corte.abierto
                ? <>Se reciben pedidos hasta las {corte.hora_corte} · faltan {faltante(corte.minutos_restantes ?? 0)}</>
                : (inicio.config?.mensaje_cerrado ?? 'Hoy no se están recibiendo pedidos.')}
            </span>
          </div>
        )}
      </header>

      {/* Pestañas */}
      <nav className="bg-white border-b border-gray-200 flex sticky top-[57px] z-10">
        {puedePedir && <Tab icon={Package} label="Catálogo" on={vista === 'catalogo'} onClick={() => setVista('catalogo')} />}
        {puedePedir && <Tab icon={ListOrdered} label="Mis pedidos" on={vista === 'pedidos'} onClick={() => setVista('pedidos')} />}
        {verSaldo && <Tab icon={Receipt} label="Mi cuenta" on={vista === 'cuenta'} onClick={() => setVista('cuenta')} />}
      </nav>

      {error && (
        <div className="mx-3 mt-3 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm font-bold text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400"><X size={15} /></button>
        </div>
      )}

      {/* ── Catálogo ─────────────────────────────────────────────────────── */}
      {vista === 'catalogo' && puedePedir && (
        <>
          <div className="px-3 pt-3 space-y-2">
            {editando && (
              <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-3 py-2.5 text-sm font-bold text-blue-800">
                <Pencil size={15} className="shrink-0" />
                <span className="flex-1">Estás cambiando el pedido {editando.numero}</span>
                <button onClick={vaciar} className="text-blue-500 underline text-xs">Dejarlo como estaba</button>
              </div>
            )}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Buscar producto…"
                className="w-full pl-9 pr-3 py-3 rounded-xl border-2 border-gray-200 text-sm focus:outline-none focus:border-emerald-400" />
            </div>
            {(catalogo?.categorias?.length ?? 0) > 0 && (
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                <Chip label="Todas" on={cat === 'todas'} onClick={() => setCat('todas')} />
                {catalogo!.categorias.map(c => (
                  <Chip key={c.id} label={c.nombre} on={cat === c.id} onClick={() => setCat(c.id)} />
                ))}
              </div>
            )}
          </div>

          <div className="px-3 py-3 space-y-2">
            {cargandoCat && !catalogo ? (
              <div className="flex items-center justify-center py-14 text-gray-400 gap-2">
                <Loader2 size={18} className="animate-spin" /> Cargando el catálogo…
              </div>
            ) : filtrados.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-14">No hay productos con eso.</p>
            ) : filtrados.map(p => {
              const q = Number(carrito[p.id] ?? 0);
              const agotado = p.sin_existencias;
              return (
                <div key={p.id}
                  className={`bg-white rounded-2xl border-2 p-3 flex gap-3 ${
                    q > 0 ? 'border-emerald-300' : 'border-gray-100'} ${agotado ? 'opacity-60' : ''}`}>
                  {p.imagen && (
                    <img src={p.imagen} alt="" loading="lazy"
                      className="w-16 h-16 rounded-xl object-cover bg-gray-50 shrink-0"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-900 leading-tight">{p.nombre}</p>
                    {/* El precio, grande y a la vista. Si es el acordado con este
                        cliente se dice, y el de lista va tachado al lado. */}
                    <div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
                      <span className="text-lg font-black text-emerald-700 tabular-nums">{plata(p.precio)}</span>
                      {p.precio_lista != null && (
                        <span className="text-xs text-gray-400 line-through tabular-nums">{plata(p.precio_lista)}</span>
                      )}
                      {p.es_precio_propio && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">TU PRECIO</span>
                      )}
                    </div>
                    <p className="text-[11px] font-bold mt-0.5">
                      {agotado ? <span className="text-red-600">Agotado</span>
                        : p.existencias != null ? <span className="text-gray-500">Quedan {p.existencias}</span>
                        : <span className="text-gray-400">Disponible</span>}
                    </p>
                  </div>
                  {/* Sumar y restar, con dedos. Nada de teclado numérico para
                      pedir tres unidades. */}
                  <div className="flex items-center gap-1.5 shrink-0 self-center">
                    {q > 0 && (
                      <button onClick={() => mover(p, -1)} aria-label={`Quitar uno de ${p.nombre}`}
                        className="w-11 h-11 rounded-xl border-2 border-gray-200 flex items-center justify-center active:scale-95">
                        <Minus size={16} className="text-gray-600" />
                      </button>
                    )}
                    {q > 0 && <span className="w-7 text-center font-black tabular-nums">{q}</span>}
                    <button onClick={() => mover(p, 1)} disabled={agotado || !abierto}
                      aria-label={`Agregar ${p.nombre}`}
                      className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center active:scale-95 disabled:bg-gray-200 disabled:text-gray-400">
                      <Plus size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Mis pedidos ──────────────────────────────────────────────────── */}
      {vista === 'pedidos' && (
        <div className="px-3 py-3 space-y-2">
          <button onClick={() => void cargarPedidos()}
            className="flex items-center gap-1.5 text-xs font-bold text-gray-500 px-2 py-1">
            <RefreshCw size={13} className={cargandoPedidos ? 'animate-spin' : ''} /> Actualizar
          </button>
          {cargandoPedidos && !pedidos ? (
            <div className="flex items-center justify-center py-14 text-gray-400 gap-2">
              <Loader2 size={18} className="animate-spin" /> Cargando…
            </div>
          ) : (pedidos ?? []).length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-14">Todavía no has hecho pedidos.</p>
          ) : (pedidos ?? []).map(p => (
            <div key={p.id} className="bg-white rounded-2xl border-2 border-gray-100 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-black text-gray-900">{p.numero}</p>
                  <p className="text-[11px] text-gray-500">{DIA(p.cuando)}</p>
                </div>
                <span className="text-lg font-black tabular-nums shrink-0">{plata(p.total)}</span>
              </div>
              <p className={`mt-1.5 inline-block text-[11px] font-black px-2 py-1 rounded-lg ${
                p.estado === 'pending' ? 'bg-amber-100 text-amber-800'
                : p.estado === 'taken' ? 'bg-blue-100 text-blue-800'
                : p.estado === 'charged' ? 'bg-emerald-100 text-emerald-800'
                : 'bg-gray-100 text-gray-600'}`}>
                {p.estado_texto}
              </p>
              {p.motivo && <p className="text-[11px] text-gray-500 mt-1">↳ {p.motivo}</p>}
              <ul className="mt-2 space-y-0.5 text-xs text-gray-600">
                {p.lineas.map((l, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate">{l.cantidad} × {l.nombre}</span>
                    <span className="tabular-nums shrink-0">{plata(l.total)}</span>
                  </li>
                ))}
              </ul>
              {p.notas && <p className="text-[11px] text-gray-500 mt-1.5">Nota: {p.notas}</p>}
              {p.editable ? (
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button onClick={() => void editar(p)}
                    className="flex-1 py-3 rounded-xl bg-blue-50 text-blue-700 font-black text-sm flex items-center justify-center gap-1.5">
                    <Pencil size={14} /> Cambiar
                  </button>
                  <button onClick={() => void cancelar(p)}
                    className="px-4 py-3 rounded-xl bg-red-50 text-red-700 font-black text-sm flex items-center gap-1.5">
                    <Trash2 size={14} /> Cancelar
                  </button>
                </div>
              ) : p.estado === 'pending' ? (
                <p className="text-[11px] text-gray-400 mt-2 pt-2 border-t border-gray-100">
                  Ya no se puede cambiar por acá. Llamá al negocio.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* ── Mi cuenta ────────────────────────────────────────────────────── */}
      {vista === 'cuenta' && verSaldo && (
        <div className="px-3 py-3 space-y-3">
          {/* El PIN no protege los precios —el enlace se reenvía—, protege lo
              que se debe, que no es información para un grupo de WhatsApp. */}
          {inicio.permisos?.pide_pin && !cuenta && (
            <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
              <p className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                <Lock size={15} className="text-gray-400" /> Escribí tu PIN para ver la cuenta
              </p>
              <div className="flex gap-2 mt-3">
                <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric" type="password" placeholder="••••"
                  className="flex-1 px-3 py-3 rounded-xl border-2 border-gray-200 text-center text-lg font-black tracking-widest" />
                <button onClick={() => void cargarCuenta(pin)} disabled={pin.length < 3 || cargandoCuenta}
                  className="px-5 py-3 rounded-xl bg-emerald-600 text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400">
                  {cargandoCuenta ? <Loader2 size={16} className="animate-spin" /> : 'Ver'}
                </button>
              </div>
              {errCuenta && <p className="text-xs font-bold text-red-600 mt-2">{errCuenta}</p>}
            </div>
          )}

          {!inicio.permisos?.pide_pin && errCuenta && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm font-bold text-red-700">{errCuenta}</div>
          )}

          {cargandoCuenta && !cuenta && !inicio.permisos?.pide_pin && (
            <div className="flex items-center justify-center py-14 text-gray-400 gap-2">
              <Loader2 size={18} className="animate-spin" /> Cargando…
            </div>
          )}

          {cuenta && (
            <>
              <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
                <p className="text-xs font-bold text-gray-500">Lo que debés hoy</p>
                <p className="text-3xl font-black text-gray-900 tabular-nums mt-0.5">{plata(cuenta.total)}</p>
                {cuenta.vencido > 0 && (
                  <p className="mt-1.5 inline-block text-[11px] font-black px-2 py-1 rounded-lg bg-red-100 text-red-700">
                    {plata(cuenta.vencido)} vencido
                  </p>
                )}
                {cuenta.credito && cuenta.limite > 0 && (
                  <p className="text-[11px] text-gray-500 mt-2">Tu límite de crédito es {plata(cuenta.limite)}.</p>
                )}
              </div>
              {cuenta.facturas.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-10">No tenés facturas pendientes. 🎉</p>
              ) : (
                <div className="space-y-2">
                  {cuenta.facturas.map(f => (
                    <div key={f.id} className={`bg-white rounded-2xl border-2 p-3 ${
                      f.vencida ? 'border-red-200' : 'border-gray-100'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900">{f.numero ?? 'Factura'}</p>
                          <p className="text-[11px] text-gray-500">
                            {f.vence ? `Vence ${f.vence}` : 'Sin fecha de vencimiento'}
                            {f.abonado > 0 ? ` · abonado ${plata(f.abonado)}` : ''}
                          </p>
                        </div>
                        <span className="font-black tabular-nums shrink-0">{plata(f.saldo)}</span>
                      </div>
                      {f.vencida && (
                        <span className="mt-1.5 inline-block text-[10px] font-black px-1.5 py-0.5 rounded bg-red-100 text-red-700">VENCIDA</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Carrito: barra fija ──────────────────────────────────────────── */}
      {vista === 'catalogo' && puedePedir && cuantos > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 p-3 bg-gradient-to-t from-gray-50 via-gray-50">
          <button onClick={() => setHojaCarrito(true)}
            className="w-full flex items-center justify-between gap-3 rounded-2xl bg-emerald-600 active:bg-emerald-700 text-white px-4 py-4 shadow-lg">
            <span className="flex items-center gap-2 font-black">
              <ShoppingCart size={20} /> {cuantos} {cuantos === 1 ? 'artículo' : 'artículos'}
            </span>
            <span className="text-xl font-black tabular-nums">{plata(total)}</span>
          </button>
        </div>
      )}

      {/* Hoja del carrito: revisar antes de mandar. */}
      {hojaCarrito && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-end" onClick={() => setHojaCarrito(false)}>
          <div className="bg-white w-full rounded-t-3xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <ShoppingCart size={18} className="text-emerald-600" />
              <h2 className="font-black text-gray-900 flex-1">
                {editando ? `Cambiar ${editando.numero}` : 'Tu pedido'}
              </h2>
              <button onClick={() => setHojaCarrito(false)} className="p-1.5 text-gray-400"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {lineas.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-10">El pedido está vacío.</p>
              ) : lineas.map(({ p, q }) => (
                <div key={p.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-gray-900 truncate">{p.nombre}</p>
                    <p className="text-[11px] text-gray-500 tabular-nums">{q} × {plata(p.precio)}</p>
                  </div>
                  <span className="font-black tabular-nums text-sm">{plata(p.precio * q)}</span>
                  <button onClick={() => mover(p, -1)} className="w-9 h-9 rounded-lg border-2 border-gray-200 flex items-center justify-center">
                    <Minus size={14} className="text-gray-600" />
                  </button>
                  <button onClick={() => mover(p, 1)} className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <Plus size={14} className="text-emerald-700" />
                  </button>
                </div>
              ))}
              <div className="pt-3">
                <label className="block text-xs font-bold text-gray-600 mb-1">Nota para el negocio</label>
                <textarea value={notas} onChange={e => setNotas(e.target.value.slice(0, 500))} rows={2}
                  placeholder="Ej. entregar después de las 2, preguntar por doña Ana…"
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 text-sm resize-none" />
              </div>
              {/* Se dice ANTES de mandar: el pedido es a crédito y lo revisa el
                  negocio. Nadie debería enterarse de eso al recibir la factura. */}
              <p className="text-[11px] text-gray-500 leading-snug">
                El pedido entra a crédito y el negocio lo revisa antes de facturarlo.
                No se paga por acá.
              </p>
            </div>
            <div className="border-t border-gray-100 p-3 space-y-2">
              <div className="flex items-center justify-between font-black text-lg">
                <span>Total</span><span className="tabular-nums">{plata(total)}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={vaciar}
                  className="px-4 py-4 rounded-xl border-2 border-gray-200 text-gray-600 font-bold text-sm">
                  Vaciar
                </button>
                <button onClick={() => void enviar()} disabled={enviando || lineas.length === 0 || !abierto}
                  className="flex-1 py-4 rounded-xl bg-emerald-600 active:bg-emerald-700 text-white font-black disabled:bg-gray-200 disabled:text-gray-400 flex items-center justify-center gap-2">
                  {enviando ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                  {editando ? 'Guardar cambios' : abierto ? 'Enviar pedido' : 'Cerrado por hoy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación: el número del pedido, que es lo que el cliente va a
          mencionar cuando llame a preguntar. */}
      {listo && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-5" onClick={() => setListo(null)}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
            <CheckCircle2 size={44} className="text-emerald-600 mx-auto" />
            <h2 className="text-xl font-black text-gray-900 mt-2">
              {listo.numero ? `Pedido ${listo.numero}` : 'Pedido guardado'}
            </h2>
            <p className="text-3xl font-black text-gray-900 tabular-nums mt-1">{plata(listo.total)}</p>
            {listo.problemas?.length > 0 && (
              <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-left">
                <p className="text-[11px] font-black text-amber-800">No entró todo:</p>
                <ul className="text-[11px] text-amber-800 mt-0.5 space-y-0.5">
                  {listo.problemas.map((x, i) => <li key={i}>· {x}</li>)}
                </ul>
              </div>
            )}
            {listo.aviso && (
              <p className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] font-bold text-amber-800 text-left">
                {listo.aviso}
              </p>
            )}
            <button onClick={() => { setListo(null); setVista('pedidos'); setPedidos(null); }}
              className="w-full mt-4 py-4 rounded-xl bg-emerald-600 text-white font-black">
              Ver mis pedidos
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

function Tab({ icon: Icon, label, on, onClick }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string; on: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-black border-b-2 transition ${
        on ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500'}`}>
      <Icon size={15} /> {label}
    </button>
  );
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 px-3 py-2 rounded-xl text-xs font-black whitespace-nowrap ${
        on ? 'bg-emerald-600 text-white' : 'bg-white border-2 border-gray-200 text-gray-600'}`}>
      {label}
    </button>
  );
}

export default PortalCliente;
