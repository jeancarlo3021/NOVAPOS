import React, { useEffect, useState } from 'react';
import { X, Loader2, ClipboardList, AlertTriangle } from 'lucide-react';
import { distributionService } from '@/services/distribution/distributionService';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;
const cant = (n: number) => Number(n || 0).toLocaleString('es-CR', { maximumFractionDigits: 3 });

/**
 * Con qué SALIÓ el camión, no lo que le queda.
 *
 * El stock del camión muestra el saldo del momento: un producto que se agotó a
 * media ruta desaparece de esa lista, y no hay forma de saber si salió con
 * veinte y se vendieron todos o si nunca se cargó. Al cerrar la ruta y cuadrar
 * con el chofer, esa diferencia es justo lo que hay que revisar.
 */
export const LoadHistoryModal: React.FC<{
  routeId: string;
  routeLabel?: string;
  onClose: () => void;
}> = ({ routeId, routeLabel, onClose }) => {
  const [datos, setDatos] = useState<any | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    distributionService.loadHistory(routeId)
      .then(setDatos)
      .catch(e => setError(e instanceof Error ? e.message : 'No se pudo cargar el detalle'))
      .finally(() => setCargando(false));
  }, [routeId]);

  const items = datos?.items ?? [];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="w-full max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div>
            <h3 className="font-black text-gray-900 flex items-center gap-2">
              <ClipboardList size={18} className="text-blue-600" /> Con qué se cargó
            </h3>
            <p className="text-[11px] font-bold text-gray-400">
              {routeLabel}{datos?.route_date ? ` · ${datos.route_date}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        {cargando && (
          <div className="py-14 text-center text-gray-400 flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Cargando…
          </div>
        )}
        {error && <p className="px-5 py-6 text-sm font-bold text-red-600">{error}</p>}

        {!cargando && !error && datos?.sin_registro && (
          <div className="px-5 py-8 text-center space-y-2">
            <AlertTriangle size={22} className="mx-auto text-amber-500" />
            <p className="text-sm font-bold text-gray-700">No hay registro de carga para esta ruta.</p>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Las rutas cargadas antes de que se empezara a guardar el detalle no lo tienen.
              Las nuevas sí quedan registradas.
            </p>
          </div>
        )}

        {!cargando && !error && !datos?.sin_registro && (
          <>
            <div className="grid grid-cols-3 gap-2 px-5 py-3 border-b border-gray-100">
              <Resumen etiqueta="Cargado" valor={cant(datos?.total_loaded ?? 0)} />
              <Resumen etiqueta="Queda" valor={cant(datos?.total_remaining ?? 0)} />
              <Resumen etiqueta="Valor cargado" valor={fmt(datos?.total_value ?? 0)} />
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="text-[11px] font-bold text-gray-500 uppercase">
                    <th className="text-left px-4 py-2">Producto</th>
                    <th className="text-right px-3 py-2">Cargado</th>
                    <th className="text-right px-3 py-2">Salió</th>
                    <th className="text-right px-4 py-2">Queda</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any) => (
                    <tr key={it.product_id} className="border-t border-gray-50">
                      <td className="px-4 py-2">
                        <p className="font-semibold text-gray-800">{it.name}</p>
                        {it.sku && <p className="text-[11px] text-gray-400">{it.sku}</p>}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-gray-800">{cant(it.loaded)}</td>
                      {/* «Salió» es vendido, entregado o faltante: el sistema no
                          puede distinguirlos, y decir «vendido» sería mentir. */}
                      <td className="px-3 py-2 text-right text-blue-700 font-semibold">{cant(it.moved)}</td>
                      <td className={`px-4 py-2 text-right font-bold ${
                        it.remaining === 0 ? 'text-gray-400' : 'text-emerald-700'}`}>
                        {cant(it.remaining)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="px-5 py-2.5 border-t border-gray-100 text-[11px] font-semibold text-gray-400">
              «Salió» es lo que ya no está en el camión: vendido, entregado o faltante.
              Para cuadrar con el chofer, comparalo contra las ventas de la ruta.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

const Resumen: React.FC<{ etiqueta: string; valor: string }> = ({ etiqueta, valor }) => (
  <div className="text-center">
    <p className="text-[10px] font-bold text-gray-400 uppercase">{etiqueta}</p>
    <p className="font-black text-gray-900">{valor}</p>
  </div>
);

export default LoadHistoryModal;
