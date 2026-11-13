import React, { useEffect, useState, useMemo } from 'react';
import { ArrowUp, ArrowDown, Edit3, AlertTriangle, Clock, Filter, Search, X, Loader2 } from 'lucide-react';
import { stockAdjustmentsService, type StockAdjustment, type AdjustmentType } from '@/services/Inventory/stockAdjustmentsService';

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

  const stats = useMemo(() => {
    const totalIn = data.filter(a => Number(a.quantity) > 0).reduce((s, a) => s + Number(a.quantity), 0);
    const totalOut = data.filter(a => Number(a.quantity) < 0).reduce((s, a) => s + Math.abs(Number(a.quantity)), 0);
    const damaged = data.filter(a => a.type === 'damage' || a.type === 'expired' || a.type === 'theft')
      .reduce((s, a) => s + Math.abs(Number(a.quantity)), 0);
    return { totalIn, totalOut, damaged, count: data.length };
  }, [data]);

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
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const meta = TYPE_META[a.type];
                  const qty = Number(a.quantity);
                  return (
                    <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-5 py-3 text-xs text-gray-600 font-mono">
                        {new Date(a.created_at).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-bold text-gray-900">{a.product?.name ?? '—'}</p>
                        {a.product?.sku && <p className="text-xs text-gray-400 font-mono">{a.product.sku}</p>}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-${meta.color}-50 text-${meta.color}-700`}>
                          {meta.emoji} {meta.label}
                        </span>
                        {a.notes && <p className="text-xs text-gray-500 mt-0.5">{a.notes}</p>}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600 font-mono">{a.stock_before}</td>
                      <td className={`px-5 py-3 text-right font-bold font-mono ${qty > 0 ? 'text-emerald-600' : qty < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {qty > 0 ? '+' : ''}{qty}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-gray-900 font-mono">{a.stock_after}</td>
                      <td className="px-5 py-3 text-xs text-gray-500">{a.user_email ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
