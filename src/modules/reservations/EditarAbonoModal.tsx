import React, { useState } from 'react';
import { X, Loader2, Trash2, HandCoins } from 'lucide-react';
import { reservationsService, type ReservationPayment } from '@/services/reservations/reservationsService';
import { ETIQUETA_MEDIO_PAGO } from '@/utils/mediosDePago';

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const MEDIOS = ['cash', 'card', 'sinpe', 'transfer', 'check', 'digital', 'other'] as const;

/**
 * Corregir un abono ya cobrado.
 *
 * Los abonos viejos quedaron todos como «efectivo» porque el sistema no
 * preguntaba con qué se pagaba: el total del día está bien, pero el cierre y el
 * reporte por método muestran la plata en la columna equivocada.
 *
 * El MONTO no se edita a propósito: cambiarlo movería el saldo del apartado y lo
 * ya cobrado. Si está mal, se borra el abono y se vuelve a registrar.
 */
export const EditarAbonoModal: React.FC<{
  abono: ReservationPayment;
  /** Caja abierta ahora, para poder ligarle un abono que quedó suelto. */
  cajaAbierta?: string | null;
  tieneCaja: boolean;
  onClose: () => void;
  onListo: (msg: string) => void;
}> = ({ abono, cajaAbierta, tieneCaja, onClose, onListo }) => {
  const [metodo, setMetodo] = useState(String(abono.method ?? 'cash'));
  const [nota, setNota] = useState(String(abono.notes ?? ''));
  const [ligar, setLigar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    setGuardando(true); setError('');
    try {
      await reservationsService.updatePayment(abono.id, {
        method: metodo,
        notes: nota.trim() || null,
        ...(ligar && cajaAbierta ? { cash_session_id: cajaAbierta } : {}),
      });
      onListo(`Abono de ${money(abono.amount)} corregido a ${ETIQUETA_MEDIO_PAGO[metodo] ?? metodo}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo corregir');
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!confirm(`¿Borrar el abono de ${money(abono.amount)}?\n\n`
      + 'Se recalcula lo abonado del apartado y el saldo vuelve a subir. '
      + 'Esa plata deja de contar en las ventas y en el cierre de ese día.')) return;
    setGuardando(true); setError('');
    try {
      await reservationsService.deletePayment(abono.id);
      onListo(`Abono de ${money(abono.amount)} borrado`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar');
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="font-black text-gray-900 flex items-center gap-2">
            <HandCoins size={17} className="text-violet-600" /> Corregir abono
          </span>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-center text-2xl font-black text-gray-900">{money(abono.amount)}</p>
          <p className="text-center text-[11px] text-gray-400">
            {new Date(abono.created_at).toLocaleString('es-CR')}
            {abono.notes ? ` · ${abono.notes}` : ''}
          </p>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{error}</div>}

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">¿Con qué se pagó?</label>
            <div className="grid grid-cols-3 gap-1.5">
              {MEDIOS.map(m => (
                <button key={m} type="button" onClick={() => setMetodo(m)}
                  className={`py-2 rounded-lg text-[11px] font-bold ${
                    metodo === m ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {ETIQUETA_MEDIO_PAGO[m] ?? m}
                </button>
              ))}
            </div>
          </div>

          <input value={nota} onChange={e => setNota(e.target.value.slice(0, 120))}
            placeholder="Nota (opcional)"
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />

          {/* Abono suelto: el cierre igual lo toma por el horario del turno, pero
              ligarlo a la caja abierta deja el dato firme. */}
          {!tieneCaja && cajaAbierta && (
            <label className="flex items-start gap-2 text-xs font-bold text-gray-700">
              <input type="checkbox" checked={ligar} onChange={e => setLigar(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded text-violet-600" />
              <span>
                Ligarlo a la caja abierta ahora
                <span className="block text-[10px] font-semibold text-gray-400">
                  Solo si este abono se recibió en el turno de hoy.
                </span>
              </span>
            </label>
          )}
          {!tieneCaja && !cajaAbierta && (
            <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              Este abono no quedó ligado a ninguna caja. Igual aparece en el cierre del turno
              en cuyo horario se recibió.
            </p>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-gray-100">
          <button onClick={() => void borrar()} disabled={guardando}
            className="px-3 py-2.5 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 font-bold text-sm disabled:opacity-40">
            <Trash2 size={15} />
          </button>
          <button onClick={onClose} disabled={guardando}
            className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm">Cancelar</button>
          <button onClick={() => void guardar()} disabled={guardando}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-black text-sm flex items-center justify-center gap-2">
            {guardando && <Loader2 size={15} className="animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};
