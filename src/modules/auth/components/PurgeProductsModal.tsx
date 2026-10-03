'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, Trash2, AlertTriangle, Loader2, CheckCircle2, EyeOff, StopCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Props {
  owner: { id: string; name: string };
  onClose: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

interface Tanda {
  total: number;
  borrados: number;
  ocultados: number;
  restantes: number;
  fallidos: Array<{ id: string; motivo: string }>;
  atascado?: boolean;
}

/** Tanda por llamada: suficiente para avanzar rápido sin agotar el tiempo. */
const POR_TANDA = 200;

/**
 * BORRAR TODO EL CATÁLOGO de un negocio, con avance a la vista.
 *
 * Es para cuando un catálogo entró mal: la importación equivocada, el archivo
 * del sistema viejo con los precios corridos, la demo que quedó con productos de
 * prueba. A mano es imposible —hay negocios con más de cinco mil productos— y de
 * un solo golpe la petición se corta por tiempo a la mitad, dejando el catálogo
 * peor que antes: medio borrado y sin saber dónde quedó.
 *
 * Va por tandas y muestra cuánto falta, así que se puede ver que avanza y
 * DETENERLO a mitad de camino: lo borrado queda borrado y lo demás intacto.
 */
export const PurgeProductsModal: React.FC<Props> = ({ owner, onClose, onToast }) => {
  const [conteo, setConteo] = useState<{ activos: number; ocultos: number } | null>(null);
  const [confirmacion, setConfirmacion] = useState('');
  const [corriendo, setCorriendo] = useState(false);
  const [terminado, setTerminado] = useState(false);
  const [error, setError] = useState('');
  const [acumulado, setAcumulado] = useState({ borrados: 0, ocultados: 0, fallidos: 0 });
  const [restantes, setRestantes] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  /** Para poder parar: el bucle lo consulta entre tandas. */
  const detener = useRef(false);

  useEffect(() => {
    void apiFetch<{ activos: number; ocultos: number }>(`/admin/tenants/${owner.id}/products/count`)
      .then(r => { setConteo(r); setTotal(r.activos); setRestantes(r.activos); })
      .catch(e => setError(e instanceof Error ? e.message : 'No se pudo contar los productos'));
  }, [owner.id]);

  // Si se cierra la ventana a mitad, el bucle tiene que parar igual.
  useEffect(() => () => { detener.current = true; }, []);

  const correr = async () => {
    setCorriendo(true); setError(''); detener.current = false;
    let seguro = 0;   // tope duro: nunca un bucle infinito contra el servidor
    try {
      for (;;) {
        if (detener.current) break;
        if (++seguro > 500) { setError('Se detuvo por seguridad después de 500 tandas.'); break; }

        const r = await apiFetch<Tanda>(`/admin/tenants/${owner.id}/products/purge`, {
          method: 'POST', body: JSON.stringify({ limit: POR_TANDA }),
        }, 60_000);

        setAcumulado(prev => ({
          borrados: prev.borrados + (r.borrados ?? 0),
          ocultados: prev.ocultados + (r.ocultados ?? 0),
          fallidos: prev.fallidos + (r.fallidos?.length ?? 0),
        }));
        setRestantes(r.restantes ?? 0);
        if (total === 0 && r.total) setTotal(r.total);

        if (r.atascado) {
          setError(
            `Quedan ${r.restantes} productos que no se pudieron borrar ni ocultar. `
            + (r.fallidos?.[0]?.motivo ? `Motivo: ${r.fallidos[0].motivo}` : ''));
          break;
        }
        if ((r.restantes ?? 0) <= 0) break;
      }
      setTerminado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falló a mitad del borrado');
    } finally {
      setCorriendo(false);
    }
  };

  const nombreOk = confirmacion.trim().toLowerCase() === owner.name.trim().toLowerCase();
  const hechos = acumulado.borrados + acumulado.ocultados;
  const pct = total > 0 ? Math.min(100, Math.round((hechos / total) * 100)) : 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-red-600 px-5 py-4 flex items-center justify-between">
          <h2 className="text-white font-black text-lg flex items-center gap-2">
            <Trash2 size={18} /> Borrar todos los productos
          </h2>
          <button onClick={onClose} disabled={corriendo}
            className="w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="font-black text-gray-900">{owner.name}</p>
            {conteo === null ? (
              <p className="text-sm text-gray-400 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Contando…
              </p>
            ) : (
              <p className="text-sm text-gray-600">
                <b>{conteo.activos.toLocaleString('es-CR')}</b> producto(s) en el catálogo
                {conteo.ocultos > 0 && (
                  <span className="text-gray-400"> · {conteo.ocultos.toLocaleString('es-CR')} ya oculto(s)</span>
                )}
              </p>
            )}
          </div>

          {!corriendo && !terminado && (
            <>
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 space-y-1.5">
                <p className="font-black flex items-center gap-2"><AlertTriangle size={15} /> Esto no se puede deshacer</p>
                <p>
                  Se borra <b>todo el catálogo</b> de este negocio. Los productos que
                  tengan <b>ventas o compras</b> no se borran de verdad: se <b>ocultan</b>, porque
                  si no, las facturas ya emitidas dejarían de cuadrar.
                </p>
                <p className="text-[12px]">
                  El inventario, los precios y los códigos se van con ellos. Las ventas ya hechas
                  no se tocan.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  Escribí el nombre del negocio para confirmar
                </label>
                <input value={confirmacion} onChange={e => setConfirmacion(e.target.value)}
                  placeholder={owner.name}
                  className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm font-bold focus:outline-none focus:border-red-400" />
              </div>
            </>
          )}

          {(corriendo || terminado) && (
            <div className="space-y-2">
              <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${terminado && !error ? 'bg-emerald-500' : 'bg-red-500'}`}
                  style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs font-bold text-gray-600">
                <span>
                  {hechos.toLocaleString('es-CR')} de {total.toLocaleString('es-CR')} ({pct}%)
                </span>
                {restantes != null && <span>{restantes.toLocaleString('es-CR')} por hacer</span>}
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                {[
                  ['Borrados', acumulado.borrados, 'text-gray-900'],
                  ['Ocultados', acumulado.ocultados, 'text-amber-600'],
                  ['Con error', acumulado.fallidos, acumulado.fallidos > 0 ? 'text-red-600' : 'text-gray-400'],
                ].map(([t, v, color]) => (
                  <div key={String(t)} className="bg-gray-50 rounded-xl px-3 py-2">
                    <p className="text-[10px] font-bold text-gray-500 uppercase">{t}</p>
                    <p className={`text-base font-black ${color}`}>{Number(v).toLocaleString('es-CR')}</p>
                  </div>
                ))}
              </div>
              {acumulado.ocultados > 0 && (
                <p className="text-[11px] text-gray-500 flex items-start gap-1.5">
                  <EyeOff size={12} className="mt-0.5 shrink-0" />
                  Los ocultados tienen ventas o compras: ya no aparecen en el inventario ni en el
                  punto de venta, pero el historial sigue completo.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {terminado && !error && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm font-semibold text-emerald-800 flex items-center gap-2">
              <CheckCircle2 size={16} />
              {restantes === 0
                ? 'Catálogo vacío. El negocio puede volver a importar sus productos.'
                : `Se detuvo con ${restantes?.toLocaleString('es-CR')} producto(s) sin tocar.`}
            </div>
          )}
        </div>

        <div className="bg-gray-50 border-t border-gray-200 px-5 py-3 flex items-center gap-2">
          {corriendo ? (
            <>
              <button onClick={() => { detener.current = true; }}
                className="flex-1 h-11 rounded-xl border-2 border-gray-200 bg-white text-gray-700 font-bold text-sm flex items-center justify-center gap-2">
                <StopCircle size={15} /> Detener
              </button>
              <span className="text-xs font-bold text-gray-500 flex items-center gap-1.5">
                <Loader2 size={14} className="animate-spin" /> Borrando…
              </span>
            </>
          ) : terminado ? (
            <button onClick={() => { onToast(
              `${owner.name}: ${acumulado.borrados} borrados, ${acumulado.ocultados} ocultados`,
              error ? 'error' : 'success'); onClose(); }}
              className="w-full h-11 rounded-xl bg-gray-900 text-white font-black text-sm">
              Cerrar
            </button>
          ) : (
            <>
              <button onClick={onClose}
                className="flex-1 h-11 rounded-xl border-2 border-gray-200 bg-white text-gray-600 font-bold text-sm">
                Cancelar
              </button>
              <button onClick={() => void correr()}
                disabled={!nombreOk || (conteo?.activos ?? 0) === 0}
                title={!nombreOk ? 'Escribí el nombre del negocio' : undefined}
                className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-sm flex items-center justify-center gap-2">
                <Trash2 size={15} /> Borrar {(conteo?.activos ?? 0).toLocaleString('es-CR')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PurgeProductsModal;
