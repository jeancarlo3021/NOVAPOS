import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bookmark, Plus, Loader2, AlertCircle, CheckCircle2, Home, Search, Trash2,
  HandCoins, PackageCheck, CalendarClock,
} from 'lucide-react';
import { reservationsService, type Reservation } from '@/services/reservations/reservationsService';
import { NewReservationModal } from './NewReservationModal';

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const day = (d?: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('es-CR') : '—');

type Tab = 'open' | 'delivered' | 'cancelled' | 'expired';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'open', label: 'Vigentes' },
  { id: 'delivered', label: 'Entregados' },
  { id: 'expired', label: 'Vencidos' },
  { id: 'cancelled', label: 'Anulados' },
];

/**
 * APARTADOS.
 *
 * El cliente separa mercadería, abona de a poco y la retira cuando termina de
 * pagar. Mientras tanto la mercadería NO está a la venta —sale del inventario al
 * apartarse— pero tampoco está vendida: no hay factura hasta que se entrega.
 */
export const ReservationsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('open');
  const [rows, setRows] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [nuevo, setNuevo] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try { setRows((await reservationsService.list(tab)) ?? []); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudieron cargar' }); }
    finally { setLoading(false); }
  }, [tab]);
  useEffect(() => { void cargar(); }, [cargar]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(r =>
      (r.number ?? '').toLowerCase().includes(t)
      || (r.customer_name ?? '').toLowerCase().includes(t)
      || (r.customer_phone ?? '').includes(t));
  }, [rows, q]);

  const abonar = async (r: Reservation) => {
    const saldo = Number(r.total) - Number(r.paid);
    const raw = window.prompt(
      `Abono para ${r.number}\n\nTotal: ${money(r.total)}\nAbonado: ${money(r.paid)}\nSaldo: ${money(saldo)}\n\n¿Cuánto abona?`,
      String(Math.round(saldo)),
    );
    if (raw === null) return;
    const monto = Number(String(raw).replace(/[^\d.]/g, ''));
    if (!(monto > 0)) return;
    setBusy(r.id);
    try {
      await reservationsService.addPayment(r.id, monto);
      setMsg({ ok: true, text: `Abono de ${money(monto)} registrado en ${r.number}` });
      await cargar();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo registrar el abono' });
    } finally { setBusy(null); }
  };

  const anular = async (r: Reservation) => {
    const motivo = window.prompt(
      `¿Anular el apartado ${r.number}?\n\n`
      + 'La mercadería vuelve al inventario disponible.\n'
      + (Number(r.paid) > 0
        ? `OJO: el cliente tiene ${money(r.paid)} abonados. Anular NO devuelve esa plata: `
          + 'lo que se hace con ella lo decide el negocio.\n\n'
        : '\n')
      + 'Motivo (opcional):',
      '',
    );
    if (motivo === null) return;
    setBusy(r.id);
    try {
      const res = await reservationsService.cancel(r.id, motivo || undefined);
      setMsg({
        ok: true,
        text: Number(res.refund_pending) > 0
          ? `Apartado anulado. Quedan ${money(res.refund_pending)} abonados por resolver con el cliente.`
          : 'Apartado anulado y mercadería devuelta al inventario.',
      });
      await cargar();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo anular' });
    } finally { setBusy(null); }
  };

  /** Entregar = cobrar el saldo en el POS. La factura sale por el camino normal. */
  const entregar = (r: Reservation) => navigate(`/pos?reservation=${r.id}`);

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => navigate('/dashboard')} title="Inicio"
          className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50"><Home size={16} /></button>
        <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
          <Bookmark size={20} className="text-violet-600" /> Apartados
        </h1>
        <button onClick={() => setNuevo(true)}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-black">
          <Plus size={16} /> Nuevo apartado
        </button>
      </div>

      {msg && (
        <div className={`rounded-xl px-4 py-2.5 text-sm font-bold flex items-center gap-2 ${
          msg.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                 : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {msg.text}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black ${
                tab === t.id ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por número, cliente o teléfono…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-violet-400" />
        </div>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm font-bold text-gray-400 py-10 justify-center">
          <Loader2 size={16} className="animate-spin" /> Cargando…
        </p>
      ) : filtrados.length === 0 ? (
        <p className="text-center text-gray-400 py-14 text-sm font-bold">
          {tab === 'open' ? 'No hay apartados vigentes.' : 'Nada por acá.'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtrados.map(r => {
            const saldo = Number(r.total) - Number(r.paid);
            const vencido = r.status === 'expired';
            return (
              <div key={r.id} className={`bg-white border-2 rounded-2xl p-4 ${
                vencido ? 'border-amber-200' : 'border-gray-200'}`}>
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-gray-900">
                      {r.number} · {r.customer_name || 'Sin cliente'}
                      {r.customer_phone && <span className="font-bold text-gray-400 text-sm"> · {r.customer_phone}</span>}
                    </p>
                    <p className="text-xs font-bold text-gray-500 flex items-center gap-1.5 mt-0.5">
                      <CalendarClock size={12} />
                      {r.expires_on ? `Vence ${day(r.expires_on)}` : 'Sin fecha de vencimiento'}
                      <span className="text-gray-300">·</span>
                      {(r.reservation_items ?? []).length} artículo(s)
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-gray-900 tabular-nums">{money(r.total)}</p>
                    <p className="text-xs font-bold text-gray-500 tabular-nums">
                      Abonado {money(r.paid)}
                      {saldo > 0 && <span className="text-violet-700"> · Falta {money(saldo)}</span>}
                    </p>
                  </div>
                </div>

                {/* Cuánto lleva pagado, de un vistazo. */}
                {Number(r.total) > 0 && (
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (Number(r.paid) / Number(r.total)) * 100)}%` }} />
                  </div>
                )}

                {(r.reservation_items ?? []).length > 0 && (
                  <p className="mt-2 text-[11px] font-semibold text-gray-500 truncate">
                    {(r.reservation_items ?? []).map(it => `${it.quantity}× ${it.product_name}`).join(' · ')}
                  </p>
                )}

                {r.status === 'open' && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <button onClick={() => void abonar(r)} disabled={busy === r.id}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-violet-200 text-violet-700 text-sm font-black hover:bg-violet-50">
                      <HandCoins size={15} /> Abonar
                    </button>
                    <button onClick={() => entregar(r)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black">
                      <PackageCheck size={15} /> Entregar y cobrar
                    </button>
                    <button onClick={() => void anular(r)} disabled={busy === r.id}
                      className="ml-auto p-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50">
                      {busy === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                )}

                {vencido && (
                  <p className="mt-2 text-[11px] font-black text-amber-700">
                    Venció y la mercadería volvió al inventario.
                    {Number(r.paid) > 0 && ` El cliente tiene ${money(r.paid)} abonados.`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {nuevo && (
        <NewReservationModal
          onClose={() => setNuevo(false)}
          onCreated={(text) => { setNuevo(false); setMsg({ ok: true, text }); void cargar(); }}
        />
      )}
    </div>
  );
};

export default ReservationsDashboard;
