import React, { useEffect, useState } from 'react';
import {
  PackagePlus, X, AlertTriangle, Loader, CheckCircle2, History, Infinity as InfinityIcon,
} from 'lucide-react';
import {
  inventoryPurchasesService, type EstadoDeCarga,
} from '@/services/Inventory/inventoryPurchasesService';
import { fmtDate } from './types';

/**
 * CARGAR UNA ORDEN AL INVENTARIO OTRA VEZ.
 *
 * Para cuando la mercadería entró pero las existencias no están: se puso el
 * inventario en cero, se restauró un respaldo viejo, o la recepción se cortó a
 * la mitad. Hasta ahora la única salida era ajustar producto por producto.
 *
 * La pantalla enseña PRIMERO lo que va a pasar, porque cargar dos veces una
 * compra no avisa: el sistema queda con el doble de existencias y el error
 * aparece semanas después, en un conteo físico. Por eso se muestra si la orden
 * ya se cargó antes —con fecha— y, si la factura quedó mal conciliada, se dice
 * antes de que alguien empeore el inventario creyendo que lo arregla.
 */

interface Props {
  purchase: any;
  onClose: () => void;
  onDone: () => void;
}

export function ReloadStockModal({ purchase, onClose, onDone }: Props) {
  const [estado, setEstado] = useState<EstadoDeCarga | null>(null);
  const [cargando, setCargando] = useState(true);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState<{ aplicados: number; unidades: number; sinStock: number; fallaron: number } | null>(null);

  useEffect(() => {
    let vivo = true;
    inventoryPurchasesService.stockStatus(purchase.id)
      .then(e => { if (vivo) setEstado(e); })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo revisar la orden'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [purchase.id]);

  const aplicar = async () => {
    setAplicando(true); setError('');
    try {
      const r = await inventoryPurchasesService.reloadStock(purchase.id);
      setHecho(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar al inventario');
    } finally { setAplicando(false); }
  };

  const yaSeCargo = (estado?.cargas_previas?.length ?? 0) > 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <PackagePlus size={20} className="text-emerald-600 shrink-0" />
          <h2 className="font-black text-gray-900 flex-1 truncate">
            Cargar al inventario · {purchase.purchase_number ?? 'orden'}
          </h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-bold">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span>{error}</span>
            </div>
          )}

          {hecho ? (
            <div className="text-center py-8">
              <CheckCircle2 size={44} className="text-emerald-600 mx-auto" />
              <p className="text-xl font-black text-gray-900 mt-2">Inventario cargado</p>
              <p className="text-sm text-gray-600 mt-1">
                {hecho.aplicados} producto(s) · {hecho.unidades} unidad(es) sumadas.
              </p>
              {hecho.sinStock > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {hecho.sinStock} no llevan control de existencias y no se tocaron.
                </p>
              )}
              {hecho.fallaron > 0 && (
                <p className="text-xs text-amber-700 font-bold mt-1">
                  {hecho.fallaron} línea(s) no se pudieron cargar: el producto ya no existe.
                </p>
              )}
              <button onClick={onDone}
                className="mt-5 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black">
                Listo
              </button>
            </div>
          ) : cargando ? (
            <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
              <Loader size={18} className="animate-spin" /> Revisando la orden…
            </div>
          ) : estado ? (
            <>
              {/* Lo que va a entrar */}
              <div className="grid grid-cols-3 gap-2">
                <Dato valor={estado.productos} label="productos" />
                <Dato valor={estado.unidades} label="unidades" />
                <Dato valor={estado.lineas} label="líneas" />
              </div>

              {/* Ya se cargó antes: el aviso que evita duplicar el inventario. */}
              {yaSeCargo && (
                <div className="flex items-start gap-2 bg-amber-50 border-2 border-amber-200 rounded-xl px-4 py-3">
                  <History size={16} className="text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-black text-amber-900">
                      Esta orden ya entró al inventario {estado.cargas_previas.length === 1 ? 'una vez' : `${estado.cargas_previas.length} veces`}.
                    </p>
                    <p className="text-amber-800 mt-0.5">
                      {estado.cargas_previas.map(f => fmtDate(f)).join(' · ')} — {estado.unidades_ya_cargadas} unidad(es).
                      Si las existencias están puestas, volver a cargarla las deja al doble.
                    </p>
                  </div>
                </div>
              )}

              {/* Orden mal conciliada: muchas líneas sobre un mismo producto. */}
              {estado.sospechosa && (
                <div className="flex items-start gap-2 bg-red-50 border-2 border-red-200 rounded-xl px-4 py-3">
                  <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-black text-red-900">Esta orden no quedó bien armada.</p>
                    <p className="text-red-800 mt-0.5">
                      {estado.lineas_repetidas} de sus {estado.lineas} líneas caen sobre un mismo producto,
                      así que la mercadería de muchos artículos distintos se sumaría a unos pocos.
                      Volvé a procesar el comprobante del proveedor antes de cargarla.
                    </p>
                  </div>
                </div>
              )}

              {/* Producto por producto, con el resultado */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs">
                    <tr>
                      <th className="text-left px-3 py-2 font-bold">Producto</th>
                      <th className="text-right px-3 py-2 font-bold">Entra</th>
                      <th className="text-right px-3 py-2 font-bold">Hoy</th>
                      <th className="text-right px-3 py-2 font-bold">Queda</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {estado.detalle.slice(0, 200).map(d => (
                      <tr key={d.product_id} className={d.lineas >= 5 ? 'bg-red-50/50' : ''}>
                        <td className="px-3 py-2">
                          <span className="font-semibold text-gray-800">{d.nombre}</span>
                          {d.lineas > 1 && (
                            <span className="ml-1.5 text-[10px] font-black px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                              {d.lineas} LÍNEAS
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums text-emerald-700">+{d.cantidad}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                          {d.infinito ? <InfinityIcon size={13} className="inline text-gray-400" /> : d.stock ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-black tabular-nums">
                          {d.infinito ? '—' : (Number(d.stock ?? 0) + d.cantidad)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {estado.detalle.length > 200 && (
                  <p className="px-3 py-2 text-xs text-gray-400 bg-gray-50">
                    …y {estado.detalle.length - 200} producto(s) más.
                  </p>
                )}
              </div>

              <p className="text-xs text-gray-500">
                Solo se suman existencias. La orden no se vuelve a cobrar ni se crea otra cuenta
                por pagar: esa plata ya quedó registrada cuando se recibió.
              </p>
            </>
          ) : null}
        </div>

        {!hecho && (
          <div className="border-t border-gray-100 p-4 flex gap-2">
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={aplicar} disabled={aplicando || cargando || !estado || estado.productos === 0}
              className={`flex-[2] py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 disabled:bg-gray-200 disabled:text-gray-400 ${
                estado?.sospechosa || yaSeCargo ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              {aplicando ? <Loader size={16} className="animate-spin" /> : <PackagePlus size={16} />}
              {estado?.sospechosa || yaSeCargo ? 'Cargar de todos modos' : 'Cargar al inventario'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Dato({ valor, label }: { valor: number; label: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
      <p className="text-xl font-black text-gray-900 tabular-nums">{valor}</p>
      <p className="text-[11px] font-bold text-gray-500">{label}</p>
    </div>
  );
}

export default ReloadStockModal;
