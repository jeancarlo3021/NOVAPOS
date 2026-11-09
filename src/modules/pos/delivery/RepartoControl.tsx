import React, { useMemo, useState } from 'react';
import { Bike, X, Check } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';

/**
 * EL COBRO DEL DOMICILIO, en el carrito.
 *
 * El reparto propio no es el delivery de plataformas: acá el muchacho sale en
 * moto, cobra el domicilio y vuelve con la plata. Esa plata entra a la caja
 * como cualquier venta, así que el cobro se agrega al carrito como una línea
 * más —el artículo «Entrega a domicilio» que se configura en Ajustes— y el
 * cliente lo ve en su tiquete.
 *
 * El monto NO es fijo: cambia con la distancia. Por eso se eligen tarifas
 * guardadas (y se puede escribir otra): elegir de una lista evita teclear de
 * memoria, y además deja la zona anotada, que es lo que después explica por
 * qué un viaje costó más que otro.
 */
export interface RepartoElegido {
  /** El artículo del catálogo con el que se cobra. */
  producto_id: string;
  monto: number;
  zona: string | null;
  repartidor: string | null;
}

export const RepartoControl: React.FC<{
  valor: RepartoElegido | null;
  onCambio: (v: RepartoElegido | null) => void;
}> = ({ valor, onCambio }) => {
  const { settings } = useSettings('delivery');
  const [abierto, setAbierto] = useState(false);

  const productoId = String((settings as any)?.reparto_producto_id ?? '');
  const tarifas: Array<{ nombre: string; monto: number }> = useMemo(
    () => Array.isArray((settings as any)?.reparto_tarifas) ? (settings as any).reparto_tarifas : [],
    [settings]);
  const repartidores: string[] = useMemo(
    () => Array.isArray((settings as any)?.reparto_repartidores) ? (settings as any).reparto_repartidores : [],
    [settings]);

  const [monto, setMonto] = useState('');
  const [zona, setZona] = useState('');
  const [quien, setQuien] = useState('');

  /* Sin artículo configurado no se muestra nada: un botón que al tocarlo dice
     «falta configurar» es peor que no tener botón. */
  if (!productoId) return null;

  const crc = (n: number) => `₡${Math.round(n).toLocaleString('es-CR')}`;

  const aplicar = () => {
    const m = Number(monto) || 0;
    if (m <= 0) return;
    onCambio({ producto_id: productoId, monto: m, zona: zona.trim() || null, repartidor: quien.trim() || null });
    setAbierto(false);
  };

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border-2 text-sm font-bold transition ${
          valor ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-white text-gray-600 hover:border-emerald-300'}`}>
        <span className="flex items-center gap-2"><Bike size={15} /> Reparto</span>
        {valor
          ? <span className="tabular-nums font-black">
              {crc(valor.monto)}{valor.repartidor ? ` · ${valor.repartidor}` : ''}
            </span>
          : <span className="text-xs text-gray-400">agregar domicilio</span>}
      </button>

      {abierto && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={() => setAbierto(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Bike size={18} className="text-emerald-600" />
              <h3 className="font-black text-gray-900 flex-1">Cobro del domicilio</h3>
              <button onClick={() => setAbierto(false)} className="p-1.5 text-gray-400"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-4">
              {tarifas.length > 0 && (
                <div>
                  <p className="text-xs font-black text-gray-600 mb-1.5">Zona</p>
                  <div className="grid grid-cols-2 gap-2">
                    {tarifas.map(t => (
                      <button key={t.nombre} type="button"
                        onClick={() => { setMonto(String(t.monto)); setZona(t.nombre); }}
                        className={`px-3 py-2.5 rounded-xl border-2 text-left ${
                          zona === t.nombre ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}>
                        <span className="block text-sm font-bold text-gray-800">{t.nombre}</span>
                        <span className="block text-xs font-black text-emerald-700">{crc(t.monto)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-black text-gray-600 mb-1">
                  Monto a cobrar {tarifas.length > 0 && <span className="font-normal text-gray-400">(se puede cambiar)</span>}
                </label>
                <input type="number" min="0" inputMode="numeric" autoFocus value={monto}
                  onChange={e => setMonto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') aplicar(); }}
                  placeholder="0"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-right text-xl font-black" />
              </div>

              {repartidores.length > 0 && (
                <div>
                  <p className="text-xs font-black text-gray-600 mb-1.5">¿Quién lo lleva?</p>
                  <div className="flex flex-wrap gap-2">
                    {repartidores.map(r => (
                      <button key={r} type="button" onClick={() => setQuien(quien === r ? '' : r)}
                        className={`px-3 py-2 rounded-xl border-2 text-sm font-bold ${
                          quien === r ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-gray-200 text-gray-600'}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 p-4 flex gap-2">
              {valor && (
                <button type="button" onClick={() => { onCambio(null); setAbierto(false); }}
                  className="px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-bold text-sm">
                  Quitar
                </button>
              )}
              <button type="button" onClick={aplicar} disabled={!(Number(monto) > 0)}
                className="flex-1 py-3 rounded-xl bg-emerald-600 disabled:bg-gray-200 text-white font-black flex items-center justify-center gap-2">
                <Check size={16} /> Cobrar {Number(monto) > 0 ? crc(Number(monto)) : 'domicilio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RepartoControl;
