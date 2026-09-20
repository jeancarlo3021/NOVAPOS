import React, { useState } from 'react';
import { X, HandCoins, Loader2, Printer } from 'lucide-react';
import { reservationsService, type Reservation } from '@/services/reservations/reservationsService';
import { ETIQUETA_MEDIO_PAGO } from '@/utils/mediosDePago';

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;

/** Medios con los que se recibe un abono en el mostrador. */
const MEDIOS = ['cash', 'card', 'sinpe', 'transfer', 'check', 'digital', 'other'] as const;

/**
 * Cobrar un abono de un apartado.
 *
 * Antes se pedía solo el monto con una ventanita del navegador y el abono se
 * guardaba SIEMPRE como efectivo y sin caja: el cierre no lo veía y, si el
 * cliente pagaba con tarjeta o SINPE, el arqueo quedaba con un sobrante en
 * efectivo igual a lo abonado.
 */
export const AbonoModal: React.FC<{
  reserva: Reservation;
  cashSessionId?: string | null;
  onClose: () => void;
  onListo: (msg: string, imprimir: boolean) => void;
}> = ({ reserva, cashSessionId, onClose, onListo }) => {
  const saldo = Math.max(0, Number(reserva.total) - Number(reserva.paid));
  const [monto, setMonto] = useState(String(Math.round(saldo)));
  const [metodo, setMetodo] = useState<string>('cash');
  const [nota, setNota] = useState('');
  const [imprimir, setImprimir] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cantidad = Math.round((Number(String(monto).replace(/[^\d.]/g, '')) || 0) * 100) / 100;

  const guardar = async () => {
    if (!(cantidad > 0)) { setError('Poné cuánto abona.'); return; }
    if (cantidad > saldo) { setError(`El abono no puede superar el saldo (${money(saldo)}).`); return; }
    setGuardando(true); setError('');
    try {
      await reservationsService.addPayment(reserva.id, cantidad, metodo, cashSessionId ?? null, nota.trim() || undefined);
      const queda = saldo - cantidad;
      onListo(
        `Abono de ${money(cantidad)} en ${ETIQUETA_MEDIO_PAGO[metodo] ?? metodo} registrado`
        + ` · ${queda > 0 ? `queda ${money(queda)}` : 'apartado pagado del todo'}`,
        imprimir,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el abono');
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="font-black text-gray-900 flex items-center gap-2">
            <HandCoins size={18} className="text-violet-600" /> Abono · {reserva.number}
          </span>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[['Total', reserva.total], ['Abonado', reserva.paid], ['Saldo', saldo]].map(([t, v]) => (
              <div key={String(t)} className="rounded-xl bg-gray-50 border border-gray-100 py-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase">{t}</p>
                <p className="text-sm font-black text-gray-900">{money(Number(v))}</p>
              </div>
            ))}
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{error}</div>}

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">¿Cuánto abona? *</label>
            <input type="number" inputMode="decimal" value={monto} autoFocus
              onChange={e => setMonto(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 text-lg font-black text-right focus:outline-none focus:border-violet-400" />
            <div className="flex gap-1.5 mt-1.5">
              {[0.25, 0.5, 1].map(f => (
                <button key={f} type="button" onClick={() => setMonto(String(Math.round(saldo * f)))}
                  className="flex-1 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-[11px] font-bold text-gray-600">
                  {f === 1 ? 'Todo el saldo' : `${f * 100}%`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">¿Con qué paga? *</label>
            <div className="grid grid-cols-3 gap-1.5">
              {MEDIOS.map(m => (
                <button key={m} type="button" onClick={() => setMetodo(m)}
                  className={`py-2 rounded-lg text-[11px] font-bold ${
                    metodo === m ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {ETIQUETA_MEDIO_PAGO[m] ?? m}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              Queda ligado a la caja abierta y sale en el cierre con su medio de pago.
            </p>
          </div>

          <input value={nota} onChange={e => setNota(e.target.value.slice(0, 120))}
            placeholder="Nota (opcional) — ej. número de SINPE"
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />

          <label className="flex items-center gap-2 text-xs font-bold text-gray-700">
            <input type="checkbox" checked={imprimir} onChange={e => setImprimir(e.target.checked)}
              className="w-4 h-4 rounded text-violet-600" />
            <Printer size={13} className="text-gray-400" /> Imprimir el comprobante actualizado
          </label>
        </div>

        <div className="flex gap-2 p-4 border-t border-gray-100">
          <button onClick={onClose} disabled={guardando}
            className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm">Cancelar</button>
          <button onClick={() => void guardar()} disabled={guardando}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-black text-sm flex items-center justify-center gap-2">
            {guardando ? <Loader2 size={15} className="animate-spin" /> : <HandCoins size={15} />}
            {guardando ? 'Guardando…' : 'Registrar abono'}
          </button>
        </div>
      </div>
    </div>
  );
};
