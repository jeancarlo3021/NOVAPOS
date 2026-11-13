import React, { useMemo, useState } from 'react';
import { Bike, X, Check, Loader2 } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { apiFetch } from '@/lib/api';

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
  /**
   * La venta ya se sabe que sale de la casa (una cuenta del salón marcada
   * «para llevar»): el botón se destaca para que el domicilio no se olvide.
   * No se pone solo: el monto depende de la distancia y solo lo sabe quien
   * cobra, y una tarifa puesta por el sistema es una tarifa que nadie revisa.
   */
  destacado?: boolean;
}> = ({ valor, onCambio, destacado = false }) => {
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
  /** Preparando el artículo del domicilio (solo la primera vez del negocio). */
  const [resolviendo, setResolviendo] = useState(false);
  const [error, setError] = useState('');

  const crc = (n: number) => `₡${Math.round(n).toLocaleString('es-CR')}`;

  /**
   * CUALQUIER VENTA PUEDE SER A DOMICILIO, así que el botón está siempre.
   *
   * Antes el botón solo existía si alguien había entrado a Ajustes a elegir
   * «con qué artículo se cobra el domicilio». Eso es plomería del sistema —la
   * factura necesita una línea con artículo, y el cierre y el reporte
   * necesitan reconocerla—, no una decisión que el negocio tenga que tomar
   * antes de poder mandar un pedido en moto. Si no está, el servidor lo
   * resuelve en el momento (crea o adopta «Entrega a domicilio») y lo deja
   * guardado para el cierre y el reporte.
   */
  const aplicar = async () => {
    const m = Number(monto) || 0;
    if (m <= 0) return;
    let pid = productoId;
    if (!pid) {
      setResolviendo(true);
      try {
        const r = await apiFetch<{ producto_id: string }>('/reparto/articulo', { method: 'POST' });
        pid = String(r?.producto_id ?? '');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo preparar el cobro del domicilio');
        setResolviendo(false);
        return;
      }
      setResolviendo(false);
      if (!pid) { setError('No se pudo preparar el cobro del domicilio'); return; }
    }
    onCambio({ producto_id: pid, monto: m, zona: zona.trim() || null, repartidor: quien.trim() || null });
    setError('');
    setAbierto(false);
  };

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border-2 text-sm font-bold transition ${
          valor ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
          : destacado ? 'border-amber-400 bg-amber-50 text-amber-800 animate-pulse'
          : 'border-gray-200 bg-white text-gray-600 hover:border-emerald-300'}`}>
        <span className="flex items-center gap-2"><Bike size={15} /> A domicilio</span>
        {valor
          ? <span className="tabular-nums font-black">
              {crc(valor.monto)}{valor.zona ? ` · ${valor.zona}` : ''}{valor.repartidor ? ` · ${valor.repartidor}` : ''}
            </span>
          : <span className={`text-xs ${destacado ? 'font-black text-amber-700' : 'text-gray-400'}`}>
              {destacado ? 'es para llevar · ¿va a domicilio?' : 'poner la distancia'}
            </span>}
      </button>

      {abierto && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={() => setAbierto(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Bike size={18} className="text-emerald-600" />
              <div className="flex-1 min-w-0">
                <h3 className="font-black text-gray-900">Esta venta va a domicilio</h3>
                <p className="text-[11px] text-gray-400">Elegí la distancia; el transporte se suma a la factura</p>
              </div>
              <button onClick={() => setAbierto(false)} className="p-1.5 text-gray-400"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-4">
              {tarifas.length > 0 && (
                <div>
                  {/* «Distancia» y no «zona»: es lo que el cajero pregunta y lo
                      que de verdad mueve la tarifa. El nombre de la zona queda
                      anotado igual, que es lo que después explica el monto. */}
                  <p className="text-xs font-black text-gray-600 mb-1.5">¿A qué distancia va?</p>
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

              {tarifas.length === 0 && (
                <p className="text-[11px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                  Todavía no hay distancias guardadas. Escribí el monto del transporte;
                  en <b>Ajustes → Delivery</b> se pueden dejar las habituales
                  («Centro ₡1.000», «Carretera ₡2.500») para elegirlas de un toque.
                </p>
              )}

              <div>
                <label className="block text-xs font-black text-gray-600 mb-1">
                  Transporte a cobrar {tarifas.length > 0 && <span className="font-normal text-gray-400">(se puede cambiar)</span>}
                </label>
                <input type="number" min="0" inputMode="numeric" autoFocus value={monto}
                  onChange={e => setMonto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') aplicar(); }}
                  placeholder="0"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-right text-xl font-black" />
              </div>

              {/* Lo que el cajero tiene que tener claro antes de aplicar:
                  acá NO cambian los precios. El reparto propio cobra los
                  artículos a precio normal y le SUMA el transporte; los
                  precios delivery son de las plataformas (Uber, Didi), que es
                  otro modo del POS. Confundirlos le cambia el precio a toda la
                  venta por haber agregado un flete. */}
              <p className="text-[11px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                Los artículos se cobran a <b>precio normal</b>: esto solo suma el transporte.
                El precio delivery es para las plataformas.
              </p>

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

            {error && (
              <p className="mx-4 mb-2 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <div className="border-t border-gray-100 p-4 flex gap-2">
              {valor && (
                <button type="button" onClick={() => { onCambio(null); setAbierto(false); }}
                  className="px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-bold text-sm">
                  Quitar
                </button>
              )}
              <button type="button" onClick={() => void aplicar()}
                disabled={!(Number(monto) > 0) || resolviendo}
                className="flex-1 py-3 rounded-xl bg-emerald-600 disabled:bg-gray-200 text-white font-black flex items-center justify-center gap-2">
                {resolviendo ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {resolviendo ? 'Preparando…' : `Sumar ${Number(monto) > 0 ? crc(Number(monto)) : 'transporte'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RepartoControl;
