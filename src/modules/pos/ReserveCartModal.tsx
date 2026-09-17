import React, { useState } from 'react';
import { useTenantId } from '@/hooks/useTenant';
import { imprimirApartado } from '@/modules/reservations/printReservation';
import { X, Loader2, Package, Calendar } from 'lucide-react';
import { reservationsService } from '@/services/reservations/reservationsService';

const money = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;

/** Vencimiento por defecto: 15 días. Un apartado sin fecha no vuelve a la venta nunca. */
function en15Dias(): string {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Apartar el carrito: el cliente separa la mercadería y abona una parte.
 *
 * Hasta la entrega NO hay venta: no se factura ni entra al cierre como venta.
 * Lo que sí pasa desde ya es que la mercadería queda apartada —sale de lo
 * vendible— y que el abono entra a la caja.
 */
export const ReserveCartModal: React.FC<{
  items: Array<{ product_id?: string | null; product_name: string; quantity: number; unit_price: number }>;
  /** Total con IVA, tal como se va a cobrar al retirarlo. */
  total: number;
  clienteSugerido?: string;
  customerId?: string | null;
  cashSessionId?: string | null;
  onClose: () => void;
  onCreado: (r: { number: string | null; total: number; saldo: number; aviso?: string }) => void;
}> = ({ items, total, clienteSugerido, customerId, cashSessionId, onClose, onCreado }) => {
  const { tenantId } = useTenantId();
  const [nombre, setNombre] = useState(clienteSugerido ?? '');
  const [telefono, setTelefono] = useState('');
  const [vence, setVence] = useState(en15Dias());
  const [abono, setAbono] = useState('');
  const [metodo, setMetodo] = useState('cash');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const abonoNum = Math.round((Number(String(abono).replace(/[^\d.]/g, '')) || 0) * 100) / 100;
  const saldo = Math.max(0, Math.round((total - abonoNum) * 100) / 100);

  const guardar = async () => {
    // Sin nombre, el apartado no se le puede entregar a nadie: es lo único que
    // permite encontrarlo cuando el cliente vuelve al mostrador.
    if (!nombre.trim()) { setError('Poné el nombre del cliente.'); return; }
    if (abonoNum > total) { setError('El abono no puede ser mayor que el total.'); return; }
    setGuardando(true); setError('');
    try {
      const r = await reservationsService.create({
        customer_id: customerId ?? null,
        customer_name: nombre.trim(),
        customer_phone: telefono.trim() || null,
        expires_on: vence || null,
        notes: notas.trim() || null,
        items,
        deposit: abonoNum || undefined,
        deposit_method: metodo,
        cash_session_id: cashSessionId ?? null,
      });
      // El comprobante sale de una vez: el cliente está en el mostrador y es su
      // constancia de lo que apartó y de lo que abonó. Si la impresora falla, el
      // apartado ya quedó guardado y se reimprime desde Apartados.
      try {
        const completo = await reservationsService.get(r.id).catch(() => null);
        if (completo) await imprimirApartado(completo, tenantId ?? '');
      } catch (e) { console.warn('[apartado] no se pudo imprimir el comprobante:', e); }
      onCreado({
        number: r.number ?? null,
        total: Number(r.total ?? total),
        saldo: Math.max(0, Number(r.total ?? total) - Number(r.paid ?? abonoNum)),
        // El apartado quedó guardado, pero la mercadería puede NO estar
        // reservada: hay que decirlo o alguien la vende igual.
        aviso: r.inventario && r.inventario.ok === false ? r.inventario.motivo : undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el apartado');
    } finally { setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => !guardando && onClose()}>
      <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-black text-gray-900 flex items-center gap-2">
            <Package size={18} className="text-violet-600" /> Apartar {items.length} producto(s)
          </h3>
          <button onClick={onClose} disabled={guardando}
            className="text-gray-400 hover:text-gray-700 disabled:opacity-40"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3">
          <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-3 text-center">
            <p className="text-[11px] font-bold text-violet-700 uppercase">Total del apartado</p>
            <p className="text-2xl font-black text-violet-900">{money(total)}</p>
            <p className="text-[11px] font-semibold text-violet-700">impuesto incluido</p>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Cliente</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} autoFocus
              placeholder="Nombre de quien aparta"
              className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Teléfono</label>
              <input value={telefono} onChange={e => setTelefono(e.target.value)} inputMode="tel"
                placeholder="Para avisarle"
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                <Calendar size={11} className="inline mb-0.5" /> Vence
              </label>
              <input type="date" value={vence} onChange={e => setVence(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Abono</label>
              <input value={abono} onChange={e => setAbono(e.target.value)} inputMode="decimal" placeholder="0"
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm text-right font-bold" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Con qué paga</label>
              <select value={metodo} onChange={e => setMetodo(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm bg-white">
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
                <option value="sinpe">SINPE</option>
                <option value="transfer">Transferencia</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5">
            <span className="text-xs font-bold text-gray-500 uppercase">Queda debiendo</span>
            <span className="text-lg font-black text-gray-900">{money(saldo)}</span>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Nota</label>
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional"
              className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm" />
          </div>

          {error && <p className="text-sm font-bold text-red-600">{error}</p>}

          <p className="text-[11px] font-semibold text-gray-400">
            La mercadería queda apartada y deja de poder venderse. No se factura hasta que el
            cliente la retire{abonoNum > 0 ? '; el abono entra a la caja de una vez' : ''}.
          </p>

          <button onClick={() => void guardar()} disabled={guardando}
            className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black disabled:bg-gray-200 disabled:text-gray-400 flex items-center justify-center gap-2">
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
            {guardando ? 'Apartando…' : 'Apartar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReserveCartModal;
