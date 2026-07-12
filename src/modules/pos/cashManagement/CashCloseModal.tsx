'use client';

import React, { useState, useEffect } from 'react';
import { LockKeyhole, X, Plus, Trash2, CreditCard, Smartphone, Banknote } from 'lucide-react';
import { cashSessionService } from '@/services/cashManagement/cashSessionsService';
import { cashSessionOfflineService } from '@/services/cashManagement/cashSessionOfflineService';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { CashSession } from '@/types/Types_POS';

const DENOMINATIONS = [
  { value: 50000, label: '₡50.000', type: 'billete' },
  { value: 20000, label: '₡20.000', type: 'billete' },
  { value: 10000, label: '₡10.000', type: 'billete' },
  { value: 5000,  label: '₡5.000',  type: 'billete' },
  { value: 2000,  label: '₡2.000',  type: 'billete' },
  { value: 1000,  label: '₡1.000',  type: 'billete' },
  { value: 500,   label: '₡500',    type: 'moneda'  },
  { value: 100,   label: '₡100',    type: 'moneda'  },
  { value: 50,    label: '₡50',     type: 'moneda'  },
  { value: 25,    label: '₡25',     type: 'moneda'  },
  { value: 10,    label: '₡10',     type: 'moneda'  },
  { value: 5,     label: '₡5',      type: 'moneda'  },
];

type Tab = 'cash' | 'card' | 'sinpe';

interface SinpeEntry {
  id: number;
  reference: string;
  amount: string;
}

interface CashCloseModalProps {
  session: CashSession;
  onSuccess: (session: CashSession) => void;
  onCancel: () => void;
}

export const CashCloseModal: React.FC<CashCloseModalProps> = ({ session, onSuccess, onCancel }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('cash');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Efectivo ──
  const [quantities, setQuantities] = useState<Record<number, number>>(
    Object.fromEntries(DENOMINATIONS.map(d => [d.value, 0]))
  );

  // ── Tarjeta ──
  const [cardAmount, setCardAmount] = useState('');
  const [usd, setUsd] = useState('');   // dólares en efectivo contados al cerrar

  // ── SINPE ──
  const [sinpeEntries, setSinpeEntries] = useState<SinpeEntry[]>([
    { id: Date.now(), reference: '', amount: '' },
  ]);

  // ── Ventas del sistema (lo que el POS registró en esta sesión) ──
  interface SysMovement { type: 'in' | 'out'; amount: number; reason: string }
  interface SysTotals {
    cash: number; card: number; sinpe: number; other: number;
    invoicesCount: number; invoicesTotal: number;
    voidsCount: number; voidsTotal: number;
    cashIn: number; cashOut: number; movements: SysMovement[];
    usdReceived: number;   // dólares recibidos en ventas en efectivo $
    usdChangeOut: number;  // dólares entregados como vuelto
    loaded: boolean;
  }
  const [sys, setSys] = useState<SysTotals>({
    cash: 0, card: 0, sinpe: 0, other: 0, invoicesCount: 0, invoicesTotal: 0,
    voidsCount: 0, voidsTotal: 0,
    cashIn: 0, cashOut: 0, movements: [], usdReceived: 0, usdChangeOut: 0, loaded: false,
  });

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [invRes, movRes] = await Promise.all([
          apiFetch<{ invoices: any[] }>(`/invoices?cash_session_id=${session.id}`).catch(() => ({ invoices: [] })),
          apiFetch<any[]>(`/cash-sessions/${session.id}/movements`).catch(() => []),
        ]);
        if (cancel) return;
        const allInv = (invRes?.invoices ?? []);
        const invoices = allInv.filter((i: any) => i.status !== 'cancelled');
        const voidedInv = allInv.filter((i: any) => i.status === 'cancelled');
        const voidsCount = voidedInv.length;
        const voidsTotal = voidedInv.reduce((s: number, i: any) => s + Number(i.total || 0), 0);
        let sCash = 0, sCard = 0, sSinpe = 0, sOther = 0;
        let usdReceived = 0, usdChangeOut = 0, usdCrcChangeOut = 0;
        for (const inv of invoices) {
          // Venta pagada en DÓLARES efectivo: no entran colones por la venta.
          // Entran dólares (recibido) y, si el vuelto fue en ₡, salen colones.
          if (inv.currency === 'USD' && inv.payment_method === 'cash') {
            const rate = Number(inv.exchange_rate) || 0;
            if (rate > 0) {
              usdReceived += Number(inv.amount_received || 0) / rate;   // amount_received está en ₡ equiv
              if (inv.change_currency === 'USD') usdChangeOut += Number(inv.change_amount || 0) / rate;
            }
            if (inv.change_currency !== 'USD') usdCrcChangeOut += Number(inv.change_amount || 0); // ₡ que salieron de vuelto
            continue;
          }
          const pays = Array.isArray(inv.payments) ? inv.payments : null;
          if (pays && pays.length) {
            for (const p of pays) {
              const a = Number(p.amount || 0);
              if (p.method === 'cash') sCash += a;
              else if (p.method === 'card') sCard += a;
              else if (p.method === 'sinpe') sSinpe += a;
              else sOther += a;
            }
          } else {
            const a = Number(inv.total || 0);
            const m = inv.payment_method;
            if (m === 'cash') sCash += a;
            else if (m === 'card') sCard += a;
            else if (m === 'sinpe') sSinpe += a;
            else sOther += a;
          }
        }
        // Movimientos manuales de efectivo: entradas = 'income', salidas = 'expense'.
        // (Las ventas son tipo 'sale' y ya van contadas en las facturas.)
        const movsRaw = (Array.isArray(movRes) ? movRes : [])
          .filter((m: any) => m.type === 'income' || m.type === 'expense'
            || m.type === 'cash_in' || m.type === 'cash_out');
        const movements: SysMovement[] = movsRaw.map((m: any) => ({
          type: (m.type === 'income' || m.type === 'cash_in') ? 'in' : 'out',
          amount: Math.abs(Number(m.amount || 0)),
          reason: m.description ?? '',
        }));
        const cashIn = movements.filter(m => m.type === 'in').reduce((s, m) => s + m.amount, 0);
        // El vuelto en ₡ de ventas pagadas en $ también es efectivo que SALE de la caja.
        const cashOut = movements.filter(m => m.type === 'out').reduce((s, m) => s + m.amount, 0) + usdCrcChangeOut;
        setSys({
          cash: sCash, card: sCard, sinpe: sSinpe, other: sOther,
          invoicesCount: invoices.length,
          invoicesTotal: invoices.reduce((s: number, i: any) => s + Number(i.total || 0), 0),
          voidsCount, voidsTotal,
          cashIn, cashOut, movements, usdReceived, usdChangeOut, loaded: true,
        });
      } catch {
        if (!cancel) setSys(prev => ({ ...prev, loaded: true }));
      }
    })();
    return () => { cancel = true; };
  }, [session.id]);

  // ── Totals contados ──
  const openingAmount = session.opening_amount ?? 0;
  const cashTotal = DENOMINATIONS.reduce((s, d) => s + d.value * (quantities[d.value] ?? 0), 0);
  const cardTotal = parseFloat(cardAmount) || 0;
  const sinpeTotal = sinpeEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const grandTotal = cashTotal + cardTotal + sinpeTotal;

  // Total de ventas del día registradas por el sistema (todos los métodos).
  const systemSalesTotal = sys.cash + sys.card + sys.sinpe + sys.other;
  // Esperado = fondo de caja + total de ventas del día (efectivo + tarjeta + SINPE).
  const expectedTotal = openingAmount + systemSalesTotal + sys.cashIn - sys.cashOut;
  // Faltante/sobrante sobre el TOTAL (lo contado en todos los métodos vs lo esperado).
  const difference = grandTotal - expectedTotal;

  // ── Denomination helpers ──
  const setQty = (value: number, qty: number) =>
    setQuantities(prev => ({ ...prev, [value]: Math.max(0, qty) }));

  const billetes = DENOMINATIONS.filter(d => d.type === 'billete');
  const monedas  = DENOMINATIONS.filter(d => d.type === 'moneda');

  // ── SINPE helpers ──
  const addSinpe = () =>
    setSinpeEntries(prev => [...prev, { id: Date.now(), reference: '', amount: '' }]);

  const removeSinpe = (id: number) =>
    setSinpeEntries(prev => prev.filter(e => e.id !== id));

  const updateSinpe = (id: number, field: 'reference' | 'amount', value: string) =>
    setSinpeEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));

  // ── Submit ──
  const handleConfirm = async () => {
    if (grandTotal <= 0) {
      setError('Debes ingresar el monto total (efectivo + tarjeta + SINPE) antes de cerrar');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const breakdown = JSON.stringify({
        counted: { cash: cashTotal, card: cardTotal, sinpe: sinpeTotal },
        system: { cash: sys.cash, card: sys.card, sinpe: sys.sinpe, other: sys.other },
        expectedTotal, difference, sinpeEntries,
      });
      const closingUsd = parseFloat(usd) || 0;
      const closeData = {
        id: session.id,
        closing_amount: grandTotal,
        closing_usd: closingUsd,
        notes: `Desglose: ${breakdown}`,
      };


      let updatedSession: CashSession;

      if (!navigator.onLine) {
        // Offline: Queue the operation
        try {
          // Store the close operation for syncing
          await cashSessionOfflineService.queueCloseSession(closeData);

          // Return optimistic response with correct property names
          updatedSession = {
            ...session,
            closing_amount: grandTotal,
            closed_at: new Date().toISOString(),
            status: 'closed' as const,
          };
        } catch (queueErr) {
          throw new Error(`Error al encolar: ${queueErr instanceof Error ? queueErr.message : 'desconocido'}`);
        }
      } else {
        // Online: Close immediately
        updatedSession = await cashSessionService.closeCashSession(closeData);
      }

      // Imprimir reporte de cierre (fire-and-forget, no bloquea)
      try {
        const tenantId = user?.tenant_id;
        if (tenantId) {
          posPrinterService.printCashClose({
            session_id: session.id,
            opened_at: session.opened_at ?? session.created_at ?? new Date().toISOString(),
            closed_at: updatedSession.closed_at ?? new Date().toISOString(),
            cashier_name: user?.email,
            opening_amount: openingAmount,
            // Dólares en efectivo: apertura + recibidos − vuelto = esperado, vs contado.
            opening_usd: Number((session as any).opening_usd ?? 0),
            usd_received: sys.usdReceived,
            usd_change_out: sys.usdChangeOut,
            expected_usd: Number((session as any).opening_usd ?? 0) + sys.usdReceived - sys.usdChangeOut,
            closing_usd: closingUsd,
            // Lo que registró el sistema (ventas por método)
            system_cash: sys.cash,
            system_card: sys.card,
            system_sinpe: sys.sinpe,
            system_other: sys.other,
            // Lo que el cajero contó por método
            cash_total: cashTotal,
            card_total: cardTotal,
            sinpe_total: sinpeTotal,
            closing_amount: grandTotal,
            // Efectivo: esperado vs contado → faltante/sobrante
            expected_amount: expectedTotal,
            difference,
            invoices_count: sys.invoicesCount,
            invoices_total: sys.invoicesTotal,
            voids_count: sys.voidsCount,
            voids_total: sys.voidsTotal,
            cash_movements: sys.movements,
          }, tenantId).catch(() => {});
        }
      } catch {
        // No bloquear el cierre por error en impresión
      }

      // Enviar el cierre por correo a los correos configurados (fire-and-forget).
      try {
        const m = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;
        const usdV = Number((session as any).opening_usd ?? 0) > 0 || sys.usdReceived > 0 || closingUsd > 0;
        const sections: any[] = [
          { heading: 'Ventas del sistema', rows: [
            ['Efectivo', m(sys.cash)], ['Tarjeta', m(sys.card)], ['SINPE', m(sys.sinpe)],
            ['Facturas', `${sys.invoicesCount} · ${m(sys.invoicesTotal)}`],
            ...(sys.voidsCount > 0 ? [['Anulaciones', `${sys.voidsCount} · ${m(sys.voidsTotal)}`]] : []),
          ] },
          { heading: 'Contado', rows: [
            ['Efectivo', m(cashTotal)], ['Tarjeta', m(cardTotal)], ['SINPE', m(sinpeTotal)],
            ['Total contado', m(grandTotal)],
          ] },
          { heading: 'Arqueo de efectivo', rows: [
            ['Fondo inicial', m(openingAmount)], ['Efectivo esperado', m(expectedTotal)], ['Efectivo contado', m(cashTotal)],
            [difference === 0 ? 'Cuadrado' : difference > 0 ? 'Sobrante' : 'Faltante', m(Math.abs(difference))],
          ] },
          ...(usdV ? [{ heading: 'Dólares en efectivo', rows: [
            ['Apertura', `$${Number((session as any).opening_usd ?? 0).toFixed(2)}`],
            ['Recibido en ventas', `$${sys.usdReceived.toFixed(2)}`],
            ['Esperado', `$${(Number((session as any).opening_usd ?? 0) + sys.usdReceived - sys.usdChangeOut).toFixed(2)}`],
            ['Contado', `$${closingUsd.toFixed(2)}`],
          ] }] : []),
        ];
        const { apiFetch } = await import('@/lib/api');
        apiFetch('/email/report', {
          method: 'POST',
          body: JSON.stringify({
            subject: `Cierre de caja — ${new Date().toLocaleDateString('es-CR')}`,
            title: 'Cierre de caja',
            subtitle: `Cajero: ${user?.email ?? ''} · ${new Date().toLocaleString('es-CR')}`,
            sections,
          }),
        }).catch(() => {});
      } catch { /* no bloquear el cierre */ }

      onSuccess(updatedSession);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al cerrar caja';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const DenomCard = ({ d }: { d: typeof DENOMINATIONS[0] }) => {
    const qty = quantities[d.value] ?? 0;
    const active = qty > 0;
    return (
      <div className={`rounded-2xl border-2 p-3 flex flex-col gap-2 transition-all select-none ${active ? 'bg-rose-50 border-rose-400 shadow-sm' : 'bg-white border-gray-200'}`}>
        {/* Etiqueta + subtotal */}
        <div className="flex items-center justify-between">
          <span className={`text-lg font-black leading-none ${active ? 'text-rose-700' : 'text-gray-800'}`}>{d.label}</span>
          <span className={`text-xs font-bold ${active ? 'text-rose-500' : 'text-transparent'}`}>
            ₡{(d.value * qty).toLocaleString()}
          </span>
        </div>
        {/* Controles: botones grandes + cantidad editable */}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setQty(d.value, qty - 1)} disabled={qty === 0}
            className={`h-14 w-14 rounded-xl flex items-center justify-center text-3xl font-black transition active:scale-90 shrink-0 ${qty > 0 ? 'bg-red-500 text-white shadow-sm' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}>−</button>
          <input
            type="number"
            inputMode="numeric"
            value={qty === 0 ? '' : qty}
            onFocus={e => e.target.select()}
            onChange={e => setQty(d.value, parseInt(e.target.value, 10) || 0)}
            placeholder="0"
            className={`flex-1 min-w-0 h-14 text-center text-3xl font-black rounded-xl border-2 bg-white focus:outline-none transition ${active ? 'text-rose-600 border-rose-300 focus:border-rose-500' : 'text-gray-400 border-gray-200 focus:border-rose-400'}`}
          />
          <button type="button" onClick={() => setQty(d.value, qty + 1)}
            className="h-14 w-14 rounded-xl bg-rose-500 hover:bg-rose-600 active:bg-rose-700 active:scale-90 text-white flex items-center justify-center text-3xl font-black transition shrink-0 shadow-sm">+</button>
        </div>
      </div>
    );
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode; total: number; color: string }[] = [
    { id: 'cash',  label: 'Efectivo',  icon: <Banknote size={18} />,    total: cashTotal,  color: 'emerald' },
    { id: 'card',  label: 'Tarjeta',   icon: <CreditCard size={18} />,  total: cardTotal,  color: 'blue' },
    { id: 'sinpe', label: 'SINPE',     icon: <Smartphone size={18} />,  total: sinpeTotal, color: 'violet' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3">
      <div className="bg-gray-50 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 sm:gap-4 shrink-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-rose-500 flex items-center justify-center shrink-0">
            <LockKeyhole size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-gray-900 font-black text-xl sm:text-2xl leading-tight">Cierre de Caja</h2>
            <p className="text-gray-400 text-xs sm:text-sm truncate">Ingresa los montos por método de pago</p>
          </div>
          <button onClick={onCancel} className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center transition text-gray-500">
            <X size={22} />
          </button>
        </div>

        {/* ── Session summary ── */}
        <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-2 sm:py-3 flex items-center gap-3 sm:gap-4 shrink-0 flex-wrap">
          <div className="text-sm text-gray-500">Monto de apertura: <span className="font-black text-gray-800">₡{(session.opening_amount ?? 0).toLocaleString()}</span></div>
          <div className="flex-1" />
          {TABS.map(t => (
            <div key={t.id} className="text-sm text-gray-500">
              {t.label}: <span className="font-black text-gray-800">₡{t.total.toLocaleString()}</span>
            </div>
          ))}
        </div>

        {/* ── Movimientos de efectivo (entradas / salidas) ── */}
        {sys.movements.length > 0 && (
          <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-2 sm:py-3 shrink-0">
            <div className="flex items-center gap-3 mb-1.5">
              <p className="text-xs font-black text-gray-500 uppercase">Movimientos de efectivo</p>
              <span className="text-xs font-bold text-emerald-600">Entradas: ₡{sys.cashIn.toLocaleString()}</span>
              <span className="text-xs font-bold text-red-600">Salidas: ₡{sys.cashOut.toLocaleString()}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {sys.movements.map((m, i) => (
                <span key={i} className={`text-[11px] font-bold px-2 py-1 rounded-lg ${m.type === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {m.type === 'in' ? '+' : '−'} ₡{m.amount.toLocaleString()}{m.reason ? ` · ${m.reason}` : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="bg-white border-b border-gray-200 px-2 sm:px-6 flex gap-1 sm:gap-2 shrink-0 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onPointerDown={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 font-bold text-sm border-b-2 transition whitespace-nowrap ${
                activeTab === t.id
                  ? `border-${t.color}-500 text-${t.color}-600`
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>
              {t.icon}{t.label}
              {t.total > 0 && (
                <span className={`bg-${t.color}-100 text-${t.color}-700 text-xs font-black px-2 py-0.5 rounded-full`}>
                  ₡{t.total.toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border-2 border-red-300 text-red-700 font-semibold text-base rounded-2xl px-5 py-4">{error}</div>
          )}

          {/* EFECTIVO */}
          {activeTab === 'cash' && (
            <div className="space-y-4">
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">💵</span>
                  <h3 className="text-base font-black text-gray-700 uppercase tracking-wide">Billetes</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                  {billetes.map(d => <DenomCard key={d.value} d={d} />)}
                </div>
              </section>
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">🪙</span>
                  <h3 className="text-base font-black text-gray-700 uppercase tracking-wide">Monedas</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                  {monedas.map(d => <DenomCard key={d.value} d={d} />)}
                </div>
              </section>
              <div className="flex items-center justify-between bg-emerald-500 rounded-2xl px-6 py-4">
                <span className="text-emerald-100 text-lg font-bold">Total efectivo</span>
                <span className="text-white text-3xl font-black">₡{cashTotal.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* TARJETA */}
          {activeTab === 'card' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl px-5 py-4 text-center">
                <p className="text-blue-700 font-black text-lg">Datáfono</p>
                <p className="text-blue-500 text-sm mt-1">Ingresa el total cobrado por tarjeta</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm font-black uppercase tracking-wider mb-2">Monto total tarjeta</p>
                <input
                  type="number"
                  inputMode="numeric"
                  value={cardAmount}
                  onChange={e => setCardAmount(e.target.value)}
                  placeholder="₡0"
                  className="w-full text-right text-4xl font-black text-gray-900 bg-white border-2 border-gray-200 rounded-2xl px-5 py-4 focus:outline-none focus:border-blue-400 transition"
                />
              </div>
              {cardTotal > 0 && (
                <div className="flex items-center justify-between bg-blue-500 rounded-2xl px-6 py-4">
                  <span className="text-blue-100 text-lg font-bold">Total tarjeta</span>
                  <span className="text-white text-3xl font-black">₡{cardTotal.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          {/* SINPE */}
          {activeTab === 'sinpe' && (
            <div className="space-y-4">
              <div className="bg-violet-50 border-2 border-violet-200 rounded-2xl px-5 py-4 text-center">
                <p className="text-violet-700 font-black text-lg">SINPE Móvil</p>
                <p className="text-violet-500 text-sm mt-1">Agrega cada transferencia recibida</p>
              </div>

              <div className="space-y-3">
                {sinpeEntries.map((entry, idx) => (
                  <div key={entry.id} className="bg-white border-2 border-gray-200 rounded-2xl p-4 flex gap-3 items-center">
                    <span className="text-gray-400 font-black text-sm w-6 shrink-0 text-center">{idx + 1}</span>
                    <div className="flex-1 flex gap-3 flex-wrap">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={entry.reference}
                        onChange={e => updateSinpe(entry.id, 'reference', e.target.value)}
                        placeholder="N° comprobante (opcional)"
                        className="flex-1 min-w-0 bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 text-gray-800 font-semibold focus:outline-none focus:border-violet-400 transition text-sm"
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        value={entry.amount}
                        onChange={e => updateSinpe(entry.id, 'amount', e.target.value)}
                        placeholder="₡ Monto"
                        className="w-36 shrink-0 bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 text-gray-800 font-black text-right focus:outline-none focus:border-violet-400 transition text-base"
                      />
                    </div>
                    {sinpeEntries.length > 1 && (
                      <button onPointerDown={() => removeSinpe(entry.id)}
                        className="w-10 h-10 shrink-0 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button onPointerDown={addSinpe}
                className="w-full h-14 rounded-2xl border-2 border-dashed border-violet-300 text-violet-600 font-bold flex items-center justify-center gap-2 hover:bg-violet-50 active:bg-violet-100 transition">
                <Plus size={20} />Agregar otro SINPE
              </button>

              {sinpeTotal > 0 && (
                <div className="flex items-center justify-between bg-violet-500 rounded-2xl px-6 py-4">
                  <span className="text-violet-100 text-lg font-bold">Total SINPE ({sinpeEntries.filter(e => parseFloat(e.amount) > 0).length} transacciones)</span>
                  <span className="text-white text-3xl font-black">₡{sinpeTotal.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="bg-white border-t border-gray-200 px-4 sm:px-6 py-3 sm:py-5 shrink-0 space-y-3">
          {/* Las ventas del sistema y el faltante/sobrante NO se muestran en pantalla:
              solo aparecen en el ticket impreso del cierre. */}

          {/* Dólares en efectivo contados (opcional — 0 si no maneja dólares) */}
          <div className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5">
            <span className="text-gray-600 font-bold text-sm">
              Dólares en efectivo <span className="text-gray-400 font-normal">(opcional)</span>
              {Number((session as any).opening_usd ?? 0) > 0 && (
                <span className="block text-[11px] text-gray-400">Apertura: ${Number((session as any).opening_usd).toFixed(2)}</span>
              )}
            </span>
            <div className="relative w-36">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-black">$</span>
              <input type="number" inputMode="decimal" min={0} step="0.01"
                value={usd} onChange={e => setUsd(e.target.value)} placeholder="0.00"
                className="w-full text-right text-lg font-black bg-white border-2 border-gray-200 rounded-xl pl-7 pr-3 py-1.5 focus:outline-none focus:border-rose-400 tabular-nums" />
            </div>
          </div>

          {/* Grand total */}
          <div className="flex items-center justify-between bg-rose-500 rounded-2xl px-6 py-4">
            <div>
              <p className="text-rose-100 text-sm font-semibold">Total contado</p>
              <p className="text-rose-200 text-xs">Efectivo + Tarjeta + SINPE</p>
            </div>
            <span className="text-white text-4xl font-black">₡{grandTotal.toLocaleString()}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button type="button" onClick={onCancel} disabled={loading}
              className="h-16 rounded-2xl border-2 border-gray-200 bg-white text-gray-600 font-bold text-lg hover:bg-gray-50 active:bg-gray-100 transition">
              Cancelar
            </button>
            <button type="button" onClick={handleConfirm} disabled={loading || grandTotal <= 0}
              className="h-16 rounded-2xl bg-rose-500 hover:bg-rose-600 active:bg-rose-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-lg transition shadow-sm">
              {loading ? 'Cerrando...' : 'Cerrar Caja ✓'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
