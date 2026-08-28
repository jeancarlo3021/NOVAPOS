'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { parseServerDate, fmtCRDateTime } from '@/utils/crDate';
import { LockKeyhole, X, Plus, Trash2, CreditCard, Smartphone, Banknote, CloudUpload, AlertTriangle, Loader2 } from 'lucide-react';
import { cashSessionService } from '@/services/cashManagement/cashSessionsService';
import { cashSessionOfflineService } from '@/services/cashManagement/cashSessionOfflineService';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { CashSession } from '@/types/Types_POS';
import { useSimpleCashCount } from '@/hooks/useSimpleCashCount';

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

/** A partir de esta hora (CR) se ofrece el cierre del día al cerrar una caja. */
const DAILY_CLOSE_FROM_HOUR = 18;

export const CashCloseModal: React.FC<CashCloseModalProps> = ({ session, onSuccess, onCancel }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('cash');
  const [loading, setLoading] = useState(false);
  /** Cierre del día pendiente de ofrecer (sesión ya cerrada). */
  const [askDaily, setAskDaily] = useState<CashSession | null>(null);

  const [error, setError] = useState('');
  // La carga de ventas FALLÓ: el arqueo que se ve son ceros que no significan
  // "no hubo ventas". Cerrar así congela un cierre falso, así que se bloquea.
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // ── Efectivo ──
  // Conteo simple: un solo campo con el efectivo (Configuración → POS).
  const { simpleCash } = useSimpleCashCount();
  const [simpleAmount, setSimpleAmount] = useState('');
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
    cash: number; card: number; sinpe: number;
    /** Ventas a crédito: quedan por cobrar, no entran a la caja. */
    credit: number;
    /** Transferencia bancaria (distinta de SINPE): tampoco entra a la caja. */
    transfer: number;
    /** Cualquier método que no encaje arriba. Debería quedar en 0. */
    other: number;
    invoicesCount: number; invoicesTotal: number;
    voidsCount: number; voidsTotal: number;
    deliveryCount: number; deliveryTotal: number; deliveryNet: number;
    excludedCount: number; excludedTotal: number;   // clientes excluidos del cierre (ej. empleados)
    cashIn: number; cashOut: number; movements: SysMovement[];
    /** Detalle de las ventas del turno, para imprimirlo en el cierre. */
    sales: Array<{ number: string; time: string; method: string; total: number; kind: string }>;
    usdReceived: number;   // dólares recibidos en ventas en efectivo $
    usdChangeOut: number;  // dólares entregados como vuelto
    /** Vendido en dólares, expresado en colones. NO entra al arqueo en ₡. */
    usdCrc: number;
    loaded: boolean;
  }
  const [sys, setSys] = useState<SysTotals>({
    cash: 0, card: 0, sinpe: 0, credit: 0, transfer: 0, other: 0,
    invoicesCount: 0, invoicesTotal: 0,
    voidsCount: 0, voidsTotal: 0, deliveryCount: 0, deliveryTotal: 0, deliveryNet: 0,
    excludedCount: 0, excludedTotal: 0,
    cashIn: 0, cashOut: 0, movements: [], sales: [], usdReceived: 0, usdChangeOut: 0, usdCrc: 0, loaded: false,
  });

  // Ventas hechas sin conexión que TODAVÍA no subieron. El cierre se calcula con
  // lo que hay en el servidor, así que si estas quedan en el dispositivo el
  // arqueo sale en 0 (o corto) y nadie entiende por qué.
  const [pendingOffline, setPendingOffline] = useState(0);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const checkPending = useCallback(async () => {
    try {
      const { posOfflineService } = await import('@/services/pos/posOfflineService');
      setPendingOffline(await posOfflineService.getPendingCount());
    } catch { setPendingOffline(0); }
  }, []);
  useEffect(() => { void checkPending(); }, [checkPending]);

  useEffect(() => {
    let cancel = false;
    setLoadFailed(false);
    (async () => {
      try {
        // Si la consulta FALLA, el cierre mostraba ceros sin decir nada: el
        // cajero veía "no hubo ventas" cuando en realidad no se pudo preguntar.
        // Ahora el error se ve y el arqueo no se cierra a ciegas.
        // Las ventas de la caja las resuelve el SERVIDOR: si la sesión no
        // tiene facturas ligadas (se abrió sin conexión, se rompió el enlace),
        // él mismo busca las del período de esa caja y dice de dónde salieron.
        // Antes esto dependía de un mapeo guardado en el navegador, y en otro
        // dispositivo el arqueo salía en 0 con la plata en el cajón.
        let sessionId = session.id;
        try {
          const { posOfflineService } = await import('@/services/pos/posOfflineService');
          sessionId = posOfflineService.mapOfflineSessionId(session.id);
        } catch { /* sin mapeo: se usa el id tal cual */ }

        const [invRes, movRes] = await Promise.all([
          apiFetch<{ invoices: any[]; source?: string }>(`/cash-sessions/${sessionId}/invoices`)
            .catch((e) => {
              if (!cancel) {
                setLoadFailed(true);
                setError(`No se pudieron cargar las ventas de esta caja: ${
                  e instanceof Error ? e.message : 'error de conexión'}. Los totales de abajo NO son confiables.`);
              }
              return { invoices: [] as any[], source: 'error' };
            }),
          apiFetch<any[]>(`/cash-sessions/${sessionId}/movements`).catch(() => []),
        ]);

        if (cancel) return;
        let allInv = (invRes?.invoices ?? []);

        // El servidor avisa cuando tuvo que buscar por período: el cajero tiene
        // que saber que esas ventas no estaban ligadas a su caja.
        if ((invRes as any)?.source === 'window' && allInv.length > 0 && !cancel) {
          setError(
            `Esta caja no tenía ventas ligadas, pero se encontraron ${allInv.length} `
            + 'venta(s) del período y se incluyeron en el arqueo. '
            + 'Suele pasar cuando la caja se abrió sin conexión: revisá los totales antes de cerrar.',
          );
        }

        // Clientes excluidos del cierre (ej. compras de empleados a crédito): la venta
        // existe pero NO se contabiliza en el arqueo/cierre. Las contamos aparte para
        // mostrarlas como línea informativa.
        const excludedInv = allInv.filter((i: any) => i.status !== 'cancelled' && i.exclude_from_close);
        const excludedCount = excludedInv.length;
        const excludedTotal = excludedInv.reduce((s: number, i: any) => s + Number(i.total || 0), 0);
        const notCancelled = allInv.filter((i: any) => i.status !== 'cancelled' && !i.exclude_from_close);
        // DELIVERY: NO entra al cierre de caja — se contabiliza aparte.
        const deliveryInv = notCancelled.filter((i: any) => i.is_delivery);
        const invoices = notCancelled.filter((i: any) => !i.is_delivery);
        const deliveryCount = deliveryInv.length;
        const deliveryTotal = deliveryInv.reduce((s: number, i: any) => s + Number(i.total || 0), 0);
        const deliveryNet = deliveryInv.reduce((s: number, i: any) => s + Number(i.delivery_net ?? i.total ?? 0), 0);
        const voidedInv = allInv.filter((i: any) => i.status === 'cancelled');
        const voidsCount = voidedInv.length;
        const voidsTotal = voidedInv.reduce((s: number, i: any) => s + Number(i.total || 0), 0);
        let sCash = 0, sCard = 0, sSinpe = 0, sCredit = 0, sTransfer = 0, sOther = 0;
        let usdReceived = 0, usdChangeOut = 0, usdCrcChangeOut = 0;
        // Monto VENDIDO en dólares, en su equivalente en colones.
        //
        // La venta en $ se saltaba el bucle por completo —correcto para el arqueo
        // en colones, porque no entró un solo colón—, pero también quedaba fuera
        // de los totales de venta. El negocio veía menos ingreso del que hizo, y
        // la diferencia no aparecía por ningún lado.
        let sUsdCrc = 0;
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
            // La VENTA sí cuenta como ingreso, aparte del arqueo en colones.
            sUsdCrc += Number(inv.total || 0);
            continue;
          }
          const pays = Array.isArray(inv.payments) ? inv.payments : null;
          // Cada método a su propia bolsa. Antes todo lo que no fuera efectivo,
          // tarjeta o SINPE caía en «Otros», así que el cierre no decía si eran
          // ventas a crédito o transferencias — dos cosas muy distintas a la hora
          // de cuadrar y de cobrar después.
          const addByMethod = (method: string, a: number) => {
            switch (method) {
              case 'cash':     sCash += a; break;
              case 'card':     sCard += a; break;
              case 'sinpe':    sSinpe += a; break;
              case 'credit':   sCredit += a; break;
              case 'transfer':
              case 'transferencia':
              case 'bank_transfer': sTransfer += a; break;
              default:         sOther += a;
            }
          };
          if (pays && pays.length) {
            for (const p of pays) addByMethod(String(p.method ?? ''), Number(p.amount || 0));
          } else {
            addByMethod(String(inv.payment_method ?? ''), Number(inv.total || 0));
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
        // Detalle de ventas del turno, ordenado por hora. Se imprime en el cierre
        // para que el arqueo pueda cotejarse venta por venta.
        const salesDetail = invoices
          .map((i: any) => ({
            number: String(i.invoice_number ?? i.id ?? ''),
            time: String(i.issued_at ?? i.created_at ?? ''),
            method: String(i.payment_method ?? ''),
            total: Number(i.total ?? 0),
            kind: String(i.document_type ?? ''),
          }))
          .sort((x: any, y: any) => String(x.time).localeCompare(String(y.time)));

        setSys({
          cash: sCash, card: sCard, sinpe: sSinpe, usdCrc: sUsdCrc,
          credit: sCredit, transfer: sTransfer, other: sOther,
          invoicesCount: invoices.length,
          invoicesTotal: invoices.reduce((s: number, i: any) => s + Number(i.total || 0), 0),
          voidsCount, voidsTotal,
          deliveryCount, deliveryTotal, deliveryNet,
          excludedCount, excludedTotal,
          cashIn, cashOut, movements, sales: salesDetail,
          usdReceived, usdChangeOut, loaded: true,
        });
      } catch {
        if (!cancel) setSys(prev => ({ ...prev, loaded: true }));
      }
    })();
    return () => { cancel = true; };
  }, [session.id, reloadKey]);

  // ── Totals contados ──
  const openingAmount = session.opening_amount ?? 0;
  // Conteo SIMPLE (Configuración → POS): un solo campo con el efectivo contado,
  // sin desglose por denominación. El resto del cierre no cambia.
  const cashTotal = simpleCash
    ? Math.max(0, parseFloat(simpleAmount) || 0)
    : DENOMINATIONS.reduce((s, d) => s + d.value * (quantities[d.value] ?? 0), 0);
  const cardTotal = parseFloat(cardAmount) || 0;
  const sinpeTotal = sinpeEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const grandTotal = cashTotal + cardTotal + sinpeTotal;

  // Total de ventas del día registradas por el sistema (todos los métodos).
  // Es informativo: el arqueo NO se hace contra este número (ver `arqueableSales`).
  const systemSalesTotal = sys.cash + sys.card + sys.sinpe + sys.credit + sys.transfer + sys.other + sys.usdCrc;
  void systemSalesTotal;

  /**
   * Lo ARQUEABLE: solo lo que deja dinero que el cajero pueda contar.
   *
   * El crédito y las transferencias no dejan dinero en la gaveta: el crédito
   * queda como cuenta por cobrar y la transferencia entra al banco. Sumarlos
   * al esperado inventaba un faltante exactamente igual al crédito del día —el
   * cajero cuadraba peso por peso y el tiquete igual le marcaba FALTANTE, sin
   * ninguna forma de encontrar el error, porque no había ningún error.
   */
  const arqueableSales = sys.cash + sys.card + sys.sinpe;
  /**
   * Lo que se vendió pero NO entra al arqueo en colones.
   *
   * El crédito queda como cuenta por cobrar, la transferencia entra al banco, y
   * lo cobrado en DÓLARES se arquea en su propia moneda —contarlo también en
   * colones lo cobraría dos veces.
   */
  const noArqueable = sys.credit + sys.transfer + sys.other + sys.usdCrc;
  // Esperado = fondo de caja + ventas arqueables + movimientos manuales de efectivo.
  const expectedTotal = openingAmount + arqueableSales + sys.cashIn - sys.cashOut;
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
    /**
     * Cerrar en ₡0 es posible y a veces correcto.
     *
     * Pasa de verdad: un día sin ventas, todo cobrado con tarjeta, o el efectivo
     * ya retirado antes de cerrar. Bloquear el cierre por eso dejaba la caja
     * abierta sin ninguna forma de cerrarla —el botón simplemente no
     * respondía—, y al día siguiente ya no se podía abrir la nueva. Se pregunta
     * una vez, por si fue un olvido, y se deja seguir.
     */
    if (grandTotal <= 0 && arqueableSales > 0) {
      const seguir = window.confirm(
        'Estás cerrando con ₡0 contados, pero el sistema registra ventas.\n\n'
        + '¿Contaste la caja? Si cerrás así va a quedar un faltante por el total del día.\n\n'
        + '¿Cerrar igual?',
      );
      if (!seguir) return;
    }

    // Método con ventas registradas pero contado en CERO: casi siempre es que se
    // contó el efectivo y se olvidó pasar por la pestaña de tarjeta. Cerrar así
    // deja un faltante enorme en el historial que después nadie puede explicar.
    const sinContar = ([
      { label: 'Tarjeta', sistema: sys.card, contado: cardTotal },
      { label: 'SINPE', sistema: sys.sinpe, contado: sinpeTotal },
      { label: 'Efectivo', sistema: sys.cash, contado: cashTotal },
    ]).filter(m => m.sistema > 0 && m.contado <= 0);

    if (sinContar.length > 0) {
      const detalle = sinContar
        .map(m => `· ${m.label}: el sistema registra ₡${Math.round(m.sistema).toLocaleString('es-CR')} y vos pusiste ₡0`)
        .join('\n');
      const seguir = window.confirm(
        `Hay métodos de pago sin contar:\n\n${detalle}\n\n`
        + 'Si cerrás así, el cierre va a mostrar un faltante que no existe. '
        + '¿Cerrar de todas formas?',
      );
      if (!seguir) return;
    }

    setLoading(true);
    setError('');
    try {
      const breakdown = JSON.stringify({
        counted: { cash: cashTotal, card: cardTotal, sinpe: sinpeTotal },
        system: {
          cash: sys.cash, card: sys.card, sinpe: sys.sinpe,
          credit: sys.credit, transfer: sys.transfer, other: sys.other,
        },
        expectedTotal, difference, sinpeEntries,
      });
      const closingUsd = parseFloat(usd) || 0;
      const closeData = {
        id: session.id,
        closing_amount: grandTotal,
        closing_usd: closingUsd,
        notes: `Desglose: ${breakdown}`,
        // La hora REAL del cierre. Sin conexión, el cierre sube horas después:
        // sellarlo con la hora de la subida deja el arqueo diciendo que la caja
        // se cerró al día siguiente.
        closed_at: new Date().toISOString(),
      };


      let updatedSession: CashSession;

      // Cierre OPTIMISTA guardado en la cola local. Se usa cuando no hay internet
      // (o el servidor no responde): la caja se cierra en la tablet y sube sola
      // cuando vuelve la conexión, DESPUÉS de las ventas del día.
      const queueClose = async (): Promise<CashSession> => {
        try {
          await cashSessionOfflineService.queueCloseSession(closeData);
          return {
            ...session,
            closing_amount: grandTotal,
            closed_at: new Date().toISOString(),
            status: 'closed' as const,
          };
        } catch (queueErr) {
          throw new Error(`Error al encolar: ${queueErr instanceof Error ? queueErr.message : 'desconocido'}`);
        }
      };

      if (!navigator.onLine) {
        updatedSession = await queueClose();
      } else {
        try {
          updatedSession = await cashSessionService.closeCashSession(closeData);
        } catch (err) {
          // `navigator.onLine` da "en línea" con solo estar pegado al WiFi. Si el
          // servidor no contesta, NO se puede dejar al cajero sin cerrar la caja:
          // se encola igual y se sincroniza después.
          const { isNetworkError } = await import('@/services/connectivity/connectivityService');
          if (!isNetworkError(err)) throw err;
          updatedSession = await queueClose();
        }
      }

      // Imprimir reporte de cierre (fire-and-forget, no bloquea)
      try {
        const tenantId = user?.tenant_id;
        if (tenantId) {
          posPrinterService.printCashClose({
            session_id: session.id,
            opened_at: (parseServerDate((session as any).opening_date ?? session.opened_at ?? session.created_at)
              ?? new Date()).toISOString(),
            closed_at: (parseServerDate((updatedSession as any).closing_date ?? updatedSession.closed_at)
              ?? new Date()).toISOString(),
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
            system_credit: sys.credit,
            system_transfer: sys.transfer,
            system_other: sys.other,
            // Vendido en dólares, en su equivalente en colones. Va aparte para
            // que el tiquete explique por qué el esperado en ₡ es menor que el
            // total vendido: esa plata se arquea en dólares, no en colones.
            system_usd_crc: sys.usdCrc,
            // Lo que el cajero contó por método
            cash_total: cashTotal,
            card_total: cardTotal,
            sinpe_total: sinpeTotal,
            closing_amount: grandTotal,
            // Efectivo: esperado vs contado → faltante/sobrante
            expected_amount: expectedTotal,
            // Ventas que NO se arquean (crédito y otros métodos). Van al tiquete
            // para que quede claro por qué el esperado es menor que el total.
            non_countable_sales: noArqueable,
            difference,
            invoices_count: sys.invoicesCount,
            invoices_total: sys.invoicesTotal,
            voids_count: sys.voidsCount,
            voids_total: sys.voidsTotal,
            delivery_count: sys.deliveryCount,
            delivery_total: sys.deliveryTotal,
            delivery_net: sys.deliveryNet,
            excluded_count: sys.excludedCount,
            excluded_total: sys.excludedTotal,
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
            ...(sys.usdCrc > 0 ? [['Cobrado en dólares', m(sys.usdCrc)]] : []),
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
          ...(sys.deliveryCount > 0 ? [{ heading: 'Delivery (aparte, no en caja)', rows: [
            ['Ventas delivery', `${sys.deliveryCount} · ${m(sys.deliveryTotal)}`],
            ['Neto delivery', m(sys.deliveryNet)],
          ] }] : []),
          ...(sys.excludedCount > 0 ? [{ heading: 'Excluidas del cierre (ej. empleados)', rows: [
            ['Ventas excluidas', `${sys.excludedCount} · ${m(sys.excludedTotal)}`],
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

      // Cierre del día: se ofrece SOLO de tarde, cuando ya no se va a volver a
      // abrir caja. Antes de esa hora el consolidado estaría incompleto y
      // preguntarlo en cada cambio de turno sería puro ruido.
      const hora = Number(new Date().toLocaleString('en-US', {
        timeZone: 'America/Costa_Rica', hour: '2-digit', hour12: false,
      }));
      if (hora >= DAILY_CLOSE_FROM_HOUR) {
        setAskDaily(updatedSession);
        return;   // el modal del día se encarga de cerrar esta pantalla
      }

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

        {/* Hay ventas en la caja, pero NINGUNA cuenta para el arqueo: todas
            cayeron en delivery o en clientes excluidos. Sin este aviso el cierre
            se ve igual que "no se vendió nada" y no hay forma de darse cuenta
            de que el POS quedó en modo delivery. */}
        {sys.invoicesCount === 0 && (sys.deliveryCount > 0 || sys.excludedCount > 0) && (
          <div className="bg-sky-50 border-b border-sky-200 px-4 sm:px-6 py-3 flex items-start gap-3 shrink-0">
            <AlertTriangle size={18} className="text-sky-600 shrink-0 mt-0.5" />
            <p className="text-sm font-bold text-sky-900">
              Esta caja no tiene ventas para arquear, pero sí hubo movimiento:
              {sys.deliveryCount > 0 && (
                <span className="block font-black">
                  {sys.deliveryCount} venta(s) marcadas como DELIVERY (₡{sys.deliveryTotal.toLocaleString('es-CR')}).
                  {' '}El delivery no entra al arqueo: si no eran delivery, el POS quedó en ese modo.
                </span>
              )}
              {sys.excludedCount > 0 && (
                <span className="block font-black">
                  {sys.excludedCount} venta(s) de clientes excluidos del cierre (₡{sys.excludedTotal.toLocaleString('es-CR')}).
                </span>
              )}
            </p>
          </div>
        )}

        {/* Ventas sin subir: el cierre las ignora porque se calcula con lo que
            hay en el servidor. Cerrar así deja el arqueo corto y sin explicación. */}
        {pendingOffline > 0 && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap shrink-0">
            <AlertTriangle size={18} className="text-amber-600 shrink-0" />
            <p className="text-sm font-bold text-amber-800 flex-1 min-w-0">
              Hay {pendingOffline} venta(s) hechas sin conexión que todavía no se subieron.
              <span className="block text-xs font-semibold text-amber-700">
                Si cerrás ahora, esas ventas NO entran en el arqueo.
              </span>
            </p>
            <button
              onClick={async () => {
                setSyncingOffline(true);
                try {
                  const { posOfflineService } = await import('@/services/pos/posOfflineService');
                  const { invoicesService } = await import('@/services/invoice/invoiceService');
                  await posOfflineService.syncPendingInvoices(async (inv: any) => {
                    await invoicesService.createInvoice(
                      inv.tenantId,
                      posOfflineService.mapOfflineSessionId(inv.sessionId),
                      inv.cartItems, inv.subtotal, inv.discountAmount ?? 0, inv.discountPercent ?? 0,
                      inv.taxAmount, inv.total, inv.paymentMethod, inv.customerName, inv.notes,
                      undefined,
                      inv.paymentMethod === 'cash' ? (inv.amountReceived ?? inv.total) : undefined,
                      inv.changeAmount ?? 0,
                      inv.paymentMethod === 'card' || inv.paymentMethod === 'sinpe'
                        ? (inv.voucherNumber ?? 'OFFLINE') : undefined,
                      inv.invoiceNumber, inv.cashierId ?? null, inv.cashierName ?? null,
                      inv.payments ?? null, inv.documentType ?? 'ticket', inv.customerId ?? null,
                      inv.currencyInfo,
                      inv.id,   // marca contra el doble cobro al reintentar
                    );
                  });
                  await checkPending();
                  // Los totales del cierre se recalculan con lo recién subido.
                  window.location.reload();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'No se pudieron subir las ventas');
                } finally { setSyncingOffline(false); }
              }}
              disabled={syncingOffline}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-black disabled:opacity-50"
            >
              {syncingOffline ? <Loader2 size={15} className="animate-spin" /> : <CloudUpload size={15} />}
              Subir ahora
            </button>
          </div>
        )}

        {/* ── Session summary ── */}
        <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-2 sm:py-3 flex items-center gap-3 sm:gap-4 shrink-0 flex-wrap">
          <div className="text-sm text-gray-500">
            Monto de apertura: <span className="font-black text-gray-800">₡{(session.opening_amount ?? 0).toLocaleString()}</span>
            {/* Hora TICA de la apertura y cuánto lleva abierta: es lo primero que
                se mira para saber si esta es la caja del turno correcto. */}
            <span className="block text-xs text-gray-400">
              Abrió {fmtCRDateTime((session as any).opening_date ?? (session as any).opened_at)}
              {(() => {
                const ini = parseServerDate((session as any).opening_date ?? (session as any).opened_at);
                if (!ini) return null;
                const mins = Math.max(0, Math.round((Date.now() - ini.getTime()) / 60000));
                return ` · lleva ${Math.floor(mins / 60)} h ${mins % 60} m abierta`;
              })()}
            </span>
          </div>
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
            <div className="bg-red-50 border-2 border-red-300 text-red-700 font-semibold text-base rounded-2xl px-5 py-4 flex items-center gap-3 flex-wrap">
              <span className="flex-1 min-w-0">{error}</span>
              {loadFailed && (
                <button type="button" onClick={() => { setError(''); setReloadKey(k => k + 1); }}
                  className="shrink-0 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-black">
                  Reintentar
                </button>
              )}
            </div>
          )}

          {/* EFECTIVO */}
          {activeTab === 'cash' && (
            <div className="space-y-4">
              {simpleCash ? (
                <section>
                  <p className="text-gray-500 text-sm font-black uppercase tracking-wider mb-2">
                    💵 Efectivo contado en caja
                  </p>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-gray-400">₡</span>
                    <input
                      autoFocus
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={simpleAmount}
                      onChange={e => setSimpleAmount(e.target.value)}
                      placeholder="0"
                      className="w-full text-right text-4xl font-black text-gray-900 bg-white border-2 border-gray-200 rounded-2xl pl-12 pr-5 py-4 focus:outline-none focus:border-emerald-400 transition tabular-nums"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Contá TODO el efectivo de la caja (incluido el fondo de apertura). El desglose por
                    billetes y monedas está desactivado en Configuración → POS.
                  </p>
                </section>
              ) : (
                <>
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
                </>
              )}
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

          {/* Delivery (informativo — no es efectivo en caja, lo cobra la plataforma).
              Se puede mostrar sin romper el conteo a ciegas porque no revela el efectivo esperado. */}
          {sys.deliveryCount > 0 && (
            <div className="flex items-center justify-between gap-3 bg-orange-50 border-2 border-orange-200 rounded-2xl px-4 py-2.5">
              <span className="text-orange-700 font-bold text-sm">
                🛵 Delivery <span className="text-orange-400 font-normal">(aparte, no en caja)</span>
                <span className="block text-[11px] text-orange-500">{sys.deliveryCount} venta{sys.deliveryCount === 1 ? '' : 's'} · Neto ₡{sys.deliveryNet.toLocaleString('es-CR')}</span>
              </span>
              <span className="text-orange-700 text-xl font-black tabular-nums">₡{sys.deliveryTotal.toLocaleString('es-CR')}</span>
            </div>
          )}

          {/* Excluidas del cierre (ej. compras de empleados) — informativo, no cuenta en caja. */}
          {sys.excludedCount > 0 && (
            <div className="flex items-center justify-between gap-3 bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-2.5">
              <span className="text-slate-700 font-bold text-sm">
                🚫 Excluidas del cierre <span className="text-slate-400 font-normal">(ej. empleados)</span>
                <span className="block text-[11px] text-slate-500">{sys.excludedCount} venta{sys.excludedCount === 1 ? '' : 's'} · no cuentan en el arqueo</span>
              </span>
              <span className="text-slate-700 text-xl font-black tabular-nums">₡{sys.excludedTotal.toLocaleString('es-CR')}</span>
            </div>
          )}

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
            <button type="button" onClick={handleConfirm} disabled={loading || loadFailed}
              className="h-16 rounded-2xl bg-rose-500 hover:bg-rose-600 active:bg-rose-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-lg transition shadow-sm">
              {loading ? 'Cerrando...' : loadFailed ? 'Cargá las ventas primero' : 'Cerrar Caja ✓'}
            </button>
          </div>
        </div>

      </div>

      {askDaily && (
        <DailyCloseAsk
          tenantId={user?.tenant_id ?? ''}
          onDone={() => { const ses = askDaily; setAskDaily(null); onSuccess(ses); }}
        />
      )}
    </div>
  );
};

/**
 * Cierre del día.
 *
 * Aparece después de cerrar una caja, solo de tarde. Junta TODAS las cajas del
 * día natural (00:00 a 24:00) en un consolidado: un negocio abre y cierra caja
 * varias veces —turnos, dos cajeros— y hasta ahora saber cuánto vendió el día
 * entero era sumar tiquetes a mano.
 */
const DailyCloseAsk: React.FC<{
  tenantId: string;
  onDone: () => void;
}> = ({ tenantId, onDone }) => {
  const [printing, setPrinting] = useState(false);
  const [err, setErr] = useState('');

  const print = async () => {
    setPrinting(true); setErr('');
    try {
      const data = await apiFetch<any>('/cash-sessions/daily-summary');
      if (!data?.totals) { setErr('Hoy no hay cierres de caja para consolidar.'); return; }
      await posPrinterService.printDailyClose(data, tenantId);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo imprimir el cierre del día');
    } finally { setPrinting(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className="text-4xl mb-2">🌙</div>
        <h3 className="text-lg font-black text-gray-900">¿Imprimir el cierre del día?</h3>
        <p className="text-sm text-gray-600 mt-1">
          Un consolidado de <b>todas las cajas de hoy</b> (00:00 a 24:00): ventas por método,
          arqueo y diferencia del día completo.
        </p>
        {err && (
          <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>
        )}
        <div className="flex gap-2 mt-5">
          <button onClick={onDone} disabled={printing}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm disabled:opacity-50">
            Ahora no
          </button>
          <button onClick={print} disabled={printing}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:opacity-50">
            {printing ? 'Imprimiendo…' : 'Imprimir'}
          </button>
        </div>
      </div>
    </div>
  );
};
