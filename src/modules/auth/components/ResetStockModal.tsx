'use client';

import React, { useEffect, useState } from 'react';
import { X, PackageX, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Props {
  owner: { id: string; name: string };
  onClose: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

interface Resumen {
  productos: number;
  con_existencias: number;
  unidades: number;
  bodegas: number;
  en_bodegas: number;
  movimientos: number;
  ajustes: number;
}

interface Resultado {
  negocio: string;
  productos: number;
  en_bodegas: number;
  historial_borrado: boolean;
  movimientos: number;
  ajustes: number;
}

/**
 * PONER LAS EXISTENCIAS EN 0, sin tocar los productos.
 *
 * Es lo que se necesita para una TOMA FÍSICA: el cliente va a contar lo que de
 * verdad tiene, y las cantidades que arrastra del sistema viejo —o de una
 * importación mal armada— no sirven de punto de partida. No es lo mismo que
 * «borrar todos los productos»: acá el catálogo queda intacto (nombre, precio,
 * costo, CABYS, categoría) y solo se va la cantidad.
 *
 * Se pide escribir el nombre del negocio, igual que para borrar el catálogo: es
 * irreversible y es sobre los datos de otra persona.
 */
export const ResetStockModal: React.FC<Props> = ({ owner, onClose, onToast }) => {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [confirmacion, setConfirmacion] = useState('');
  const [borrarHistorial, setBorrarHistorial] = useState(false);
  const [corriendo, setCorriendo] = useState(false);
  const [hecho, setHecho] = useState<Resultado | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void apiFetch<Resumen>(`/admin/tenants/${owner.id}/stock/summary`)
      .then(setResumen)
      .catch(e => setError(e instanceof Error ? e.message : 'No se pudieron contar las existencias'));
  }, [owner.id]);

  const nombreOk = confirmacion.trim().toLowerCase() === owner.name.trim().toLowerCase();

  const correr = async () => {
    setCorriendo(true); setError('');
    try {
      const r = await apiFetch<Resultado>(`/admin/tenants/${owner.id}/stock/reset`, {
        method: 'POST', body: JSON.stringify({ borrar_historial: borrarHistorial }),
      }, 120_000);
      setHecho(r);
      onToast(`Existencias en 0: ${miles(r.productos)} producto(s) de ${owner.name}`, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudieron poner en 0';
      setError(msg);
      onToast(msg, 'error');
    } finally { setCorriendo(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-amber-600 px-5 py-4 flex items-center justify-between">
          <h2 className="text-white font-black text-lg flex items-center gap-2">
            <PackageX size={18} /> Poner las existencias en 0
          </h2>
          <button onClick={onClose} disabled={corriendo} aria-label="Cerrar"
            className="w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="font-black text-gray-900">{owner.name}</p>
            {resumen === null && !error ? (
              <p className="text-sm text-gray-400 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Contando las existencias…
              </p>
            ) : resumen && (
              <p className="text-sm text-gray-600">
                <b>{miles(resumen.con_existencias)}</b> de {miles(resumen.productos)} producto(s) tienen
                existencias · <b>{miles(resumen.unidades)}</b> unidad(es) en total
                {resumen.en_bodegas > 0 && (
                  <span className="text-gray-400"> · {miles(resumen.en_bodegas)} fila(s) con stock en {resumen.bodegas} bodega(s)</span>
                )}
              </p>
            )}
          </div>

          {!hecho && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900 space-y-1.5">
                <p className="font-black flex items-center gap-1.5">
                  <AlertTriangle size={15} /> Qué pasa y qué no
                </p>
                <p><b>Se conserva</b> todo el catálogo: nombre, precio, costo, CABYS, categoría y unidad.</p>
                <p><b>Se pone en 0</b> la cantidad de cada producto, y también la de cada bodega.</p>
                <p>No se puede deshacer: después hay que cargar las cantidades con una toma física o un ajuste.</p>
              </div>

              {/* El historial NO se borra por omisión: es la trazabilidad de por
                  qué el stock llegó a donde estaba. */}
              {resumen && (resumen.movimientos > 0 || resumen.ajustes > 0) && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={borrarHistorial} disabled={corriendo}
                    onChange={e => setBorrarHistorial(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-amber-600" />
                  <span>
                    <span className="font-bold text-gray-800">
                      Borrar también el historial de movimientos y ajustes
                    </span>
                    <span className="block text-xs text-gray-500">
                      {miles(resumen.movimientos)} movimiento(s) y {miles(resumen.ajustes)} ajuste(s).
                      Si lo dejás sin marcar, el stock queda en 0 pero se conserva el registro de
                      cómo había llegado ahí.
                    </span>
                  </span>
                </label>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  Escribí el nombre del negocio para confirmar
                </label>
                <input type="text" value={confirmacion} onChange={e => setConfirmacion(e.target.value)}
                  placeholder={owner.name} disabled={corriendo}
                  className="w-full h-11 px-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-amber-500" />
              </div>

              {error && (
                <p className="text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={() => void correr()}
                  disabled={!nombreOk || corriendo || !resumen || resumen.con_existencias === 0}
                  title={resumen?.con_existencias === 0 ? 'Este negocio no tiene existencias que poner en 0' : undefined}
                  className="flex-1 h-11 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-sm
                             inline-flex items-center justify-center gap-2 disabled:bg-gray-200 disabled:text-gray-400">
                  {corriendo ? <Loader2 size={16} className="animate-spin" /> : <PackageX size={16} />}
                  {corriendo ? 'Poniendo en 0…' : 'Poner todo en 0'}
                </button>
                <button type="button" onClick={onClose} disabled={corriendo}
                  className="h-11 px-4 rounded-xl border-2 border-gray-200 font-bold text-sm text-gray-600 disabled:opacity-40">
                  Cancelar
                </button>
              </div>
            </>
          )}

          {hecho && (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800">
                <p className="font-black flex items-center gap-1.5">
                  <CheckCircle2 size={15} /> Listo
                </p>
                <p className="mt-1">
                  <b>{miles(hecho.productos)}</b> producto(s) quedaron en 0
                  {hecho.en_bodegas > 0 && <> · <b>{miles(hecho.en_bodegas)}</b> fila(s) de bodega</>}.
                </p>
                {hecho.historial_borrado && (
                  <p className="mt-1">
                    Historial borrado: {miles(hecho.movimientos)} movimiento(s) y {miles(hecho.ajustes)} ajuste(s).
                  </p>
                )}
                <p className="mt-1 text-xs text-emerald-700">
                  Queda anotado en la bitácora del negocio.
                </p>
              </div>
              <button type="button" onClick={onClose}
                className="w-full h-11 rounded-xl bg-gray-900 text-white font-black text-sm">
                Cerrar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/** Miles con punto: `toLocaleString('es-CR')` mete un espacio fino. */
const miles = (n: number) =>
  Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export default ResetStockModal;
