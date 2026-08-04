import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Inbox, Loader2, CreditCard, Ban, RotateCcw, Clock, User, AlertCircle, CheckCircle2,
  LockKeyhole, Unlock, ArrowDownCircle, ArrowUpCircle, RefreshCw, Home, Receipt,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTenantId } from '@/hooks/useTenant';
import { useCashSession } from '@/hooks/useCashSession';
import { useSettings } from '@/hooks/useSettings';
import { CashOpenModal } from '@/modules/pos/cashManagement/CashOpenModal';
import { CashCloseModal } from '@/modules/pos/cashManagement/CashCloseModal';
import { CashMovementModal } from '@/modules/pos/cashManagement/CashMovementModal';
import { PaymentConfirmationModal, type PaymentData } from '@/modules/pos/cashManagement/PaymentConfirmationModal';
import { invoicesService } from '@/services/invoice/invoiceService';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { agentOrdersService, type AgentOrder } from '@/services/agents/salesAgentsService';
import { PosShortcutsHint } from '@/modules/pos/PosShortcutsHint';
import type { CartItem } from '@/types/Types_POS';

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const hhmm = (s?: string | null) =>
  s ? new Date(s).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }) : '';
const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;

/**
 * CAJA — vista de espera del cajero.
 *
 * Muestra los pedidos que mandaron los agentes y los cobra SIN salir de acá, con
 * el mismo modal de cobro del POS. Incluye la gestión de caja completa: apertura,
 * cierre y movimientos de entrada/salida.
 *
 * El cajero no arma ventas: eso lo hace el agente. Acá solo se cobra lo que llegó.
 */
export const CashierDesk: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tenantId } = useTenantId();
  const { currentSession, refetchSession } = useCashSession();
  const { settings } = useSettings('general');

  const [orders, setOrders] = useState<AgentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [movement, setMovement] = useState<'in' | 'out' | null>(null);
  /** Pedido que se está cobrando (abre el modal de pago). */
  const [charging, setCharging] = useState<AgentOrder | null>(null);
  const [paying, setPaying] = useState(false);

  const taxEnabled = (settings as any)?.taxEnabled !== false;
  const taxRate = Number((settings as any)?.taxRate ?? 0.13);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pending, taken] = await Promise.all([
        agentOrdersService.list('pending'),
        agentOrdersService.list('taken'),
      ]);
      setOrders([...taken, ...pending]);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo cargar la bandeja' });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Los pedidos llegan de OTRO dispositivo: sin refresco el cajero no se entera.
  useEffect(() => {
    const iv = setInterval(() => void load(), 15_000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.kind === 'ok' ? 3500 : 6000);
    return () => clearTimeout(t);
  }, [msg]);

  /** Los precios del pedido vienen CON IVA incluido (igual que en el POS). */
  const breakdown = (total: number) => {
    if (!taxEnabled) return { subtotal: round2(total), tax: 0 };
    const sub = round2(total / (1 + taxRate));
    return { subtotal: sub, tax: round2(total - sub) };
  };

  const startCharge = async (o: AgentOrder) => {
    if (!currentSession || currentSession.status !== 'open') {
      setMsg({ kind: 'err', text: 'Abrí la caja antes de cobrar.' });
      return;
    }
    setBusyId(o.id); setMsg(null);
    try {
      // Reservar el pedido: si otro cajero se adelantó, el backend responde 409.
      const order = o.status === 'taken' ? o : await agentOrdersService.take(o.id);
      setCharging(order);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo tomar el pedido' });
      void load();
    } finally { setBusyId(null); }
  };

  const confirmPayment = async (data: PaymentData) => {
    if (!charging || !tenantId || !currentSession) return;
    setPaying(true);
    try {
      const total = round2(charging.total);
      const { subtotal, tax } = breakdown(total);
      // Se arman CartItem para reusar el servicio de facturación tal cual.
      const cart: CartItem[] = charging.items.map(it => ({
        product_id: it.product_id ?? '',
        product: { id: it.product_id ?? '', name: it.product_name, unit_price: it.unit_price } as any,
        quantity: it.quantity,
        unit_price: it.unit_price,
        subtotal: it.subtotal,
        notes: it.notes ?? undefined,
      })) as CartItem[];

      const invoice = await invoicesService.createInvoice(
        tenantId, currentSession.id, cart,
        subtotal, 0, 0, tax, total,
        data.paymentMethod,
        charging.customer_name ?? undefined,
        [charging.number, charging.agent_name && `Agente: ${charging.agent_name}`, charging.notes]
          .filter(Boolean).join(' · ') || undefined,
        charging.customer_phone ?? undefined,
        data.amountReceived, data.change, data.voucherNumber,
        undefined, null, null,
        data.payments ?? null,
        // El comprobante que pidió el CLIENTE, elegido por el agente.
        (charging.document_type ?? 'ticket') as any,
        charging.customer_id ?? null,
      );

      // Marcar el pedido cobrado y acreditar la comisión del agente.
      await agentOrdersService.charge(charging.id, invoice?.id ?? null, total);

      // Ticket (no bloquea el cobro si la impresora falla).
      if (!data.skipPrint) {
        const now = new Date();
        posPrinterService.printAuto({
          invoiceNumber: invoice?.invoice_number ?? charging.number ?? '',
          date: now.toLocaleDateString('es-CR'),
          time: now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
          items: charging.items.map(it => ({
            name: it.product_name, quantity: it.quantity,
            unitPrice: it.unit_price, subtotal: it.subtotal, notes: it.notes ?? undefined,
          })),
          subtotal, tax, total,
          paymentMethod: data.paymentMethod,
          customerName: charging.customer_name ?? undefined,
          cashierName: user?.email,
        } as any, tenantId).catch(() => {});
      }

      setCharging(null);
      setMsg({ kind: 'ok', text: `Pedido ${charging.number ?? ''} cobrado — factura ${invoice?.invoice_number ?? ''}` });
      await load();
      await refetchSession();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo cobrar' });
    } finally { setPaying(false); }
  };

  const release = async (o: AgentOrder) => {
    setBusyId(o.id);
    try { await agentOrdersService.release(o.id); await load(); }
    catch (e) { setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo liberar' }); }
    finally { setBusyId(null); }
  };

  const cancel = async (o: AgentOrder) => {
    if (!window.confirm(`¿Anular el pedido ${o.number ?? ''}?`)) return;
    setBusyId(o.id);
    try { await agentOrdersService.cancel(o.id); await load(); }
    catch (e) { setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo anular' }); }
    finally { setBusyId(null); }
  };

  // Atajos equivalentes a los del POS. F12 cobra el primer pedido en espera, que
  // es lo que hace el cajero todo el día.
  const sessionOpen = currentSession?.status === 'open';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'F12') {
        e.preventDefault();
        const next = orders.find(o => o.status === 'taken') ?? orders.find(o => o.status === 'pending');
        if (next && sessionOpen && !charging) void startCharge(next);
      } else if (e.key === 'F5') {
        e.preventDefault();
        void load();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const pendingCount = orders.filter(o => o.status === 'pending').length;

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6 space-y-4 overflow-y-auto">
      <PosShortcutsHint shortcuts={[
        { keys: 'F12', label: 'Cobrar el siguiente pedido' },
        { keys: 'F5',  label: 'Actualizar la bandeja' },
        { keys: 'F1',  label: 'En cobro: cobrar e imprimir' },
        { keys: 'F2',  label: 'En cobro: cobrar sin imprimir' },
        { keys: 'Esc', label: 'Cerrar el cobro' },
      ]} />
      {/* Barra de caja */}
      <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-2 flex-wrap">
        <button onClick={() => navigate('/')} title="Volver al menú"
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 shrink-0">
          <Home size={18} className="text-gray-500" />
        </button>
        <span className="flex items-center gap-2 text-lg font-black text-gray-900">
          <Inbox size={22} className="text-emerald-600" /> Caja
        </span>
        <span className={`text-[11px] font-black px-2 py-1 rounded-full ${
          sessionOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
          {sessionOpen ? '● Caja abierta' : '● Caja cerrada'}
        </span>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {!sessionOpen ? (
            <button onClick={() => setShowOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-black">
              <Unlock size={15} /> Abrir caja
            </button>
          ) : (
            <>
              <button onClick={() => setMovement('in')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-black hover:bg-emerald-100">
                <ArrowDownCircle size={15} /> Entrada
              </button>
              <button onClick={() => setMovement('out')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-sm font-black hover:bg-amber-100">
                <ArrowUpCircle size={15} /> Salida
              </button>
              <button onClick={() => setShowClose(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-black hover:bg-red-100">
                <LockKeyhole size={15} /> Cerrar caja
              </button>
            </>
          )}
          <button onClick={() => void load()} title="Actualizar"
            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
          msg.kind === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                            : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {msg.text}
        </div>
      )}

      {!sessionOpen && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm font-bold rounded-xl px-4 py-3">
          La caja está cerrada. Abrila para poder cobrar los pedidos.
        </div>
      )}

      <p className="text-sm text-gray-500">
        {pendingCount > 0
          ? <><b className="text-gray-800">{pendingCount}</b> pedido(s) esperando cobro</>
          : 'Sin pedidos esperando'}
      </p>

      {/* Lista de espera */}
      {loading && orders.length === 0 ? (
        <div className="flex items-center justify-center py-14 text-gray-400 gap-2">
          <Loader2 size={18} className="animate-spin" /> Cargando…
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl text-center py-16">
          <Inbox size={44} className="mx-auto text-gray-200 mb-2" />
          <p className="text-sm text-gray-400">No hay pedidos por cobrar.</p>
          <p className="text-xs text-gray-400 mt-1">Aparecen acá apenas un agente los envía.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {orders.map(o => (
            <div key={o.id} className={`bg-white border-2 rounded-2xl p-4 ${
              o.status === 'taken' ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black text-gray-900">
                    {o.number ?? 'Pedido'}
                    {o.status === 'taken' && (
                      <span className="ml-2 text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-200 text-amber-800">EN COBRO</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 flex items-center gap-2 flex-wrap mt-0.5">
                    {o.agent_name && <span className="flex items-center gap-1"><User size={11} /> {o.agent_name}</span>}
                    {o.customer_name && <span>· {o.customer_name}</span>}
                    <span className="flex items-center gap-1"><Clock size={11} /> {hhmm(o.created_at)}</span>
                  </p>
                  {o.document_type && o.document_type !== 'ticket' && (
                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                      <Receipt size={10} />
                      {o.document_type === 'factura_electronica' ? 'FACTURA ELECTRÓNICA' : 'TIQUETE ELECTRÓNICO'}
                    </span>
                  )}
                  {o.notes && <p className="text-[11px] text-amber-700 font-semibold mt-1">↳ {o.notes}</p>}
                </div>
                <span className="text-2xl font-black tabular-nums shrink-0">{money(o.total)}</span>
              </div>

              <ul className="mt-3 text-xs text-gray-600 space-y-0.5 max-h-32 overflow-y-auto">
                {o.items.map((it, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate">{it.quantity} × {it.product_name}</span>
                    <span className="tabular-nums shrink-0">{money(it.subtotal)}</span>
                  </li>
                ))}
              </ul>

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <button onClick={() => startCharge(o)} disabled={busyId === o.id || !sessionOpen}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400">
                  {busyId === o.id ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />} Cobrar
                </button>
                {o.status === 'taken' && (
                  <button onClick={() => release(o)} disabled={busyId === o.id} title="Devolverlo a la bandeja"
                    className="px-3 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                    <RotateCcw size={15} />
                  </button>
                )}
                <button onClick={() => cancel(o)} disabled={busyId === o.id} title="Anular el pedido"
                  className="px-3 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40">
                  <Ban size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modales: los MISMOS del POS ──────────────────────────────────── */}
      {showOpen && tenantId && user && (
        <CashOpenModal
          tenantId={tenantId} userId={user.id}
          onSuccess={() => { setShowOpen(false); refetchSession(); setMsg({ kind: 'ok', text: 'Caja abierta.' }); }}
          onCancel={() => setShowOpen(false)}
        />
      )}

      {showClose && currentSession && (
        <CashCloseModal
          session={currentSession}
          onSuccess={async () => { setShowClose(false); await refetchSession(); setMsg({ kind: 'ok', text: 'Caja cerrada.' }); }}
          onCancel={() => setShowClose(false)}
        />
      )}

      {movement && currentSession && tenantId && (
        <CashMovementModal
          sessionId={currentSession.id} tenantId={tenantId} initialType={movement}
          onCancel={() => setMovement(null)}
          onSuccess={() => {
            setMsg({ kind: 'ok', text: `Movimiento de ${movement === 'in' ? 'entrada' : 'salida'} registrado.` });
            setMovement(null);
          }}
        />
      )}

      {charging && (
        <PaymentConfirmationModal
          cartItems={charging.items.map(it => ({
            product_id: it.product_id ?? '', product: { name: it.product_name } as any,
            quantity: it.quantity, unit_price: it.unit_price, subtotal: it.subtotal,
          })) as CartItem[]}
          subtotal={breakdown(charging.total).subtotal}
          taxAmount={breakdown(charging.total).tax}
          total={round2(charging.total)}
          taxEnabled={taxEnabled}
          loading={paying}
          onConfirm={confirmPayment}
          onCancel={() => setCharging(null)}
        />
      )}
    </div>
  );
};

export default CashierDesk;
