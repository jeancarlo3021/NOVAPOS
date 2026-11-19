import React, { useEffect, useState, useMemo } from 'react';
import { ArrowUp, ArrowDown, AlertTriangle, Clock, Filter, Search, X, Loader2, Ban } from 'lucide-react';
import { stockAdjustmentsService, type StockAdjustment, type AdjustmentType } from '@/services/Inventory/stockAdjustmentsService';
import { useAuth } from '@/context/AuthContext';

const TYPE_META: Record<AdjustmentType, { label: string; emoji: string; color: string; direction: 'in' | 'out' | 'set' }> = {
  increase: { label: 'Entrada',          emoji: '📥', color: 'emerald', direction: 'in'  },
  return:   { label: 'Devolución',       emoji: '↩️', color: 'emerald', direction: 'in'  },
  decrease: { label: 'Salida',           emoji: '📤', color: 'red',     direction: 'out' },
  damage:   { label: 'Dañado',           emoji: '💥', color: 'red',     direction: 'out' },
  expired:  { label: 'Vencido',          emoji: '⏰', color: 'red',     direction: 'out' },
  theft:    { label: 'Robo / Pérdida',   emoji: '🚨', color: 'red',     direction: 'out' },
  set:      { label: 'Corrección',       emoji: '✏️', color: 'blue',    direction: 'set' },
  count:    { label: 'Conteo',           emoji: '📋', color: 'blue',    direction: 'set' },
};

interface Props {
  tenantId: string | null;
  from: string;
  to: string;
}

export const StockAdjustmentsReport: React.FC<Props> = ({ tenantId, from, to }) => {
  const [data, setData] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<AdjustmentType | 'all'>('all');

  /**
   * BUSCAR UN PRODUCTO.
   *
   * «¿Qué le pasó al arroz este mes?» es LA pregunta de este reporte, y había
   * que recorrer la lista a ojo para contestarla.
   *
   * La busca el SERVIDOR y no la pantalla: el listado trae como máximo mil
   * movimientos, y en un mes movido filtrar solo lo cargado dejaría afuera
   * justo los movimientos viejos del producto que se está buscando —y nada lo
   * diría—.
   */
  /** Movimiento que se está por anular (confirmación con motivo). */
  const [porAnular, setPorAnular] = useState<StockAdjustment | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enLote, setEnLote] = useState(true);
  const [anulando, setAnulando] = useState(false);
  const [avisoAnulacion, setAvisoAnulacion] = useState<string | null>(null);
  /** Solo quien puede borrar inventario anula movimientos. */
  const { user } = useAuth();
  const puedeAnular = ['owner', 'admin', 'gerente'].includes(user?.role ?? '');

  const [busqueda, setBusqueda] = useState('');
  /** Lo que de verdad se le pidió al servidor (la escritura va con retardo). */
  const [buscado, setBuscado] = useState('');
  const [buscando, setBuscando] = useState(false);

  /* Con retardo: una consulta por tecla es una consulta por tecla. */
  useEffect(() => {
    const t = setTimeout(() => setBuscado(busqueda.trim()), 350);
    return () => clearTimeout(t);
  }, [busqueda]);

  /** El tope que pide el reporte. Si vuelve lleno, la lista está cortada. */
  const TOPE = 2000;

  useEffect(() => {
    if (!tenantId) return;
    let vivo = true;
    /* La primera carga muestra el spinner grande; una búsqueda, solo el
       spinner chico del buscador: cambiar toda la pantalla por un carácter
       tecleado se siente como si se hubiera perdido lo que había. */
    if (data.length === 0) setLoading(true);
    setBuscando(true);
    setError(null);
    stockAdjustmentsService.list({ from, to, search: buscado || undefined, limit: TOPE })
      .then(d => { if (vivo) setData(d); })
      .catch(e => { if (vivo) setError(e.message || 'Error cargando ajustes'); })
      .finally(() => { if (vivo) { setLoading(false); setBuscando(false); } });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, from, to, buscado]);

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return data;
    return data.filter(a => a.type === typeFilter);
  }, [data, typeFilter]);

  /**
   * Los movimientos ANULADOS no cuentan en ningún total.
   *
   * Es la razón de ser de la anulación: una merma tecleada con un cero de más
   * inflaba las pérdidas del mes para siempre. Siguen apareciendo en la lista
   * —tachados— porque esconderlos sería borrar la bitácora.
   */
  const vivos = useMemo(() => data.filter(a => !a.voided_at), [data]);

  const stats = useMemo(() => {
    const totalIn = vivos.filter(a => Number(a.quantity) > 0).reduce((s, a) => s + Number(a.quantity), 0);
    const totalOut = vivos.filter(a => Number(a.quantity) < 0).reduce((s, a) => s + Math.abs(Number(a.quantity)), 0);
    const damaged = vivos.filter(a => a.type === 'damage' || a.type === 'expired' || a.type === 'theft')
      .reduce((s, a) => s + Math.abs(Number(a.quantity)), 0);
    return { totalIn, totalOut, damaged, count: vivos.length, anulados: data.length - vivos.length };
  }, [data, vivos]);

  /** Lo que una anulación va a deshacer, dicho antes de hacerla. */
  const delLote = useMemo(() => {
    if (!porAnular?.batch_id) return [] as StockAdjustment[];
    return data.filter(a => a.batch_id === porAnular.batch_id && !a.voided_at);
  }, [porAnular, data]);

  const anular = async () => {
    if (!porAnular) return;
    setAnulando(true);
    setError(null);
    try {
      const r = await stockAdjustmentsService.anular(porAnular.id, {
        motivo: motivo.trim() || undefined,
        enLote: enLote && !!porAnular.batch_id,
      });
      setPorAnular(null); setMotivo('');
      setAvisoAnulacion(r.aviso ?? null);
      // Se recarga del servidor: el stock que quedó es dato del servidor, no
      // una resta hecha acá que podría no coincidir con lo que de verdad pasó.
      const d = await stockAdjustmentsService.list({ from, to, search: buscado || undefined, limit: TOPE });
      setData(d);
    } catch (e: any) {
      setError(e?.message || 'No se pudo anular el movimiento');
    } finally { setAnulando(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (error) {
    return <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">✗ {error}</div>;
  }

  return (
    <div className="space-y-6">
      {/* KPIs. Con un producto buscado son los de ESE producto: un número que
          cambió de significado sin avisar se lee como el del negocio entero. */}
      {buscado && (
        <p className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
          Los totales de abajo son solo de lo que calza con «{buscado}».
        </p>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon={ArrowDown} label="Entradas" value={`+${stats.totalIn}`} color="bg-emerald-500" />
        <KPI icon={ArrowUp} label="Salidas" value={`-${stats.totalOut}`} color="bg-red-500" />
        <KPI icon={AlertTriangle} label="Pérdidas (daño/vence/robo)" value={`${stats.damaged}`} color="bg-orange-500" />
        <KPI icon={Clock} label="Total movimientos" value={`${stats.count}`} color="bg-blue-500" />
      </div>
      {stats.anulados > 0 && (
        <p className="text-xs text-gray-500">
          {stats.anulados} movimiento{stats.anulados === 1 ? '' : 's'} anulado{stats.anulados === 1 ? '' : 's'} en este período
          {' '}— no cuenta{stats.anulados === 1 ? '' : 'n'} en los totales de arriba.
        </p>
      )}
      {/* El stock negativo se dice, no se acomoda: se anuló una entrada cuya
          mercadería ya había salido. */}
      {avisoAnulacion && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs font-bold text-amber-800 flex-1">{avisoAnulacion}</p>
          <button onClick={() => setAvisoAnulacion(null)} className="text-amber-500 hover:text-amber-800"><X size={14} /></button>
        </div>
      )}

      {/* Buscador de producto */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar producto por nombre o código…"
            className="w-full h-11 pl-10 pr-20 border-2 border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:border-blue-400"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {buscando && <Loader2 size={14} className="animate-spin text-gray-400" />}
            {busqueda && (
              <button type="button" onClick={() => setBusqueda('')} aria-label="Limpiar la búsqueda"
                className="text-gray-400 hover:text-gray-700">
                <X size={16} />
              </button>
            )}
          </div>
        </div>
        {buscado && (
          <span className="text-xs font-bold text-gray-500">
            {data.length === 0
              ? `Sin movimientos de «${buscado}» en este período`
              : `${data.length} movimiento(s) de «${buscado}»`}
          </span>
        )}
      </div>

      {/* La lista llegó al tope: decirlo, porque los totales de arriba también
          están cortados y se leerían como el movimiento completo del mes. */}
      {data.length >= TOPE && (
        <p className="text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Se muestran los {TOPE.toLocaleString('es-CR')} movimientos más recientes del período: hay más.
          Buscá un producto o achicá las fechas para verlos todos.
        </p>
      )}

      {/* Filtro */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-gray-400" />
        <span className="text-xs font-bold text-gray-500 uppercase">Filtrar por tipo:</span>
        <button
          onClick={() => setTypeFilter('all')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
            typeFilter === 'all' ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200 text-gray-600'
          }`}
        >
          Todos
        </button>
        {(Object.keys(TYPE_META) as AdjustmentType[]).map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
              typeFilter === t
                ? `bg-${TYPE_META[t].color}-500 text-white`
                : 'bg-white border border-gray-200 text-gray-600'
            }`}
          >
            {TYPE_META[t].emoji} {TYPE_META[t].label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-black text-gray-900">
            Historial de ajustes <span className="text-gray-400 font-normal">({filtered.length})</span>
          </h2>
        </div>
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            {/* Vacío por el buscador y vacío porque no hubo movimientos no son
                lo mismo: confundirlos hace creer que el producto no se movió. */}
            {buscado ? (
              <>
                <p className="font-semibold">Nada de «{buscado}» en este período</p>
                <p className="text-xs mt-1">
                  Revisá el nombre o el código, o ampliá las fechas.
                  {typeFilter !== 'all' && ' También tenés un filtro de tipo puesto.'}
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">Sin ajustes en este período</p>
                <p className="text-xs mt-1">Los ajustes manuales de stock aparecerán aquí</p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Fecha</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Producto</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Motivo</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase">Antes</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase">Cambio</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase">Después</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Usuario</th>
                  {puedeAnular && <th className="px-5 py-3" />}
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const meta = TYPE_META[a.type];
                  const qty = Number(a.quantity);
                  const anulado = !!a.voided_at;
                  /* Lo que salió de una compra o del cierre de una ruta no se
                     anula acá: se deshace en su documento, o la compra quedaría
                     diciendo «recibida» con la mercadería ya devuelta. */
                  const deSistema = (a.source ?? 'manual') !== 'manual';
                  return (
                    <tr key={a.id} className={`border-t border-gray-100 hover:bg-gray-50 ${anulado ? 'opacity-50' : ''}`}>
                      <td className="px-5 py-3 text-xs text-gray-600 font-mono">
                        {new Date(a.created_at).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-bold text-gray-900">{a.product?.name ?? '—'}</p>
                        {a.product?.sku && <p className="text-xs text-gray-400 font-mono">{a.product.sku}</p>}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-${meta.color}-50 text-${meta.color}-700 ${anulado ? 'line-through' : ''}`}>
                          {meta.emoji} {meta.label}
                        </span>
                        {a.notes && <p className="text-xs text-gray-500 mt-0.5">{a.notes}</p>}
                        {anulado && (
                          <p className="text-[11px] font-bold text-red-600 mt-0.5">
                            Anulado{a.void_reason ? ` · ${a.void_reason}` : ''}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600 font-mono">{a.stock_before}</td>
                      <td className={`px-5 py-3 text-right font-bold font-mono ${anulado ? 'text-gray-400 line-through' : qty > 0 ? 'text-emerald-600' : qty < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {qty > 0 ? '+' : ''}{qty}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-gray-900 font-mono">{a.stock_after}</td>
                      <td className="px-5 py-3 text-xs text-gray-500">{a.user_email ?? '—'}</td>
                      {puedeAnular && (
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          {anulado ? (
                            <span className="text-[11px] font-bold text-gray-400">Anulado</span>
                          ) : deSistema ? (
                            /* Se dice POR QUÉ no se puede, en vez de no poner
                               nada: un botón ausente se lee como un error. */
                            <span className="text-[11px] text-gray-400" title="Se deshace desde su documento (la compra o la ruta)">
                              —
                            </span>
                          ) : (
                            <button onClick={() => { setPorAnular(a); setMotivo(''); setEnLote(true); }}
                              title="Anular este movimiento y devolver el stock"
                              className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100">
                              <Ban size={12} /> Anular
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Confirmar la anulación ──
          Con motivo y diciendo exactamente qué va a pasar con el stock: anular
          un movimiento mueve inventario de verdad, y el encargado tiene que
          poder leer el número antes de apretar. */}
      {porAnular && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
          onClick={() => !anulando && setPorAnular(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-black text-gray-900 flex items-center gap-2">
                <Ban size={17} className="text-red-600" /> Anular movimiento
              </h3>
              <button onClick={() => setPorAnular(null)} disabled={anulando}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-gray-50 rounded-xl p-3 text-sm">
                <p className="font-bold text-gray-900">{porAnular.product?.name ?? 'Producto'}</p>
                <p className="text-xs text-gray-500">{porAnular.reason}</p>
                <p className="text-xs text-gray-600 mt-1">
                  Movimiento: <b className={Number(porAnular.quantity) > 0 ? 'text-emerald-600' : 'text-red-600'}>
                    {Number(porAnular.quantity) > 0 ? '+' : ''}{Number(porAnular.quantity)}
                  </b>
                  {' · '}al anularlo el stock se mueve <b>{Number(porAnular.quantity) > 0 ? '−' : '+'}{Math.abs(Number(porAnular.quantity))}</b>
                </p>
              </div>

              {/* Toda la merma o solo esta línea: botar cinco cosas al cierre
                  de cocina es un acto, y deshacerlo línea por línea deja el
                  registro a medias si alguien se distrae. */}
              {porAnular.batch_id && delLote.length > 1 && (
                <label className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded-xl p-3 cursor-pointer">
                  <input type="checkbox" checked={enLote} onChange={e => setEnLote(e.target.checked)} className="mt-0.5" />
                  <span className="text-xs text-amber-900">
                    Anular las <b>{delLote.length} líneas</b> que se registraron juntas.
                    Si lo desmarcás, se anula solo esta.
                  </span>
                </label>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Motivo (opcional)</label>
                <input value={motivo} onChange={e => setMotivo(e.target.value)}
                  placeholder="Ej.: se digitó 100 en vez de 10"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" />
                <p className="text-[11px] text-gray-400 mt-1">
                  El movimiento no se borra: queda anulado en la bitácora, deja de contar en los
                  totales y en el kardex, y el stock vuelve como estaba.
                </p>
              </div>

              <button onClick={anular} disabled={anulando}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-black py-3 rounded-xl text-sm">
                {anulando ? <><Loader2 size={15} className="animate-spin" /> Anulando…</> : <><Ban size={15} /> Anular y devolver el stock</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const KPI: React.FC<{ icon: any; label: string; value: string; color: string }> = ({ icon: Icon, label, value, color }) => (
  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
      <Icon size={22} className="text-white" />
    </div>
    <div className="min-w-0">
      <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">{label}</p>
      <p className="text-gray-900 font-black text-xl leading-tight truncate">{value}</p>
    </div>
  </div>
);
