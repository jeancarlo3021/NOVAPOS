import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Inbox, Loader2, CreditCard, Ban, RotateCcw, Clock, User, AlertCircle, CheckCircle2,
  LockKeyhole, Unlock, ArrowDownCircle, ArrowUpCircle, RefreshCw, Home, Receipt,
  CalendarDays, ChevronLeft, ChevronRight, Pencil, Mail, Send, X, Printer,
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
import { invoiceEmail } from '@/services/email/invoiceEmailService';
import { marcarOcupado } from '@/utils/appBusy';
import { agentOrdersService, type AgentOrder } from '@/services/agents/salesAgentsService';
import { OrderItemsEditor } from './OrderItemsEditor';
import { ChargePrepModal } from './ChargePrepModal';
import { PosShortcutsHint } from '@/modules/pos/PosShortcutsHint';
import { ReprintInvoiceModal } from '@/modules/pos/ReprintInvoiceModal';
import type { CartItem } from '@/types/Types_POS';

/** Hoy en Costa Rica. El día del negocio no es el UTC del navegador. */
const crToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const shiftDay = (d: string, n: number) => {
  const x = new Date(d + 'T12:00:00');
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
};
const dayLabel = (d: string) =>
  d === crToday() ? 'Hoy'
  : d === shiftDay(crToday(), 1) ? 'Mañana'
  : new Date(d + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' });

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const hhmm = (s?: string | null) =>
  s ? new Date(s).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }) : '';
const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;
/** Redondeo de caja a múltiplos de ₡10, igual que el POS: ya no circulan ₡5. */
const round10 = (n: number) => Math.round(Number(n || 0) / 10) * 10;

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
  const { user, planFeatures } = useAuth();
  const { tenantId } = useTenantId();
  const { currentSession, refetchSession } = useCashSession();
  const { settings } = useSettings('general');

  const [orders, setOrders] = useState<AgentOrder[]>([]);
  // Agenda: la bandeja se ve POR DÍA. Sin esto, el pedido del jueves compite en
  // pantalla con el de ahora y el cajero cobra el que no era.
  const [day, setDay] = useState<string>(crToday());
  /** true = ignora el día y muestra todo lo pendiente (incluye atrasados). */
  const [allDays, setAllDays] = useState(false);
  const [agenda, setAgenda] = useState<Array<{ date: string; pending: number; charged: number; total: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [movement, setMovement] = useState<'in' | 'out' | null>(null);
  /** Pedido que se está cobrando (abre el modal de pago). */
  const [charging, setCharging] = useState<AgentOrder | null>(null);
  /** Última factura cobrada, para ofrecer mandarla por correo. */
  const [ultimaFactura, setUltimaFactura] = useState<{ id: string; numero: string; correo: string } | null>(null);
  const [correoDestino, setCorreoDestino] = useState('');
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);
  /** Buscador de facturas para reimprimir o descargar. */
  const [showReprint, setShowReprint] = useState(false);
  const [editing, setEditing] = useState<AgentOrder | null>(null);
  // Paso previo al cobro: confirmar comprobante, IVA y datos del cliente. El
  // pedido del agente viene sin impuesto y muchas veces sin cédula, y ambas
  // cosas son obligatorias para emitir una factura electrónica.
  const [prep, setPrep] = useState<AgentOrder | null>(null);
  const [paying, setPaying] = useState(false);

  const taxEnabled = (settings as any)?.taxEnabled !== false;
  const taxRate = Number((settings as any)?.taxRate ?? 0.13);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Hasta el día elegido: lo de días anteriores sin cobrar sigue siendo
      // trabajo de hoy, no se puede esconder.
      const range = allDays ? undefined : { to: day };
      const [pending, taken] = await Promise.all([
        agentOrdersService.list('pending', undefined, range),
        agentOrdersService.list('taken', undefined, range),
      ]);
      setOrders([...taken, ...pending]);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo cargar la bandeja' });
    } finally { setLoading(false); }
  }, [day, allDays]);
  useEffect(() => { void load(); }, [load]);

  // Resumen de la semana para saber qué viene sin cambiar de día.
  useEffect(() => {
    const to = new Date(day + 'T12:00:00');
    to.setDate(to.getDate() + 6);
    agentOrdersService.agenda(day, to.toISOString().slice(0, 10))
      .then(setAgenda).catch(() => setAgenda([]));
  }, [day, orders.length]);

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
      setPrep(order);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo tomar el pedido' });
      void load();
    } finally { setBusyId(null); }
  };

  const confirmPayment = async (data: PaymentData) => {
    if (!charging || !tenantId || !currentSession) return;
    setPaying(true);
    try {
      const total = round10(charging.total);
      const { subtotal, tax } = breakdown(total);
      // Se arman CartItem para reusar el servicio de facturación tal cual.
      const cart: CartItem[] = charging.items.map(it => ({
        // Producto suelto: va SIN id. Mandar '' hacía que el backend lo
        // rechazara por no ser un uuid, y la venta entera fallaba.
        product_id: it.product_id ?? null,
        product: { id: it.product_id ?? null, name: it.product_name, unit_price: it.unit_price } as any,
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
        undefined, undefined,
        // El correo dictado al preparar el cobro viaja CON la factura: es lo que
        // permite que el comprobante electrónico le llegue al cliente ocasional.
        charging.customer_email ?? null,
      );

      // Marcar el pedido cobrado y acreditar la comisión del agente.
      await agentOrdersService.charge(charging.id, invoice?.id ?? null, total);

      // La caja se abre igual cuando el cobro va en efectivo pero NO se imprime:
      // el pulso del cajón viaja dentro del recibo, así que sin recibo la caja
      // quedaba cerrada y había que abrirla con la llave para dar el vuelto.
      const entraEfectivo = data.paymentMethod === 'cash'
        || (data.payments ?? []).some((p: any) => p.method === 'cash' && Number(p.amount) > 0);
      if (data.skipPrint && entraEfectivo) {
        void posPrinterService.openCashDrawer(tenantId);
      }

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

      // "Cobrar y descargar": la factura en A4, para el cliente que la pide en
      // hoja. No bloquea el cobro si el PDF falla.
      if (data.downloadPdf) {
        void import('@/modules/invoice/downloadInvoicePdf')
          .then(({ downloadInvoicePdf }) => downloadInvoicePdf({
            invoiceNumber: invoice?.invoice_number ?? charging.number ?? '',
            date: new Date(),
            customerName: charging.customer_name ?? null,
            customerPhone: charging.customer_phone ?? null,
            items: charging.items.map(it => ({
              name: it.product_name, quantity: it.quantity,
              unit_price: it.unit_price, subtotal: it.subtotal,
            })),
            subtotal, tax, total,
            paymentMethod: data.paymentMethod,
            notes: [charging.number, charging.agent_name && `Agente: ${charging.agent_name}`, charging.notes]
              .filter(Boolean).join(' · ') || null,
            feClave: (invoice as any)?.fe_clave ?? null,
            feConsecutivo: (invoice as any)?.fe_consecutivo ?? null,
            documentLabel: charging.document_type === 'factura_electronica' ? 'Factura electrónica'
              : charging.document_type === 'tiquete_electronico' ? 'Tiquete electrónico' : 'Factura',
          }, tenantId))
          .catch(e => {
            console.warn('[pdf] no se pudo generar la factura A4:', e);
            setMsg({ kind: 'err', text: `Se cobró, pero no se pudo generar el PDF: ${e?.message ?? e}` });
          });
      }

      // Se guarda la última factura para poder mandarla por correo después de
      // cobrada: el cliente casi siempre lo pide justo cuando ya se cerró todo.
      if ((invoice as any)?.id) {
        setUltimaFactura({
          id: String((invoice as any).id),
          numero: invoice?.invoice_number ?? charging.number ?? '',
          correo: charging.customer_email ?? '',
        });
      }

      setCharging(null);
      setMsg({ kind: 'ok', text: `Pedido ${charging.number ?? ''} cobrado — factura ${invoice?.invoice_number ?? ''}` });
      await load();
      await refetchSession();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo cobrar' });
    } finally { setPaying(false); }
  };

  /**
   * Cobrando: la app no se actualiza sola encima de un cobro.
   *
   * Igual que en el punto de venta — una recarga a mitad del cobro deja al
   * cajero sin saber si la venta entró.
   */
  useEffect(() => {
    if (!charging && !prep) return;
    return marcarOcupado('cobro-en-curso');
  }, [charging, prep]);

  /** Manda el comprobante recién cobrado al correo del cliente. */
  const enviarPorCorreo = async () => {
    if (!ultimaFactura) return;
    const to = (correoDestino || ultimaFactura.correo).trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setMsg({ kind: 'err', text: 'Escribí un correo válido para mandarle la factura.' });
      return;
    }
    setEnviandoCorreo(true);
    try {
      await invoiceEmail.send(ultimaFactura.id, to);
      setMsg({ kind: 'ok', text: `Factura ${ultimaFactura.numero} enviada a ${to}` });
      setUltimaFactura(null);
      setCorreoDestino('');
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo enviar el correo' });
    } finally { setEnviandoCorreo(false); }
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
        if (next && sessionOpen && !charging && !prep) void startCharge(next);
      } else if (e.key === 'F5') {
        e.preventDefault();
        void load();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // El repartidor termina la entrega y cae acá con el pedido en la mano: se
  // abre directo el cobro en vez de hacerlo buscarlo en la bandeja.
  const [params, setParams] = useSearchParams();
  const incoming = params.get('order');
  useEffect(() => {
    if (!incoming || loading || charging || prep) return;
    const o = orders.find(x => x.id === incoming);
    if (!o) return;
    setParams({}, { replace: true });
    if (sessionOpen) void startCharge(o);
    else setMsg({ kind: 'err', text: 'Abrí la caja para cobrar la entrega.' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming, loading, orders, sessionOpen, prep]);

  // Entrar a caja NO cobra solo.
  //
  // Antes se abría el cobro del primer pedido apenas cargaba la bandeja, y para
  // el cajero eso se veía como que la caja "se pone a cobrar sola": aparecía un
  // pedido que él no eligió, ya reservado a su nombre. Ahora solo se resalta cuál
  // sigue y se cobra con un toque (o F12). La única apertura automática que queda
  // es la del repartidor que llega con /caja?order=..., donde el pedido SÍ lo
  // eligió una persona.
  const nextToCharge = orders.find(o => o.status === 'taken') ?? orders.find(o => o.status === 'pending');

  const pendingCount = orders.filter(o => o.status === 'pending').length;

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-gray-100 p-3 sm:p-6 space-y-3 sm:space-y-4">
      <PosShortcutsHint shortcuts={[
        { keys: 'F12', label: 'Cobrar el siguiente pedido' },
        { keys: 'F5',  label: 'Actualizar la bandeja' },
        { keys: 'F1',  label: 'En cobro: cobrar e imprimir' },
        { keys: 'F2',  label: 'En cobro: cobrar sin imprimir' },
        { keys: 'Esc', label: 'Cerrar el cobro' },
      ]} />
      {/* Barra de caja */}
      <div className="bg-white border border-gray-200 rounded-2xl px-3 sm:px-4 py-3 flex items-center gap-2 flex-wrap">
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
          {/* Reimprimir / descargar una factura ya cobrada.
              El cliente pide el comprobante después de irse, o el papel salió
              mal: hasta ahora eso solo se podía hacer desde el punto de venta,
              y el cajero de esta pantalla no tiene por qué entrar ahí. */}
          <button onClick={() => setShowReprint(true)} title="Reimprimir o descargar una factura"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-black hover:bg-gray-50">
            <Printer size={15} /> Reimprimir
          </button>
          <button onClick={() => void load()} title="Actualizar"
            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Agenda: el día que se está trabajando */}
      <div className="bg-white border border-gray-200 rounded-2xl px-3 py-2.5 flex items-center gap-1.5 sm:gap-2 flex-wrap">
        <CalendarDays size={18} className="text-emerald-600 shrink-0" />
        <button onClick={() => setDay(d => shiftDay(d, -1))} disabled={allDays}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30">
          <ChevronLeft size={15} className="text-gray-500" />
        </button>
        <input type="date" value={day} disabled={allDays}
          onChange={e => setDay(e.target.value || crToday())}
          className="flex-1 sm:flex-none min-w-0 px-2 py-2 sm:py-1.5 border border-gray-200 rounded-lg text-sm font-black text-gray-800 disabled:opacity-40" />
        <button onClick={() => setDay(d => shiftDay(d, 1))} disabled={allDays}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30">
          <ChevronRight size={15} className="text-gray-500" />
        </button>
        <button onClick={() => { setAllDays(false); setDay(crToday()); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-black border ${
            !allDays && day === crToday() ? 'bg-emerald-600 border-emerald-600 text-white'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          Hoy
        </button>
        <button onClick={() => setAllDays(a => !a)}
          className={`px-3 py-1.5 rounded-lg text-xs font-black border ${
            allDays ? 'bg-gray-800 border-gray-800 text-white'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          Todos los días
        </button>
        <span className="hidden sm:inline text-xs font-bold text-gray-400">
          {allDays ? 'Mostrando todo lo pendiente' : `Hasta ${dayLabel(day)} (incluye atrasados)`}
        </span>

        {/* Lo que viene en la semana, para planear sin cambiar de día */}
        {agenda.length > 0 && (
          <div className="w-full flex items-center gap-1.5 overflow-x-auto no-scrollbar sm:flex-wrap pt-2 mt-1 border-t border-gray-100">
            {agenda.map(a => (
              <button key={a.date} onClick={() => { setAllDays(false); setDay(a.date); }}
                className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-black border ${
                  a.date === day && !allDays ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
                {dayLabel(a.date)} · {a.pending} pend. · {money(a.total)}
              </button>
            ))}
          </div>
        )}
      </div>

            {editing && (
        <OrderItemsEditor
          order={editing}
          onClose={() => setEditing(null)}
          onSaved={upd => {
            setOrders(prev => prev.map(x => (x.id === upd.id ? { ...x, ...upd } : x)));
            setEditing(null);
            setMsg({ kind: 'ok', text: `${upd.number ?? 'Pedido'} ajustado · nuevo total ${money(upd.total)}` });
          }}
        />
      )}

      {nextToCharge && !charging && !prep && sessionOpen && (
        <button onClick={() => void startCharge(nextToCharge)} disabled={busyId === nextToCharge.id}
          className="w-full flex items-center justify-between gap-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 text-left disabled:opacity-60">
          <span className="min-w-0">
            <span className="block text-sm font-black truncate">
              Cobrar {nextToCharge.number ?? 'pedido'}
              {nextToCharge.customer_name ? ` · ${nextToCharge.customer_name}` : ''}
            </span>
            <span className="block text-[11px] font-bold text-white/80">
              {nextToCharge.status === 'taken' ? 'Ya está tomado por vos' : 'Siguiente en la bandeja'} · F12
            </span>
          </span>
          <span className="text-xl font-black tabular-nums shrink-0">{money(nextToCharge.total)}</span>
        </button>
      )}

      {msg && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
          msg.kind === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                            : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {msg.text}
        </div>
      )}

      {/* Mandar la factura por correo, ya cobrada.
          Aparece SOLO después de cobrar y se puede ignorar: la mayoría de los
          clientes se va con el tiquete, pero al que lo pide había que decirle
          que no se podía. El correo viene de la ficha si ya estaba. */}
      {ultimaFactura && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2">
          <Mail size={16} className="text-blue-600 shrink-0" />
          <span className="text-sm font-bold text-blue-900">
            Factura {ultimaFactura.numero}: ¿mandarla por correo?
          </span>
          <input
            type="email" inputMode="email" autoComplete="email"
            value={correoDestino || ultimaFactura.correo}
            onChange={e => setCorreoDestino(e.target.value)}
            placeholder="correo@delcliente.com"
            className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg border border-blue-200 text-sm font-semibold"
          />
          <button onClick={() => void enviarPorCorreo()} disabled={enviandoCorreo}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60
                       text-white text-sm font-black flex items-center gap-1.5">
            {enviandoCorreo ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar
          </button>
          <button onClick={() => { setUltimaFactura(null); setCorreoDestino(''); }}
            title="No hace falta" className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-100">
            <X size={15} />
          </button>
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
                  {o.scheduled_date && (
                    <span className={`inline-flex items-center gap-1 mt-1 mr-1 text-[10px] font-black px-1.5 py-0.5 rounded ${
                      o.scheduled_date < crToday() ? 'bg-red-100 text-red-700'
                        : o.scheduled_date === crToday() ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'}`}>
                      <CalendarDays size={10} />
                      {o.scheduled_date < crToday() ? `ATRASADO · ${dayLabel(o.scheduled_date)}` : dayLabel(o.scheduled_date)}
                      {o.scheduled_time ? ` · ${String(o.scheduled_time).slice(0, 5)}` : ''}
                      {o.scheduled_note ? ` · ${o.scheduled_note}` : ''}
                    </span>
                  )}
                  {(o.customer_zone || o.delivery_place) && (
                    <p className="text-[11px] font-bold text-emerald-700 truncate mt-0.5">
                      📍 {[o.customer_zone, o.delivery_place].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {o.proforma_id && (
                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-black px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                      <Receipt size={10} /> DESDE PROFORMA
                    </span>
                  )}
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

              <ul className="mt-3 text-xs text-gray-600 space-y-0.5 max-h-40 overflow-y-auto">
                {o.items.map((it, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate">{it.quantity} × {it.product_name}</span>
                    <span className="tabular-nums shrink-0">{money(it.subtotal)}</span>
                  </li>
                ))}
              </ul>

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
                <button onClick={() => startCharge(o)} disabled={busyId === o.id || !sessionOpen}
                  className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 sm:py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400">
                  {busyId === o.id ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />} Cobrar
                </button>
                <button onClick={() => setEditing(o)} disabled={busyId === o.id}
                  title="Ajustar artículos o precios antes de cobrar"
                  className="px-3 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                  <Pencil size={15} />
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
      {showReprint && (
        <ReprintInvoiceModal
          onClose={() => setShowReprint(false)}
          cashierName={user?.email ?? undefined}
        />
      )}

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

      {prep && (
        <ChargePrepModal
          order={prep}
          taxRate={taxRate}
          taxEnabled={taxEnabled}
          onCancel={() => setPrep(null)}
          onReady={(prepared) => { setPrep(null); setCharging(prepared); }}
        />
      )}

      {charging && (
        <PaymentConfirmationModal
          cartItems={charging.items.map(it => ({
            product_id: it.product_id ?? '', product: { name: it.product_name } as any,
            quantity: it.quantity, unit_price: it.unit_price, subtotal: it.subtotal,
          })) as CartItem[]}
          subtotal={breakdown(round10(charging.total)).subtotal}
          taxAmount={breakdown(round10(charging.total)).tax}
          total={round10(charging.total)}
          taxEnabled={taxEnabled}
          loading={paying}
          onConfirm={confirmPayment}
          onCancel={() => setCharging(null)}
          allowPdf={!!(planFeatures as any).invoice_pdf_a4}
        />
      )}
    </div>
  );
};

export default CashierDesk;
