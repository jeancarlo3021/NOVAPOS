import React, { useEffect, useState } from 'react';
import { X, Loader2, Package, Search, Calendar, AlertTriangle } from 'lucide-react';
import { reservationsService, type Reservation } from '@/services/reservations/reservationsService';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;
const dia = (d?: string | null) =>
  d ? new Date(String(d) + (String(d).length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('es-CR') : '—';

/**
 * Apartados vigentes, para entregarlos desde la caja.
 *
 * El cliente vuelve al mostrador con el recibo de su apartado y hay que
 * encontrarlo rápido: por número, por nombre o por teléfono. Al elegirlo, sus
 * artículos entran al carrito y el cobro sigue el camino normal del punto de
 * venta.
 */
export const ReservationsPickerModal: React.FC<{
  onClose: () => void;
  onPick: (id: string) => void;
}> = ({ onClose, onPick }) => {
  const [rows, setRows] = useState<Reservation[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    reservationsService.list('open')
      .then(setRows)
      .catch(e => setError(e instanceof Error ? e.message : 'No se pudieron cargar los apartados'))
      .finally(() => setCargando(false));
  }, []);

  const texto = q.trim().toLowerCase();
  const visibles = !texto ? rows : rows.filter(r =>
    [r.number, r.customer_name, (r as any).customer_phone]
      .some(v => String(v ?? '').toLowerCase().includes(texto)));

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="font-black text-gray-900 flex items-center gap-2">
            <Package size={18} className="text-violet-600" /> Apartados vigentes
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q} onChange={e => setQ(e.target.value)} autoFocus
              placeholder="Número, cliente o teléfono"
              className="w-full pl-9 pr-3 py-2 border-2 border-gray-200 rounded-xl text-sm" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cargando && (
            <div className="py-10 text-center text-gray-400 flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Cargando…
            </div>
          )}
          {error && <p className="text-sm font-bold text-red-600 px-2">{error}</p>}
          {!cargando && !error && visibles.length === 0 && (
            <p className="py-10 text-center text-sm text-gray-400">
              {rows.length === 0 ? 'No hay apartados vigentes.' : 'Ningún apartado coincide con la búsqueda.'}
            </p>
          )}

          {visibles.map(r => {
            const saldo = Number(r.total ?? 0) - Number(r.paid ?? 0);
            // Vencido: la mercadería debería volver a la venta, así que conviene
            // que salte a la vista antes de entregarla sin más.
            const vencido = !!r.expires_on && String(r.expires_on) < hoy;
            return (
              <button key={r.id} onClick={() => onPick(r.id)}
                className={`w-full text-left rounded-xl border-2 px-3 py-2.5 transition ${
                  vencido
                    ? 'border-amber-200 bg-amber-50 hover:border-amber-400'
                    : 'border-gray-100 hover:border-violet-300 hover:bg-violet-50'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-gray-900 text-sm truncate">
                      {r.customer_name || 'Sin cliente'}
                    </p>
                    <p className="text-[11px] font-bold text-gray-400">
                      {r.number}
                      {r.expires_on && (
                        <span className={`ml-2 ${vencido ? 'text-amber-700' : ''}`}>
                          <Calendar size={10} className="inline mb-0.5" /> vence {dia(r.expires_on)}
                        </span>
                      )}
                    </p>
                    {vencido && (
                      <p className="text-[11px] font-black text-amber-700 flex items-center gap-1 mt-0.5">
                        <AlertTriangle size={11} /> Vencido
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-gray-900 text-sm">{fmt(saldo)}</p>
                    <p className="text-[10px] font-bold text-gray-400">
                      {Number(r.paid) > 0 ? `abonó ${fmt(Number(r.paid))}` : 'sin abono'}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <p className="px-5 py-2.5 border-t border-gray-100 text-[11px] font-semibold text-gray-400">
          El monto que se muestra es el SALDO: lo abonado ya se cobró antes.
        </p>
      </div>
    </div>
  );
};

export default ReservationsPickerModal;
