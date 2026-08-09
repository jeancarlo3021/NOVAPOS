import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShoppingBag, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { proformasService } from '@/services/proformas/proformasService';
import { useCashSession } from '@/hooks/useCashSession';
import { createCashSession } from '@/services/cashManagement/cashSessionsService';
import { useTenantId } from '@/hooks/useTenant';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { usePOSProducts } from '@/hooks/POS/usePOSProducts';
import { usePOSViewMode } from '@/hooks/usePOSViewMode';
import { useAssistedMode } from '@/hooks/useAssistedMode';
import { usePOSLayout } from '@/hooks/usePOSLayout';
import { usePOSTabs } from '@/hooks/POS/usePOSTabs';
import { POSTabs } from './POSTabs';
import { cacheSet, cacheGet, cacheKey } from '@/utils/offlineCache';
import { usePOSPromotions } from '@/hooks/POS/usePOSPromotions';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import {
  getProductPromotion,
  calcPromoSubtotal,
  computeCartCombos,
} from '@/services/promotions/promotionsService';
import { invoicesService, localNowISO } from '@/services/invoice/invoiceService';
import { posOfflineService, OfflineInvoicePayload, generateInvoiceNumber } from '@/services/pos/posOfflineService';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { apiFetch } from '@/lib/api';
import { POSHeader } from './POSHeader';
import { POSPinLockModal } from './POSPinLockModal';
import { POSDesktopBar } from './POSDesktopBar';
import { CashMovementModal } from './cashManagement/CashMovementModal';
import { POSProductsPanel } from './POSProducts';
import { POSCartPanel } from './POSCart';
import { POSModals } from './POSModals';
import { VoidInvoiceModal } from './VoidInvoiceModal';
import { ReprintInvoiceModal } from './ReprintInvoiceModal';
import { DisplayTestModal } from './components/DisplayTestModal';
import { CashOpenModal } from './cashManagement/CashOpenModal';
import { CashCloseModal } from './cashManagement/CashCloseModal';
import { PaymentConfirmationModal, PaymentData } from './cashManagement/PaymentConfirmationModal';
import { QuickProductModal } from './QuickProductModal';
import { useOfflineDaySync } from '@/hooks/useOfflineDaySync';
import { PosShortcutsHint } from './PosShortcutsHint';
import { useFeReady } from '@/hooks/POS/useFeReady';
import type { SelectedModifier } from '@/services/modifiers/modifiersService';
import { BipperModal } from './BipperModal';
import { BipperListModal } from './BipperListModal';
import { FeQuotaWarning } from '@/components/FeQuotaWarning';
import { LoadingState } from '@/components/ui/uiComponents';
import type { CartItem, Product } from '@/types/Types_POS';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  sinpe: 'SINPE Móvil',
  credit: 'Crédito',
};

export const POSMain = () => {
  const { user, planFeatures } = useAuth();
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenantId();
  const { canDo } = useRolePermissions();
  // can_delete en el módulo 'pos' habilita anulación de facturas (acción
  // destructiva). Si el owner no lo permite, el botón Anular queda oculto.
  const canVoidInvoice = canDo('pos', 'delete');
  const { mode: posViewMode } = usePOSViewMode();
  const { assisted } = useAssistedMode();
  const { layout: posLayout } = usePOSLayout();
  const isListLayout = posLayout === 'list';
  const { currentSession, loading: sessionLoading, refetchSession } = useCashSession();
  const { isOnline } = useOfflineSync();
  const { rate: exchangeRate } = useExchangeRate();
  const { products, filteredProducts, searchTerm, setSearchTerm, loading: productsLoading, fromCache: productsCached, cachedAt: productsCachedAt, error: productsError, refetch: refetchProducts } = usePOSProducts();
  const activePromotions = usePOSPromotions(tenantId);

  // Carrito multi-pestaña: cada tab tiene su propio cart + cliente, persistido
  // en localStorage. setCartItems/setCustomerName mantienen la misma firma que
  // los useState anteriores, así el resto del componente no cambia.
  const {
    tabs, activeTabId, setActiveTabId, newTab, closeTab, renameTab,
    cartItems, setCartItems,
    customerName: tabCustomerName, setCustomerName: setTabCustomerName,
    resetActive,
  } = usePOSTabs(tenantId);

  // ── Cargar una PROFORMA en el carrito (?proforma=<id>) ────────────────────
  // Al completar el cobro, la proforma se marca como convertida.
  const [searchParams, setSearchParams] = useSearchParams();
  const proformaToConvert = useRef<string | null>(null);
  useEffect(() => {
    const pid = searchParams.get('proforma');
    if (!pid || productsLoading || products.length === 0) return;
    searchParams.delete('proforma'); setSearchParams(searchParams, { replace: true });
    proformasService.get(pid).then(pf => {
      if (pf.status !== 'open') { setError(`La proforma ${pf.number} ya está ${pf.status === 'converted' ? 'convertida' : 'anulada'}`); return; }
      const cart = pf.items.map(it => {
        const prod = products.find(p => p.id === it.product_id) ?? ({ id: it.product_id ?? '', name: it.name, unit_price: it.unit_price, stock_quantity: 0, tenant_id: tenantId ?? '' } as any);
        return { product_id: (it.product_id ?? prod.id) as string, product_name: it.name, product: prod, unit_price: it.unit_price, quantity: it.quantity, subtotal: it.quantity * it.unit_price };
      });
      setCartItems(cart);
      if (pf.customer_name) setTabCustomerName(pf.customer_name);
      proformaToConvert.current = pf.id;
      setSuccess(`Proforma ${pf.number} cargada — completá el cobro para convertirla en venta`);
    }).catch(() => setError('No se pudo cargar la proforma'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, productsLoading, products.length]);

  // ── Cargar la CUENTA DE UNA MESA dejada por el mapa de mesas ──────────────
  // El panel de la mesa guarda el consumo en sessionStorage y navega al POS: acá
  // se carga al carrito y, al completar el cobro, la cuenta se cierra ligada a la
  // factura. Se cobra con el flujo normal (IVA, medios de pago, FE, impresión).
  const tableOrderToClose = useRef<{ id: string; label: string } | null>(null);
  useEffect(() => {
    if (productsLoading || products.length === 0) return;
    let raw: string | null = null;
    try { raw = sessionStorage.getItem('novapos_pending_table_order'); } catch { return; }
    if (!raw) return;
    try { sessionStorage.removeItem('novapos_pending_table_order'); } catch { /* ignore */ }
    try {
      const pending = JSON.parse(raw) as {
        order_id: string; table_label?: string;
        items: Array<{ product_id?: string | null; product_name: string; quantity: number; unit_price: number; subtotal: number; notes?: string | null }>;
      };
      const cart = (pending.items ?? []).map(it => {
        const prod = products.find(p => p.id === it.product_id)
          ?? ({ id: it.product_id ?? '', name: it.product_name, unit_price: it.unit_price, stock_quantity: 0, tenant_id: tenantId ?? '' } as any);
        return {
          product_id: (it.product_id ?? prod.id) as string,
          product_name: it.product_name,
          product: prod,
          unit_price: it.unit_price,
          quantity: it.quantity,
          subtotal: it.subtotal,
          notes: it.notes ?? undefined,
        };
      });
      if (cart.length === 0) return;
      setCartItems(cart as any);
      tableOrderToClose.current = { id: pending.order_id, label: pending.table_label ?? 'Mesa' };
      setSuccess(`Cuenta de ${pending.table_label ?? 'la mesa'} cargada — completá el cobro para cerrarla`);
    } catch { /* json corrupto: se ignora */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsLoading, products.length]);

  // ── Cargar el PEDIDO DE UN AGENTE dejado por la bandeja de caja ───────────
  const agentOrderToClose = useRef<{ id: string; number?: string | null } | null>(null);
  useEffect(() => {
    if (productsLoading || products.length === 0) return;
    let raw: string | null = null;
    try { raw = sessionStorage.getItem('novapos_pending_agent_order'); } catch { return; }
    if (!raw) return;
    try { sessionStorage.removeItem('novapos_pending_agent_order'); } catch { /* ignore */ }
    try {
      const pending = JSON.parse(raw) as {
        order_id: string; number?: string; agent_name?: string; customer_name?: string;
        items: Array<{ product_id?: string | null; product_name: string; quantity: number; unit_price: number; subtotal: number; notes?: string | null }>;
      };
      const cart = (pending.items ?? []).map(it => {
        const prod = products.find(p => p.id === it.product_id)
          ?? ({ id: it.product_id ?? '', name: it.product_name, unit_price: it.unit_price, stock_quantity: 0, tenant_id: tenantId ?? '' } as any);
        return {
          product_id: (it.product_id ?? prod.id) as string,
          product_name: it.product_name,
          product: prod,
          unit_price: it.unit_price,
          quantity: it.quantity,
          subtotal: it.subtotal,
          notes: it.notes ?? undefined,
        };
      });
      if (cart.length === 0) return;
      setCartItems(cart as any);
      if (pending.customer_name) setTabCustomerName(pending.customer_name);
      agentOrderToClose.current = { id: pending.order_id, number: pending.number };
      setSuccess(`Pedido ${pending.number ?? ''} de ${pending.agent_name ?? 'agente'} cargado — completá el cobro`);
    } catch { /* json corrupto: se ignora */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsLoading, products.length]);

  /** Marca el pedido del agente como cobrado (y le acredita la comisión). */
  const chargeAgentOrder = async (orderId: string, invoiceId: string | null, total: number) => {
    try {
      const { agentOrdersService } = await import('@/services/agents/salesAgentsService');
      await agentOrdersService.charge(orderId, invoiceId, total);
    } catch (e) { console.warn('[agentes] no se pudo marcar el pedido cobrado:', e); }
  };

  /** Cierra la cuenta de la mesa al cobrarse. Si falla (sin red), no rompe el
   *  cobro: la venta ya está hecha y la cuenta se puede cerrar a mano. */
  const closeTableOrder = async (orderId: string, invoiceId: string | null) => {
    try {
      const { tableOrdersService } = await import('@/services/tables/tableOrdersService');
      await tableOrdersService.close(orderId, invoiceId);
    } catch (e) { console.warn('[mesas] no se pudo cerrar la cuenta:', e); }
  };

  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(0);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showQuickProduct, setShowQuickProduct] = useState(false);
  const [enabledPays, setEnabledPays] = useState<string[]>(['cash', 'card', 'sinpe', 'credit', 'mixed']);
  const [printerType, setPrinterType] = useState<string | undefined>(undefined);
  const [lastInvoice, setLastInvoice] = useState<any>(null);
  const [paymentData, setPaymentData] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ── Auto-dismiss de los toasts en el header del POS ─────────────────────
  // Mensajes de éxito desaparecen a los 3.5 s, errores a los 6 s (más tiempo
  // porque pueden requerir atención). El timer se resetea cada vez que cambia
  // el mensaje, así dos eventos seguidos no se solapan ni se borran antes.
  useEffect(() => {
    if (!success) return;
    const id = setTimeout(() => setSuccess(''), 3500);
    return () => clearTimeout(id);
  }, [success]);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(''), 6000);
    return () => clearTimeout(id);
  }, [error]);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Tax settings loaded from general config
  const [taxEnabled, setTaxEnabled]   = useState(true);
  // Apertura/cierre de caja (config del negocio). Si false, se vende sin caja.
  const [cashEnabled, setCashEnabled] = useState(true);
  const [taxRate, setTaxRate]         = useState(0.13);
  // Mostrar los precios YA con IVA (Ajustes → General). Es solo presentación:
  // el carrito sigue calculando sobre la base sin impuesto y el total cobrado es
  // el mismo. Lo que cambia es que el cajero canta el precio que el cliente paga.
  const [showPricesWithTax, setShowPricesWithTax] = useState(true);
  // Comisiones de delivery por plataforma (configuradas en Ajustes → Delivery).
  const [deliveryCommissions, setDeliveryCommissions] = useState<Record<string, number>>({});
  // Modo de venta: mesa (precio normal) o delivery (precio delivery). Solo si el
  // plan incluye la función.
  const deliveryEnabled = !!(planFeatures as any)?.pos_delivery;
  const [saleMode, setSaleMode] = useState<'mesa' | 'delivery'>('mesa');
  const isDeliveryMode = deliveryEnabled && saleMode === 'delivery';
  const [pendingInvoices, setPendingInvoices] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [showReprintModal, setShowReprintModal] = useState(false);
  // Cliente formal seleccionado (desde el buscador) — persiste en el tab activo.
  const [selectedCustomer, setSelectedCustomer] =
    useState<import('@/services/customers/customersService').Customer | null>(null);
  // Precios especiales del cliente seleccionado (product_id → precio).
  const [customerPrices, setCustomerPrices] = useState<Record<string, number>>({});
  // Carrito como panel deslizable en pantallas chicas (teléfono).
  const [cartOpen, setCartOpen] = useState(false);
  // ── Kiosk mode: cajero activo ─────────────────────────────────────────────
  // El terminal del POS se queda con un user base. Cada cajero entra con su
  // PIN y queda como "cajero activo" — todas las acciones que haga (facturas,
  // anular, mov. de caja) se atribuyen a él hasta que otro entre con su PIN.
  const KIOSK_KEY = 'novapos_pos_kiosk_cashier';
  type ActiveCashier = { id: string; full_name: string; role: string; ticket_alias?: string };
  const [activeCashier, setActiveCashier] = useState<ActiveCashier | null>(() => {
    try { const raw = localStorage.getItem(KIOSK_KEY); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  });
  // Kiosk: requiere feature de plan `pos_kiosk` Y toggle de Settings.
  // Si el plan no lo incluye, queda OFF aunque haya quedado encendido localmente.
  const planAllowsKiosk = !!(planFeatures as any)?.pos_kiosk;
  const [kioskUserPref, setKioskUserPref] = useState<boolean>(() => {
    try { return localStorage.getItem('novapos_pos_kiosk_enabled') === '1'; }
    catch { return false; }
  });
  const kioskEnabled = planAllowsKiosk && kioskUserPref;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { apiFetch } = await import('@/lib/api');
        const cfg = await apiFetch<{ enabled?: boolean } | null>('/settings/pos-kiosk');
        if (cancelled || !cfg) return;
        if (typeof cfg.enabled === 'boolean') setKioskUserPref(cfg.enabled);
      } catch { /* sin config → respeta localStorage */ }
    })();
    return () => { cancelled = true; };
  }, []);
  const [showPinModal, setShowPinModal] = useState<'forced' | 'switch' | null>(
    kioskEnabled && !activeCashier ? 'forced' : null
  );

  useEffect(() => {
    try {
      if (activeCashier) localStorage.setItem(KIOSK_KEY, JSON.stringify(activeCashier));
      else               localStorage.removeItem(KIOSK_KEY);
    } catch { /* SSR */ }
  }, [activeCashier]);

  // Tipo de documento elegido por venta. Inicialmente lee el default de la
  // config de FE (Settings → Facturación Electrónica). Si no hay config, ticket.
  const [documentType, setDocumentType] =
    useState<import('./POSDesktopBar').DocumentType>('ticket');
  // ¿Está lista la emisión electrónica? Requiere ApiKey del emisor configurada.
  // Sin ApiKey no se puede facturar tiquete/factura electrónica.

  // Bipper / localizador: número o nombre que sale en el ticket (feature del plan).
  const bipperEnabled = !!(planFeatures as any)?.pos_bipper;
  const [bipper, setBipper] = useState('');
  const [showBipperModal, setShowBipperModal] = useState(false);   // asignar antes de cobrar
  const [showBipperList, setShowBipperList] = useState(false);     // lista de bippers de hoy
  // Al presionar "Cobrar": si el bipper está activo Y NO es venta delivery, primero
  // pide el bipper y luego abre el cobro; en delivery (o sin bipper) va directo.
  const startCobro = () => {
    if (bipperEnabled && !isDeliveryMode) setShowBipperModal(true);
    else setShowPaymentModal(true);
  };

  // La lógica de "¿se puede emitir electrónico?" vive en useFeReady y la comparten
  // el POS y el pedido del agente: duplicarla garantizaba que se desincronizaran.
  const { feReady: feApiKeyReady, defaultDocType } = useFeReady();
  useEffect(() => { setDocumentType(defaultDocType); }, [defaultDocType]);

  // Sin ApiKey no se puede emitir electrónico → forzar tiquete corriente.
  useEffect(() => {
    if (!feApiKeyReady && documentType !== 'ticket') setDocumentType('ticket');
  }, [feApiKeyReady, documentType]);

  // Si eligieron Factura Electrónica y no hay cliente con cédula, se revierte a
  // tiquete electrónico (la factura exige receptor identificado por Hacienda).
  useEffect(() => {
    if (documentType === 'factura_electronica' && !selectedCustomer?.identification) {
      setDocumentType('tiquete_electronico');
    }
  }, [documentType, selectedCustomer]);

  // Cliente para la factura en curso — reusamos el del tab activo así viaja
  // junto con la pestaña cuando el cajero cambia entre ventas en espera.
  const customerName    = tabCustomerName;
  const setCustomerName = setTabCustomerName;
  // Bump cuando se completa un cobro, para que POSDesktopBar re-lea el peek.
  const [invoiceCounterKey, setInvoiceCounterKey] = useState(0);
  const [cashMovement, setCashMovement] = useState<'in' | 'out' | null>(null);
  const [showDisplayTest, setShowDisplayTest] = useState(false);

  // Load tax settings — with offline cache fallback
  // Usar el MISMO cache key que useSettings('general') para que se sincronice
  useEffect(() => {
    if (!tenantId) return;
    const ck = cacheKey(tenantId, 'settings_general');
    const ckOld = cacheKey(tenantId, 'general_settings'); // legacy

    const applyConfig = (cfg: any) => {
      if (!cfg) return;
      // taxEnabled — explicitly check for false (default true)
      if (cfg.taxEnabled === false || cfg.taxEnabled === true) {
        setTaxEnabled(cfg.taxEnabled);
      }
      // Apertura/cierre de caja — default activo; solo false si está explícito.
      setCashEnabled(cfg.cashManagementEnabled !== false);
      if (typeof cfg.taxPercentage === 'number' && cfg.taxPercentage >= 0)
        setTaxRate(cfg.taxPercentage / 100);
      // Precios con IVA en pantalla. Solo presentación: activo salvo que se
      // apague a propósito (los negocios viejos no tienen el campo guardado).
      setShowPricesWithTax(cfg.showPricesWithTax !== false);
    };

    // Apply cached config immediately
    const cached = cacheGet<any>(ck) ?? cacheGet<any>(ckOld);
    if (cached) applyConfig(cached);

    // Config de comisiones de delivery (Ajustes → Delivery).
    apiFetch<any>('/settings/delivery').then(r => {
      const c = r?.config ?? r;
      if (c) setDeliveryCommissions({
        Uber: Number(c.uber_pct ?? 0), Didi: Number(c.didi_pct ?? 0),
        PedidosYa: Number(c.pedidosya_pct ?? 0), Otro: Number(c.otro_pct ?? 0),
      });
    }).catch(() => {});

    if (!navigator.onLine) return;

    // API returns the config object directly (not wrapped in { config: ... })
    apiFetch<any>('/settings/general')
      .then((cfg) => {
        if (!cfg) return;
        // Support both wrapped and unwrapped responses
        const actualCfg = cfg.config ?? cfg;
        applyConfig(actualCfg);
        cacheSet(ck, actualCfg);
      })
      .catch(() => {/* ignore — cached config is already applied */});
  }, [tenantId]);

  // Caja desactivada: abrimos una sesión silenciosa (monto 0) si no hay una
  // abierta, para que las ventas funcionen sin apertura/cierre manual.
  const silentOpenRef = useRef(false);
  useEffect(() => {
    if (cashEnabled || sessionLoading) return;
    if (currentSession?.status === 'open') return;
    if (silentOpenRef.current) return;
    silentOpenRef.current = true;
    (async () => {
      try {
        if (isOnline) {
          await createCashSession({
            tenant_id: tenantId!, user_id: user?.id ?? '',
            opening_amount: 0, notes: 'Caja automática (apertura/cierre desactivados)',
          });
          await refetchSession();
        } else {
          // Sin conexión: abrir una sesión LOCAL (UUID válido) para que el POS
          // funcione igual — fast keys, cobro offline e impresión. Se sincroniza y
          // remapea a la sesión real del servidor al reconectar.
          const cached = posOfflineService.getCachedSession();
          if (!cached || cached.status !== 'open') {
            const { cashSessionOfflineService } = await import('@/services/cashManagement/cashSessionOfflineService');
            const local = await cashSessionOfflineService.queueOpenSession({
              tenant_id: tenantId!, user_id: user?.id ?? '',
              opening_amount: 0, notes: 'Caja automática offline',
            } as any);
            posOfflineService.cacheSession(local);
            await refetchSession();
          }
        }
      } catch { /* ignore */ }
      finally { silentOpenRef.current = false; }
    })();
  }, [cashEnabled, sessionLoading, currentSession, isOnline, refetchSession, tenantId, user]);

  // Keep pending invoice count up to date
  const refreshPendingCount = useCallback(async () => {
    const count = await posOfflineService.getPendingCount();
    setPendingInvoices(count);
  }, []);

  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount]);

  // Auto-sync queued invoices when coming back online
  const syncOfflineInvoices = useCallback(async () => {
    const count = await posOfflineService.getPendingCount();
    if (count === 0) return;

    setSyncing(true);
    try {
      const result = await posOfflineService.syncPendingInvoices(async (inv: OfflineInvoicePayload) => {
        // Use the mapped session ID if it was created offline, otherwise use the stored ID
        const sessionIdToUse = posOfflineService.mapOfflineSessionId(inv.sessionId);

        // Provide safe defaults for invoices queued before the payment fields were added.
        // - Cash: if amountReceived is missing, assume exact payment (total paid).
        // - Card/SINPE: if voucherNumber is missing, use 'OFFLINE' as placeholder.
        const amountReceived =
          inv.paymentMethod === 'cash'
            ? (inv.amountReceived ?? inv.total)
            : undefined;

        const voucherNumber =
          inv.paymentMethod === 'card' || inv.paymentMethod === 'sinpe'
            ? (inv.voucherNumber ?? 'OFFLINE')
            : undefined;

        // Reconstruye la venta con TODOS sus datos (cliente, moneda, delivery,
        // descuentos, pagos mixtos) para que la factura sincronizada sea idéntica.
        const created = await invoicesService.createInvoice(
          inv.tenantId,
          sessionIdToUse,
          inv.cartItems,
          inv.subtotal,
          inv.discountAmount ?? 0,
          inv.discountPercent ?? 0,
          inv.taxAmount,
          inv.total,
          inv.paymentMethod,
          inv.customerName,
          inv.notes,
          undefined,
          amountReceived,
          inv.changeAmount ?? 0,
          voucherNumber,
          inv.invoiceNumber, // consecutivo local (el backend igual reasigna)
          inv.cashierId ?? null,
          inv.cashierName ?? null,
          inv.payments ?? null,
          inv.documentType ?? 'ticket',
          inv.customerId ?? null,
          inv.currencyInfo,
        );

        // Comprobante ELECTRÓNICO hecho offline: emitir a Hacienda ahora (al
        // reconectar). Best-effort: si falla la emisión, la venta ya quedó guardada
        // y se puede reintentar desde la bitácora FE — no rompemos el sync.
        const isElec = inv.documentType === 'factura_electronica' || inv.documentType === 'tiquete_electronico';
        if (isElec && (created as any)?.id) {
          try {
            const { haciendaService } = await import('@/services/hacienda/haciendaService');
            await haciendaService.emit((created as any).id);
          } catch (e) {
            console.warn('[sync FE] no se pudo emitir a Hacienda (se reintenta luego):', e);
          }
        }
      });

      await refreshPendingCount();

      if (result.synced > 0) {
        setSuccess(`${result.synced} factura(s) sincronizada(s) correctamente`);
      }

      if (result.errors > 0 && result.details.length > 0) {
        // Show the first real error message to help diagnose
        const firstError = result.details[0].message;
        setError(
          `${result.errors} factura(s) no pudieron sincronizarse: ${firstError}` +
          (result.details.length > 1 ? ` (+${result.details.length - 1} más)` : '')
        );
      }
    } finally {
      setSyncing(false);
    }
  }, [refreshPendingCount]);

  // Sincronización de la JORNADA completa: aperturas → ventas → anulaciones →
  // CIERRES, en ese orden, reintentando sola hasta que vuelva el internet. El
  // cierre va al final a propósito: si sube antes que las ventas, la caja queda
  // cerrada en el servidor sin los movimientos del día. Ver offlineDaySync.ts.
  const daySync = useOfflineDaySync(tenantId, async () => {
    await syncOfflineInvoices();
  });

  // Force re-render when session closes in offline mode
  useEffect(() => {
    if (forceRefresh > 0) {
    }
  }, [forceRefresh, currentSession]);


  // Mantén el contador de pendientes actualizado por eventos en vez de polling.
  // Se dispara `pos-pending-changed` desde posOfflineService cuando cambia la
  // cola, y también recontamos al volver online o al recibir el foco.
  useEffect(() => {
    const countPending = async () => {
      const count = await posOfflineService.getPendingCount();
      setPendingInvoices(count);
    };
    countPending();

    const onChanged = () => { countPending(); };
    const onOnline  = () => { countPending(); };
    const onFocus   = () => { countPending(); };

    window.addEventListener('pos-pending-changed', onChanged);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('pos-pending-changed', onChanged);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Redondeo a 2 decimales (evita ruido de coma flotante). El POS ahora muestra
  // decimales en el carrito, así que los precios/subtotales conservan los céntimos.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const subtotal = round2(cartItems.reduce((sum, item) => sum + item.subtotal, 0));
  // IVA por producto (usa el iva_rate de cada producto; si no tiene, el IVA global).
  // Desglosado por tasa para mostrar cada IVA por separado en el carrito.
  const { taxAmount, taxBreakdown } = (() => {
    if (!taxEnabled) return { taxAmount: 0, taxBreakdown: {} as Record<number, number> };
    const bd: Record<number, number> = {};
    let total = 0;
    for (const item of cartItems) {
      const raw = (item.product as any).iva_rate;
      const ratePct = raw != null && raw !== '' ? Number(raw) : taxRate * 100;
      const t = round2(item.subtotal * (ratePct / 100));
      if (t !== 0 || ratePct > 0) bd[ratePct] = (bd[ratePct] ?? 0) + t;
      total += t;
    }
    return { taxAmount: round2(total), taxBreakdown: bd };
  })();
  // Combos / grupos de promos — descuento a nivel carrito (varios productos juntos
  // por un precio único o un % de descuento).
  const { discount: comboDiscount, applied: appliedCombos } = computeCartCombos(
    cartItems.map(it => ({ product_id: it.product_id, unit_price: it.unit_price, quantity: it.quantity })),
    activePromotions,
  );
  // Total. En comprobantes ELECTRÓNICOS va exacto (Hacienda exige que el total =
  // suma de líneas + IVA). En tiquetes corrientes se redondea a múltiplos de ₡10
  // (ya no circulan monedas de ₡5). Los productos con "precio cerrado" ya vienen
  // pensados para dar múltiplos de 10, así que en electrónico también cuadra.
  const rawTotal = Math.max(0, subtotal + taxAmount - comboDiscount);
  // Total COBRADO a múltiplos de ₡10 SIEMPRE (ya no circulan ₡5), corriente y
  // electrónico. En electrónico, el COMPROBANTE que va a Hacienda se arma de las
  // líneas (total exacto = suma + IVA); la diferencia de ≤₡10 es redondeo de caja.
  const total = Math.round(rawTotal / 10) * 10;
  const roundingAdjust = round2(total - rawTotal);

  // ── Atajos de teclado estilo Eleventa ─────────────────────────────────
  // F12 = Cobrar · F4 = Anular · Esc = Cerrar modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+P: producto rápido (ad-hoc) al carrito. Va ANTES del guard de inputs
      // y bloquea la impresión del navegador.
      if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        if (currentSession?.status === 'open') setShowQuickProduct(true);
        return;
      }
      // F6: nueva venta en espera (pestaña). Va antes del guard de inputs porque
      // el campo de captura del POS siempre tiene el foco.
      if (e.key === 'F6') {
        e.preventDefault();
        if (!document.body.dataset.posModal) newTab();
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'F12') {
        e.preventDefault();
        if (cartItems.length > 0 && currentSession?.status === 'open') {
          setShowPaymentModal(true);
        }
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (currentSession) setShowVoidModal(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cartItems.length, currentSession, newTab]);

  // Pre-cargar configuración de impresión y conexión QZ Tray
  // para que el primer cobro sea instantáneo
  useEffect(() => {
    if (!tenantId) return;
    posPrinterService.loadReceiptConfig(tenantId)
      .then(cfg => {
        setEnabledPays((cfg as any).paymentMethods ?? ['cash', 'card', 'sinpe', 'credit', 'mixed']);
        setPrinterType(cfg.printerType);
      })
      .catch(() => {});
    import('@/services/pos/qzTrayService').then(({ qzConnect, qzIsAvailable }) => {
      qzIsAvailable().then(available => {
        if (available) qzConnect().catch(() => {});
      });
    });
  }, [tenantId]);

  // Al seleccionar/cambiar el cliente, cargar sus precios especiales.
  useEffect(() => {
    let active = true;
    (async () => {
      // Precios personalizados desactivados en el plan → no cargar (precio normal).
      if ((planFeatures as any)?.customer_prices === false) { setCustomerPrices({}); return; }
      if (!selectedCustomer) { setCustomerPrices({}); return; }
      try {
        const { customerPricesService } = await import('@/services/customers/customerPricesService');
        const map = await customerPricesService.mapForCustomer(selectedCustomer.id);
        if (active) setCustomerPrices(map);
      } catch { if (active) setCustomerPrices({}); }
    })();
    return () => { active = false; };
  }, [selectedCustomer, planFeatures]);

  // Saldo de crédito del cliente seleccionado (cuentas por cobrar pendientes).
  const [creditBalance, setCreditBalance] = useState(0);
  useEffect(() => {
    let active = true;
    (async () => {
      // El crédito depende del plan (accounts_receivable) + un cliente seleccionado.
      if (!planFeatures.accounts_receivable || !selectedCustomer) { setCreditBalance(0); return; }
      try {
        const { accountsReceivableService } = await import('@/services/accountsReceivable/accountsReceivableService');
        const rows = await accountsReceivableService.list({ customer_id: selectedCustomer.id });
        const bal = (rows ?? []).reduce((s, r) => s + (Number(r.total_amount) - Number(r.paid_amount)), 0);
        if (active) setCreditBalance(bal);
      } catch { if (active) setCreditBalance(0); }
    })();
    return () => { active = false; };
  }, [selectedCustomer, planFeatures.accounts_receivable]);

  // Precio efectivo de un producto: en modo Delivery usa el precio delivery (si
  // tiene); si no, el precio especial del cliente o el normal.
  const priceFor = (product: Product): number => {
    if (isDeliveryMode) {
      const dp = Number((product as any).delivery_price ?? 0);
      if (dp > 0) return dp;
    }
    return customerPrices[product.id] ?? product.unit_price;
  };

  // Re-precificar el carrito cuando cambian los precios del cliente o el modo.
  useEffect(() => {
    setCartItems(prev => prev.map(item => {
      const dp = Number((item.product as any)?.delivery_price ?? 0);
      const base = (isDeliveryMode && dp > 0)
        ? dp
        : (customerPrices[item.product_id] ?? item.product?.unit_price ?? item.unit_price);
      if (round2(base) === item.unit_price) return item;
      const subtotal = round2(item.promo
        ? calcPromoSubtotal(base, item.quantity, item.promo as any)
        : item.quantity * base * (1 - (item.discount_percent ?? 0) / 100));
      return { ...item, unit_price: round2(base), subtotal };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerPrices, isDeliveryMode]);

  // Quita TODOS los productos de favoritos desde el POS (botón en Favoritos).
  const handleClearFavorites = async () => {
    const favs = products.filter(p => (p as any).is_favorite);
    if (favs.length === 0) return;
    try {
      await Promise.all(favs.map(p =>
        apiFetch(`/products/${p.id}`, { method: 'PUT', body: JSON.stringify({ is_favorite: false }) })
      ));
    } catch { /* si alguno falla, se refresca igual con lo que sí cambió */ }
    refetchProducts();
  };

  const handleAddToCart = (product: Product, quantity: number = 1, mods?: SelectedModifier[], note?: string) => {
    // Con MODIFICADORES la línea es única aunque el producto se repita: un casado
    // "sin cebolla" y otro "con extra queso" no se pueden fusionar ni comparten
    // precio. Se agrega como línea propia, con su unitario ya ajustado.
    if ((mods && mods.length > 0) || note) {
      const extra = (mods ?? []).reduce((sum, m) => sum + Number(m.price_delta || 0), 0);
      const unit = round2(priceFor(product) + extra);
      setCartItems(prev => [...prev, {
        product_id: product.id,
        product,
        quantity,
        unit_price: unit,
        subtotal: round2(unit * quantity),
        modifiers: mods,
        // La nota es lo que ve la cocina en la comanda y el cliente en el ticket:
        // extras elegidos + lo que se escribió a mano («sin cebolla»).
        notes: [(mods ?? []).map(m => m.name).join(', '), note].filter(Boolean).join(' · ') || undefined,
      } as any]);
      return;
    }

    const promo = getProductPromotion(
      product.id,
      (product as any).category_id ?? (product as any).category?.id ?? null,
      activePromotions,
    );
    const base = priceFor(product);   // precio especial del cliente o normal
    setCartItems(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        const newQty = existing.quantity + quantity;
        const subtotal = round2(promo
          ? calcPromoSubtotal(existing.unit_price, newQty, promo)
          : newQty * existing.unit_price);
        return prev.map(item =>
          item.product_id === product.id
            ? { ...item, quantity: newQty, subtotal }
            : item
        );
      }
      const subtotal = round2(promo
        ? calcPromoSubtotal(base, quantity, promo)
        : base * quantity);
      return [...prev, {
        product_id: product.id,
        product,
        quantity,
        unit_price: round2(base),
        subtotal,
        promo: promo
          ? {
              id: promo.id, name: promo.name, type: promo.type, value: promo.value,
              // La promo por cantidad necesita el tamaño del paquete para
              // recalcular el subtotal cuando cambia la cantidad en el carrito.
              bundle_qty: promo.bundle_qty ?? null,
            }
          : undefined,
      }];
    });
  };

  // Producto rápido/ad-hoc (Ctrl+P): se agrega al carrito sin estar en el catálogo.
  // Lleva un id único de cliente para las operaciones del carrito y `is_adhoc` para
  // que al facturar se envíe con product_id=null y el nombre en product_name.
  const handleAddQuickProduct = (name: string, price: number, quantity: number, ivaRate: number) => {
    const synthetic = {
      id: (globalThis.crypto?.randomUUID?.() ?? `quick-${Date.now()}-${Math.round(Math.random() * 1e6)}`),
      name,
      unit_price: round2(price),
      iva_rate: ivaRate,
      stock_quantity: 0,
      tracks_stock: false,
      tenant_id: tenantId ?? '',
      is_adhoc: true,
    } as any;
    handleAddToCart(synthetic, quantity);
  };

  const handleRemoveFromCart = (productId: string) =>
    setCartItems(prev => prev.filter(item => item.product_id !== productId));

  const handleChangeQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(productId);
    } else {
      setCartItems(prev =>
        prev.map(item => {
          if (item.product_id !== productId) return item;
          let subtotal: number;
          if (item.promo) {
            subtotal = round2(calcPromoSubtotal(item.unit_price, quantity, item.promo as any));
          } else {
            subtotal = round2(quantity * item.unit_price * (1 - (item.discount_percent ?? 0) / 100));
          }
          return { ...item, quantity, subtotal };
        })
      );
    }
  };

  // Cargar config general (cacheada) para leer maxDiscountPercent.
  const generalCfgCached = (() => {
    try {
      const cached = cacheGet<any>(cacheKey(tenantId ?? '', 'settings_general'))
                  ?? cacheGet<any>(cacheKey(tenantId ?? '', 'general_settings'));
      return cached?.config ?? cached;
    } catch { return null; }
  })();
  // Tope de descuento del negocio. Se respeta para todos los roles.
  const maxDiscountPercent: number = generalCfgCached?.maxDiscountPercent ?? 100;

  // El cajón se abre con un pulso ESC/POS por la impresora: sirve tanto por
  // Bluetooth como por QZ Tray / térmica. Con impresión por navegador no hay
  // canal para bytes crudos, así que ahí el botón no se muestra.
  const canOpenDrawer = printerType === 'bluetooth'
    || printerType === 'qztray'
    || printerType === 'thermal';

  const handleOpenDrawer = async () => {
    if (!tenantId) return;
    try {
      const opened = await posPrinterService.openCashDrawer(tenantId);
      if (!opened) {
        setError('No se pudo abrir la caja. Revisá que la impresora esté encendida y conectada.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el cajón');
    }
  };

  // Nota por línea (comidas: "sin cebolla", "para llevar"). Viaja con el item
  // hasta la factura y sale impresa en el tiquete.
  const handleSetItemNotes = (productId: string, notes: string) => {
    setCartItems(prev => prev.map(item =>
      item.product_id === productId ? { ...item, notes: notes.trim() || undefined } : item));
  };

  const handleApplyDiscount = (productId: string, discount_percent: number) => {
    const cap = Math.max(0, Math.min(100, maxDiscountPercent));
    let pct = Math.max(0, Math.min(100, discount_percent));
    // El tope configurado se respeta para TODOS los roles (incluido el dueño).
    if (pct > cap) {
      pct = cap;
      setError(`Descuento limitado al ${cap}% por configuración del negocio.`);
    }
    setCartItems(prev =>
      prev.map(item =>
        item.product_id === productId
          ? { ...item, discount_percent: pct, subtotal: round2(item.quantity * item.unit_price * (1 - pct / 100)) }
          : item
      )
    );
  };

  const printReceipt = useCallback(async (
    invoiceNumber: string,
    items: CartItem[],
    sub: number,
    tax: number,
    tot: number,
    paymentMethod: string,
    customerName?: string,
    payments?: { method: 'cash' | 'card' | 'sinpe'; amount: number; voucher_number?: string }[],
    fe?: { clave?: string; consecutivo?: string; tipoLabel?: string; qrDataUrl?: string; qrContent?: string; customerEmail?: string },
    rounding: number = 0,
    currencyInfo?: { currency?: 'CRC' | 'USD'; exchangeRate?: number; amountReceived?: number; change?: number; changeCurrency?: 'CRC' | 'USD'; isDelivery?: boolean; deliveryCommissionPct?: number; deliveryNet?: number; deliveryPlatform?: string; bipper?: string },
  ) => {
    if (!tenantId) return;
    try {
      // Cache de settings — sin esperar API (mismo key que useSettings)
      const cachedGeneral = cacheGet<any>(cacheKey(tenantId, 'settings_general'))
                          ?? cacheGet<any>(cacheKey(tenantId, 'general_settings'));
      let general = cachedGeneral?.config ?? cachedGeneral;
      // Config de Facturación Electrónica (cacheada) — para el régimen simplificado
      const cachedFe = cacheGet<any>(cacheKey(tenantId, 'settings_electronic-invoice'))
                      ?? cacheGet<any>(cacheKey(tenantId, 'electronic-invoice'));
      let feConfig = cachedFe?.config ?? cachedFe;

      // Fetch fresco de los settings (el cache puede estar viejo). Si online,
      // sobrescribe; si falla, usamos lo cacheado.
      try {
        const { apiFetch } = await import('@/lib/api');
        const [g, fe] = await Promise.all([
          apiFetch<any>('/settings/general').catch(() => null),
          apiFetch<any>('/settings/electronic-invoice').catch(() => null),
        ]);
        if (g)  general  = g.config ?? g ?? general;
        if (fe) feConfig = fe.config ?? fe ?? feConfig;
      } catch { /* offline → cache */ }

      // Régimen simplificado puede setearse desde el Admin (settings.electronic-invoice)
      // o desde Settings Generales (general.simplificado). Cualquiera vale.
      const simplificadoFooter = !!(feConfig?.simplificado || general?.simplificado);
      const now = new Date();

      // Receipt
      const receiptData = {
        invoiceNumber,
        date: now.toLocaleDateString('es-CR'),
        time: now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
        items: items.map(item => ({
          name: item.product.name,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          subtotal: item.subtotal,
          notes: item.notes,
        })),
        subtotal: sub,
        tax,
        total: tot,
        // Combos (sin el redondeo): sub+IVA−tot = combo − rounding → combo = (sub+IVA−tot) + rounding.
        discount: Math.round((sub + tax - tot) + rounding),
        discountLabel: 'Combos',
        // Redondeo a ₡10 (positivo = se sumó, negativo = se restó).
        rounding: Math.round(rounding),
        paymentMethod: PAYMENT_METHOD_LABELS[paymentMethod] ?? paymentMethod,
        bipper: currencyInfo?.bipper || undefined,   // localizador para el ticket
        // Datos del local (sin email)
        storeName: general?.businessName,
        storeRuc: general?.ruc,
        storeCedula: general?.cedula,
        storeAddress: general?.address,
        storeCity: general?.city,
        storePhone: general?.phone,
        // "Atendido por": preferimos el alias de ticket (control interno); si no,
        // el nombre real; en último caso el email.
        cashierName: activeCashier?.ticket_alias || activeCashier?.full_name
                  || (user as any)?.ticket_alias || user?.full_name || user?.email || undefined,
        customerName,
        simplificadoFooter,
        payments,
        // Datos del comprobante electrónico (si se emitió a Hacienda).
        feClave: fe?.clave,
        feConsecutivo: fe?.consecutivo,
        feTipoLabel: fe?.tipoLabel,
        feQrDataUrl: fe?.qrDataUrl,
        feQrContent: fe?.qrContent,
        customerEmail: fe?.customerEmail,
        // Multimoneda (cobro en dólares).
        currency: currencyInfo?.currency,
        exchangeRate: currencyInfo?.exchangeRate,
        amountReceived: currencyInfo?.amountReceived,
        change: currencyInfo?.change,
        changeCurrency: currencyInfo?.changeCurrency,
        // Delivery (informativo en el ticket — no se contabiliza en caja).
        isDelivery: currencyInfo?.isDelivery,
        deliveryCommissionPct: currencyInfo?.deliveryCommissionPct,
        deliveryNet: currencyInfo?.deliveryNet,
        deliveryPlatform: currencyInfo?.deliveryPlatform,
      };

      const dblMethods = (await posPrinterService.loadReceiptConfig(tenantId).catch(() => null) as any)?.doubleInvoiceMethods ?? ['credit'];
      if (dblMethods.includes(paymentMethod)) {
        // Doble factura (copia para el cliente y para el vendedor).
        await posPrinterService.printAuto({ ...receiptData, copyLabel: 'ORIGINAL - CLIENTE' }, tenantId);
        await posPrinterService.printAuto({ ...receiptData, copyLabel: 'COPIA - VENDEDOR' }, tenantId);
      } else {
        await posPrinterService.printAuto(receiptData, tenantId);
      }

      // Comandas (fire-and-forget — non-blocking)
      posPrinterService.printComandas(
        invoiceNumber,
        items.map(item => ({ name: item.product.name, quantity: item.quantity })),
        tenantId,
        customerName,
      ).catch(err => console.warn('Error al imprimir comanda:', err));

    } catch (err) {
      console.error('[printReceipt] error:', err);
      setError(`Error al imprimir: ${err instanceof Error ? err.message : 'desconocido'}`);
    }
  }, [tenantId, user, activeCashier]);

  // Pre-ticket / proforma: imprime el carrito SIN cobrar (documento no fiscal).
  const printPreTicket = useCallback(async () => {
    if (!tenantId || cartItems.length === 0) return;
    try {
      const now = new Date();
      await posPrinterService.printAuto({
        invoiceNumber: 'PRE-TICKET',
        date: now.toLocaleDateString('es-CR'),
        time: now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
        items: cartItems.map(it => ({ name: it.product.name, quantity: it.quantity, unitPrice: it.unit_price, subtotal: it.subtotal, notes: it.notes })),
        subtotal, tax: taxAmount, total,
        paymentMethod: 'PROFORMA',
        customerName: selectedCustomer?.name,
        copyLabel: 'PRE-TICKET - NO ES FACTURA',
        footerMessage: 'Documento no fiscal',
      } as any, tenantId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo imprimir el pre-ticket');
    }
  }, [tenantId, cartItems, subtotal, taxAmount, total, selectedCustomer]);

  // Guardar el carrito actual como PROFORMA (cotización) para pasarla a venta luego.
  const saveProforma = useCallback(async () => {
    if (!tenantId || cartItems.length === 0) { setError('Agregá productos para guardar la proforma'); return; }
    try {
      const pf = await proformasService.create({
        customer_id: selectedCustomer?.id ?? null,
        customer_name: selectedCustomer?.name ?? null,
        customer_identification: (selectedCustomer as any)?.identification ?? null,
        items: cartItems.map(it => ({
          product_id: it.product_id, name: it.product.name, sku: (it.product as any).sku ?? null,
          quantity: it.quantity, unit_price: it.unit_price,
          iva_rate: Number((it.product as any).iva_rate ?? 13),
          cabys: (it.product as any).cabys_code ?? null,
        })),
      });
      setSuccess(`Proforma ${pf.number} guardada — la ves en el módulo Proformas`);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la proforma'); }
  }, [tenantId, cartItems, selectedCustomer]);

  const handlePaymentConfirm = async (data: PaymentData) => {
    if (!tenantId || !currentSession) {
      setError('Sesión de caja no disponible');
      return;
    }

    if (currentSession.status !== 'open') {
      setError('La caja está cerrada. Debes abrir una nueva sesión para continuar.');
      return;
    }

    // Aviso de cuota agotada (pantalla emergente) antes de cobrar un electrónico.
    if (documentType === 'factura_electronica' || documentType === 'tiquete_electronico') {
      const { confirmFeQuota } = await import('@/services/hacienda/feQuotaGuard');
      if (!(await confirmFeQuota())) return;
    }

    // La caja de dinero se abre SIEMPRE que entre efectivo, se imprima o no.
    // Antes el pulso viajaba pegado al recibo: cobrar "sin imprimir" dejaba la
    // caja cerrada y el cajero tenía que abrirla con la llave para dar el vuelto.
    const entraEfectivo = data.paymentMethod === 'cash'
      || (data.payments ?? []).some((p: any) => p.method === 'cash' && Number(p.amount) > 0);
    if (data.skipPrint && entraEfectivo) {
      void posPrinterService.openCashDrawer(tenantId);
    }

    setPaymentLoading(true);
    // Notas: comprobante (voucher) + bipper/localizador si se asignó.
    const notes = [
      data.voucherNumber ? `Comprobante: ${data.voucherNumber}` : '',
      bipper.trim() ? `Bipper: ${bipper.trim()}` : '',
    ].filter(Boolean).join(' · ') || undefined;

    // Snapshot del carrito para imprimir después (al limpiar inmediatamente)
    const bipperSnapshot = bipper.trim();
    const cartSnapshot = [...cartItems];
    const subSnapshot = subtotal;
    const taxSnapshot = taxAmount;
    const totSnapshot = total;
    const roundSnapshot = roundingAdjust;
    const customerEmailSnapshot = selectedCustomer?.email ?? undefined;
    const offlineCustomer = customerName.trim() || undefined;

    // ── Helper: guardar la venta OFFLINE (cola) + imprimir. Se usa en la rama sin
    // conexión Y como FALLBACK cuando el cobro online falla por RED (backend caído/
    // timeout) — así SIEMPRE imprime y NUNCA se pierde la venta. ────────────────
    const doOfflineSale = async () => {
      const invoiceNumber = await posOfflineService.queueInvoice({
        tenantId,
        sessionId: currentSession.id,
        cartItems,
        subtotal,
        taxAmount,
        total,
        paymentMethod: data.paymentMethod,
        amountReceived: data.amountReceived,
        changeAmount: data.change,
        voucherNumber: data.voucherNumber,
        notes,
        customerName: offlineCustomer,
        customerId: selectedCustomer?.id ?? null,
        cashierId: activeCashier?.id ?? null,
        cashierName: activeCashier?.full_name ?? null,
        documentType,
        discountAmount: 0,
        discountPercent: 0,
        payments: data.payments ?? null,
        currencyInfo: {
          currency: data.currency, exchangeRate: data.exchangeRate, changeCurrency: data.changeCurrency,
          isDelivery: data.isDelivery, deliveryCommissionPct: data.deliveryCommissionPct, deliveryPlatform: data.deliveryPlatform,
          deliveryNet: data.isDelivery ? Math.round(totSnapshot * (1 - (data.deliveryCommissionPct ?? 0) / 100)) : undefined,
        },
      } as any);

      resetActive();
      setBipper('');
      setShowPaymentModal(false);
      setCartOpen(false);
      setPaymentLoading(false);
      const isElec = documentType === 'factura_electronica' || documentType === 'tiquete_electronico';
      setSuccess(`Venta guardada sin conexión (${invoiceNumber})${isElec ? ' — se emitirá a Hacienda' : ''} — se sincroniza al reconectar`);
      if (tableOrderToClose.current) {
        // Offline: la cuenta se cierra sin invoice_id (la factura aún no existe arriba).
        void closeTableOrder(tableOrderToClose.current.id, null);
        tableOrderToClose.current = null;
      }
      if (agentOrderToClose.current) {
        void chargeAgentOrder(agentOrderToClose.current.id, null, totSnapshot);
        agentOrderToClose.current = null;
      }
      if (proformaToConvert.current) {
        proformasService.convert(proformaToConvert.current, invoiceNumber).catch(() => {});
        proformaToConvert.current = null;
      }
      posOfflineService.addCachedInvoice({
        id: invoiceNumber, invoice_number: invoiceNumber, issued_at: localNowISO(),
        total: totSnapshot, payment_method: data.paymentMethod,
      });
      refreshPendingCount();
      if (!data.skipPrint) printReceipt(invoiceNumber, cartSnapshot, subSnapshot, taxSnapshot, totSnapshot, data.paymentMethod, offlineCustomer, data.payments ?? undefined, undefined, roundSnapshot, { currency: data.currency, exchangeRate: data.exchangeRate, amountReceived: data.amountReceived, change: data.change, changeCurrency: data.changeCurrency, isDelivery: data.isDelivery, deliveryCommissionPct: data.deliveryCommissionPct, deliveryNet: data.isDelivery ? Math.round(totSnapshot * (1 - (data.deliveryCommissionPct ?? 0) / 100)) : undefined, deliveryPlatform: data.deliveryPlatform, bipper: bipperSnapshot });
      setInvoiceCounterKey(k => k + 1);
    };

    try {
      if (isOnline) {
       try {
        // ── Online: create invoice directly ──────────────────────────────────
        // Generar número con formato 000000 (sin fecha, solo consecutivo)
        const invNum = generateInvoiceNumber();
        const invoice = await invoicesService.createInvoice(
          tenantId,
          currentSession.id,
          cartItems,
          subtotal,
          0,
          0,
          taxAmount,
          total,
          data.paymentMethod,
          customerName.trim() || undefined,
          notes,
          undefined,
          data.amountReceived,
          data.change,
          data.voucherNumber,
          invNum,
          activeCashier?.id ?? null,
          activeCashier?.full_name ?? null,
          data.payments ?? null,
          documentType,
          selectedCustomer?.id ?? null,
          { currency: data.currency, exchangeRate: data.exchangeRate, changeCurrency: data.changeCurrency,
            isDelivery: data.isDelivery, deliveryCommissionPct: data.deliveryCommissionPct, deliveryPlatform: data.deliveryPlatform,
            deliveryNet: data.isDelivery ? Math.round(total * (1 - (data.deliveryCommissionPct ?? 0) / 100)) : undefined },
        );

        // Limpiar UI INMEDIATAMENTE — resetActive vacía cart + cliente del tab
        // actual de una sola llamada (más limpio que setCartItems([]) + setCustomerName('')).
        resetActive();
        setBipper('');
        setShowPaymentModal(false);
        setCartOpen(false);
        setPaymentLoading(false);
        setLastInvoice(invoice);
        setPaymentData(data);
        setSuccess(`Pago procesado — Factura ${invoice.invoice_number}`);
        if (tableOrderToClose.current) {
          void closeTableOrder(tableOrderToClose.current.id, invoice.id);
          tableOrderToClose.current = null;
        }
        if (agentOrderToClose.current) {
          void chargeAgentOrder(agentOrderToClose.current.id, invoice.id, totSnapshot);
          agentOrderToClose.current = null;
        }
        if (proformaToConvert.current) {
          proformasService.convert(proformaToConvert.current, invoice.invoice_number).catch(() => {});
          proformaToConvert.current = null;
        }
        // Re-chequear la cuota de comprobantes (aviso de 50/20/10) tras emitir.
        if (documentType === 'factura_electronica' || documentType === 'tiquete_electronico') {
          setTimeout(() => window.dispatchEvent(new CustomEvent('fe:quota-changed')), 4000);
        }

        // Operaciones en background (no bloquean UI)
        posOfflineService.addCachedInvoice({
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          issued_at: (invoice as any).issued_at ?? invoice.created_at ?? localNowISO(),
          total: invoice.total,
          payment_method: invoice.payment_method,
        });

        // Emisión a Hacienda (Factura/Tiquete electrónico) al cobrar.
        let feData: { clave?: string; consecutivo?: string; tipoLabel?: string; qrDataUrl?: string; qrContent?: string; customerEmail?: string } | undefined;
        const isElectronic = documentType === 'factura_electronica' || documentType === 'tiquete_electronico';
        if (isElectronic) {
          try {
            setSuccess('Emitiendo comprobante a Hacienda…');
            const { haciendaService } = await import('@/services/hacienda/haciendaService');
            const res: any = await haciendaService.emit(invoice.id);
            if (res?.clave) {
              const esFactura = (res.tipo ?? (documentType === 'factura_electronica' ? '01' : '04')) === '01';
              // El consecutivo (20 díg) va embebido en la clave (pos 22-41) si
              // Facturemos no lo devuelve por separado.
              const consecFromClave = typeof res.clave === 'string' && res.clave.length === 50
                ? res.clave.slice(21, 41) : undefined;
              feData = {
                clave: res.clave,
                consecutivo: res.consecutivo ?? consecFromClave,
                tipoLabel: esFactura ? 'FACTURA ELECTRÓNICA' : 'TIQUETE ELECTRÓNICO',
                // En factura electrónica se muestra el correo al que se envió.
                customerEmail: esFactura ? customerEmailSnapshot : undefined,
                // QR oculto por ahora (no requerido aún).
              };
              setSuccess(`${esFactura ? 'Factura' : 'Tiquete'} electrónico ${invoice.invoice_number} emitido a Hacienda ✓`);
            } else {
              setSuccess(`Factura ${invoice.invoice_number} — comprobante en proceso`);
            }
          } catch (e) {
            console.error('[FE emit] Error al emitir a Hacienda:', e);
            setError(`Venta guardada, pero falló la emisión a Hacienda: ${e instanceof Error ? e.message : 'error'}`);
          }
        }

        if (!data.skipPrint) printReceipt(invoice.invoice_number, cartSnapshot, subSnapshot, taxSnapshot, totSnapshot, data.paymentMethod, invoice.customer_name ?? undefined, data.payments ?? undefined, feData, roundSnapshot, { currency: data.currency, exchangeRate: data.exchangeRate, amountReceived: data.amountReceived, change: data.change, changeCurrency: data.changeCurrency, isDelivery: data.isDelivery, deliveryCommissionPct: data.deliveryCommissionPct, deliveryNet: data.isDelivery ? Math.round(totSnapshot * (1 - (data.deliveryCommissionPct ?? 0) / 100)) : undefined, deliveryPlatform: data.deliveryPlatform, bipper: bipperSnapshot });
        setInvoiceCounterKey(k => k + 1);
        return;
       } catch (netErr) {
        // Falló el cobro online. Si es error de RED (backend caído/timeout) NO se pierde
        // la venta: la guardamos en la cola offline y se imprime igual. Si es un rechazo
        // real del servidor (validación), se propaga al catch externo y se muestra.
        const { isNetworkError, markBackendDown } = await import('@/services/connectivity/connectivityService');
        if (isNetworkError(netErr)) {
          markBackendDown();
          await doOfflineSale();
          return;
        }
        throw netErr;
       }
      } else {
        // ── Sin conexión: encolar (misma lógica que el fallback) ──────────────
        await doOfflineSale();
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error procesando el pago');
    } finally {
      setPaymentLoading(false);
    }
  };

  const isLoading = tenantLoading || sessionLoading || productsLoading;

  if (isLoading) {
    return <LoadingState message="Cargando POS..." />;
  }

  if (tenantError) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 text-lg font-bold mb-2">{tenantError}</p>
          <p className="text-gray-500 text-sm">Contacta al administrador</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`pos-root flex flex-col h-full bg-gray-50 overflow-hidden ${posViewMode === 'touch' ? 'pos-touch' : 'pos-desktop'} ${assisted ? 'pos-assisted' : ''}`}
      data-pos-view={posViewMode}
      data-assisted={assisted ? '1' : '0'}
    >
      <POSHeader
        isOnline={isOnline}
        error={error}
        success={success}
        pendingCount={pendingInvoices}
        syncing={syncing}
        productsCached={productsCached}
        productsCachedAt={productsCachedAt}
        currentSession={currentSession}
        onClearError={() => setError('')}
        onClearSuccess={() => setSuccess('')}
        hideCashSession={!cashEnabled}
        onOpenCash={() => setShowOpenModal(true)}
        onCloseCash={() => setShowCloseModal(true)}
        onVoidInvoice={(currentSession && canVoidInvoice) ? () => setShowVoidModal(true) : undefined}
        onReprintInvoice={() => setShowReprintModal(true)}
        onCashIn={currentSession?.status === 'open' ? () => setCashMovement('in') : undefined}
        onCashOut={currentSession?.status === 'open' ? () => setCashMovement('out') : undefined}
        onOpenDrawer={(canOpenDrawer && currentSession?.status === 'open') ? handleOpenDrawer : undefined}
        onSync={isOnline ? syncOfflineInvoices : undefined}
      />

      <POSDesktopBar
        showInvoicePreview={!!(planFeatures as any).pos_invoice_preview && posViewMode === 'desktop'}
        showCustomerField={true}
        customerName={customerName}
        onCustomerNameChange={setCustomerName}
        invoiceNumberRefreshKey={invoiceCounterKey}
        selectedCustomer={selectedCustomer}
        onCustomerPick={setSelectedCustomer}
        documentType={documentType}
        feApiKeyReady={feApiKeyReady}
        onDocumentTypeChange={(planFeatures as any)?.electronic_invoice ? setDocumentType : undefined}
        activeCashierName={activeCashier?.full_name ?? null}
        onChangeCashier={kioskEnabled ? () => setShowPinModal('switch') : undefined}
      />

      {/* ── Tabs de ventas en espera ──────────────────────────────────────── */}
      <POSTabs
        tabs={tabs}
        activeId={activeTabId}
        onSwitch={setActiveTabId}
        onNew={() => newTab()}
        onClose={closeTab}
        onRename={renameTab}
        computeTotal={(tab) => {
          const sub = tab.cartItems.reduce((s, i) => s + (i.subtotal ?? 0), 0);
          return sub + (taxEnabled ? sub * taxRate : 0);
        }}
      />

      {/* ── Barra de Total estilo Eleventa ──────────────────────────────────
           Se muestra en modo Asistido O en layout de Lista (ahí el carrito
           ocupa el centro, así que el total grande va arriba como banner).
           COMENTADO: banner "Total a cobrar" oculto (cambiar `false` por
           `(assisted || isListLayout)` para reactivarlo).  */}
      {false && (assisted || isListLayout) && (
        <div className="relative shrink-0 px-5 py-4 bg-linear-to-br from-slate-900 via-emerald-900 to-emerald-700 text-white shadow-[0_6px_18px_-6px_rgba(16,185,129,0.55)] border-b-2 border-emerald-400/40 overflow-hidden">
          {/* Decoración suave de fondo */}
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-emerald-300/10 blur-2xl" />

          <div className="relative flex items-center justify-between gap-4">
            {/* Lado izquierdo: detalles */}
            <div className="flex flex-col gap-1 min-w-0">
              <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-emerald-300/90">
                Total a cobrar
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs sm:text-sm text-emerald-100/90 font-semibold">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                  {cartItems.length} {cartItems.length === 1 ? 'artículo' : 'artículos'}
                </span>
                {taxEnabled && taxAmount > 0 && (
                  <>
                    <span className="text-emerald-300/40">·</span>
                    <span className="tabular-nums">Sub ₡{subtotal.toLocaleString('es-CR')}</span>
                    {taxBreakdown && Object.keys(taxBreakdown).length > 0 ? (
                      // Desglose de IVA: una etiqueta por cada tarifa.
                      Object.entries(taxBreakdown)
                        .sort((a, b) => Number(b[0]) - Number(a[0]))
                        .map(([rate, amt]) => (
                          <span key={rate} className="tabular-nums">
                            <span className="text-emerald-300/40 mr-2">·</span>
                            IVA {Number(rate) === 0 ? 'Exento' : `${Number(rate)}%`} ₡{Number(amt).toLocaleString('es-CR')}
                          </span>
                        ))
                    ) : (
                      <>
                        <span className="text-emerald-300/40">·</span>
                        <span className="tabular-nums">IVA ₡{taxAmount.toLocaleString('es-CR')}</span>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Lado derecho: monto gigante */}
            <div className="text-right shrink-0">
              <p
                className="font-black tabular-nums leading-none drop-shadow-[0_2px_8px_rgba(16,185,129,0.45)]"
                style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}
              >
                <span className="text-emerald-300 mr-1">₡</span>
                <span className="text-white">{total.toLocaleString('es-CR')}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className={`flex flex-1 overflow-hidden ${isListLayout ? 'flex-col' : 'flex-row'}`}>
        <POSProductsPanel
          // Extras solo en el POS de RESTAURANTE. En una tienda no aplican.
          enableModifiers={(planFeatures as any).restaurant === true}
          viewMode={posViewMode}
          searchTabsEnabled={!!(planFeatures as any).pos_search_tabs}
          filteredProducts={filteredProducts}
          allProducts={products}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          customerPrices={customerPrices}
          deliveryMode={isDeliveryMode}
          onAddToCart={handleAddToCart}
          onClearFavorites={handleClearFavorites}
          currentSession={currentSession}
          productsError={productsError}
          ignoreStock={!planFeatures.inventory || (planFeatures as any).inventory_products_only}
          activePromotions={activePromotions}
          taxEnabled={taxEnabled}
          taxRate={taxRate}
          showPricesWithTax={showPricesWithTax}
        />

        {/* Carrito inline — solo en pantallas grandes (lg+). En formato lista se le da
            altura acotada (flex-1 + min-h-0) para que el listado haga scroll y el botón
            de cobrar quede fijo abajo. */}
        <div className={isListLayout ? 'hidden lg:flex flex-1 min-h-0' : 'hidden lg:flex'}>
          <POSCartPanel
            cartItems={cartItems}
            subtotal={subtotal}
            taxAmount={taxAmount}
            total={total}
            comboDiscount={comboDiscount}
            appliedCombos={appliedCombos}
            roundingAdjust={roundingAdjust}
            taxEnabled={taxEnabled}
            taxRate={taxRate}
            taxBreakdown={taxBreakdown}
            showPricesWithTax={showPricesWithTax}
            currentSession={currentSession}
            cashDisabled={!cashEnabled}
            loading={paymentLoading}
            canDiscount={planFeatures.pos_discount && maxDiscountPercent > 0}
            maxDiscountPercent={maxDiscountPercent}
            onRemoveFromCart={handleRemoveFromCart}
            onChangeQuantity={handleChangeQuantity}
            onApplyDiscount={handleApplyDiscount}
            onSetItemNotes={handleSetItemNotes}
            onPayment={startCobro}
            onPreTicket={printPreTicket}
            onSaveProforma={saveProforma}
            expanded={isListLayout}
            deliveryEnabled={deliveryEnabled}
            saleMode={saleMode}
            onSaleModeChange={setSaleMode}
          />
        </div>
      </div>

      {/* Carrito como panel deslizable — teléfono/tablet (< lg) */}
      <div className={`lg:hidden fixed inset-0 z-40 ${cartOpen ? '' : 'pointer-events-none'}`}>
        <div className={`absolute inset-0 bg-black/40 transition-opacity ${cartOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setCartOpen(false)} />
        <div className={`absolute right-0 top-0 bottom-0 w-[90%] max-w-sm bg-white shadow-2xl flex flex-col transition-transform duration-200 ${cartOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <button onClick={() => setCartOpen(false)}
            className="absolute -left-12 top-3 w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center text-gray-600 z-10">
            <X size={20} />
          </button>
          <POSCartPanel
            cartItems={cartItems}
            subtotal={subtotal}
            taxAmount={taxAmount}
            total={total}
            comboDiscount={comboDiscount}
            appliedCombos={appliedCombos}
            roundingAdjust={roundingAdjust}
            taxEnabled={taxEnabled}
            taxRate={taxRate}
            taxBreakdown={taxBreakdown}
            showPricesWithTax={showPricesWithTax}
            currentSession={currentSession}
            cashDisabled={!cashEnabled}
            loading={paymentLoading}
            canDiscount={planFeatures.pos_discount && maxDiscountPercent > 0}
            maxDiscountPercent={maxDiscountPercent}
            onRemoveFromCart={handleRemoveFromCart}
            onChangeQuantity={handleChangeQuantity}
            onApplyDiscount={handleApplyDiscount}
            onSetItemNotes={handleSetItemNotes}
            onPayment={startCobro}
            onPreTicket={printPreTicket}
            onSaveProforma={saveProforma}
            expanded
            deliveryEnabled={deliveryEnabled}
            saleMode={saleMode}
            onSaleModeChange={setSaleMode}
          />
        </div>
      </div>

      {/* Botón flotante "Ver carrito" — teléfono/tablet, oculto cuando el panel está abierto */}
      {!cartOpen && (
        <button onClick={() => setCartOpen(true)}
          className="lg:hidden fixed bottom-4 right-4 z-30 flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-black px-5 py-3.5 rounded-full shadow-xl">
          <ShoppingBag size={20} />
          <span>Ver carrito</span>
          {cartItems.length > 0 && (
            <span className="bg-white text-emerald-700 text-sm font-black rounded-full min-w-6 h-6 px-1.5 flex items-center justify-center">
              {cartItems.length}
            </span>
          )}
          <span className="font-black">₡{total.toLocaleString()}</span>
        </button>
      )}

      {/* POSModals only handles the receipt now */}
      <POSModals
        showOpenModal={false}
        showCloseModal={false}
        showPaymentModal={false}
        showReceiptModal={false}
        currentSession={currentSession}
        user={user}
        cartItems={cartItems}
        subtotal={subtotal}
        taxAmount={taxAmount}
        total={total}
        lastInvoice={lastInvoice}
        paymentData={paymentData}
        onOpenModalClose={() => {}}
        onCloseModalClose={() => {}}
        onPaymentModalClose={() => setShowPaymentModal(false)}
        onReceiptModalClose={() => {}}
        onOpenCashSuccess={() => {}}
        onCloseCashSuccess={() => {}}
        onPaymentSuccess={() => {}}
        onPaymentError={setError}
      />

      {showOpenModal && tenantId && user && (
        <CashOpenModal
          tenantId={tenantId}
          userId={user.id}
          onSuccess={(session) => {
            setShowOpenModal(false);
            posOfflineService.cacheSession(session);
            refetchSession();
            setSuccess('Caja abierta correctamente');
          }}
          onCancel={() => setShowOpenModal(false)}
        />
      )}

      {showCloseModal && currentSession && (
        <CashCloseModal
          session={currentSession}
          onSuccess={async (closedSession) => {
            setShowCloseModal(false);
            posOfflineService.cacheSession(closedSession);

            // Refresh session to update currentSession state and force re-render
            await refetchSession();

            // Force a visual re-render by toggling forceRefresh
            setForceRefresh(prev => prev + 1);

            setSuccess('Caja cerrada correctamente');
          }}
          onCancel={() => setShowCloseModal(false)}
        />
      )}

      {showVoidModal && (
        <VoidInvoiceModal
          sessionId={currentSession?.id ?? null}
          onClose={() => setShowVoidModal(false)}
          onVoided={(invoiceNumber) => {
            setShowVoidModal(false);
            setSuccess(`Factura ${invoiceNumber} anulada correctamente`);
          }}
        />
      )}

      {showPinModal && (
        <POSPinLockModal
          forced={showPinModal === 'forced'}
          onSuccess={(c) => {
            setActiveCashier(c);
            setShowPinModal(null);
            setSuccess(`Cajero activo: ${c.full_name}`);
          }}
          onClose={() => setShowPinModal(null)}
        />
      )}

      {showReprintModal && (
        <ReprintInvoiceModal
          cashierName={user?.email ?? undefined}
          onClose={() => setShowReprintModal(false)}
        />
      )}

      {cashMovement && currentSession && tenantId && (
        <CashMovementModal
          sessionId={currentSession.id}
          tenantId={tenantId}
          initialType={cashMovement}
          onCancel={() => setCashMovement(null)}
          onSuccess={() => {
            setSuccess(`Movimiento de ${cashMovement === 'in' ? 'entrada' : 'salida'} registrado`);
            setCashMovement(null);
          }}
        />
      )}

      {/* Bipper: botón flotante para VER la lista de bippers de hoy */}
      {bipperEnabled && (
        <button onClick={() => setShowBipperList(true)}
          title="Ver la lista de bippers de hoy"
          className="fixed bottom-4 left-4 z-30 inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-full shadow-lg text-sm font-black bg-white text-amber-700 border border-amber-300 hover:bg-amber-50">
          🔔 Bippers
        </button>
      )}
      {/* Al cobrar: asignar el bipper y CONTINUAR al cobro (Guardar → pago). */}
      {bipperEnabled && showBipperModal && (
        <BipperModal
          value={bipper}
          saveLabel="Continuar al cobro →"
          onSave={(v) => { setBipper(v); setShowPaymentModal(true); }}
          onClose={() => setShowBipperModal(false)}
        />
      )}
      {/* Lista de bippers de hoy */}
      {bipperEnabled && showBipperList && (
        <BipperListModal onClose={() => setShowBipperList(false)} />
      )}

      {showPaymentModal && (
        <PaymentConfirmationModal
          cartItems={cartItems}
          subtotal={subtotal}
          taxAmount={taxAmount}
          total={total}
          taxEnabled={taxEnabled}
          taxBreakdown={taxBreakdown}
          onConfirm={handlePaymentConfirm}
          onCancel={() => setShowPaymentModal(false)}
          loading={paymentLoading}
          enabledMethods={enabledPays}
          allowCard={planFeatures.pos_card}
          allowSinpe={planFeatures.pos_sinpe}
          allowCredit={!!planFeatures.accounts_receivable}
          creditNeedsCustomer={!selectedCustomer}
          creditAvailable={
            selectedCustomer
              ? (Number(selectedCustomer.credit_limit ?? 0) > 0
                  ? Number(selectedCustomer.credit_limit) - creditBalance
                  : Infinity)
              : 0
          }
          creditBalance={creditBalance}
          exchangeRate={exchangeRate?.venta}
          allowUsd={!!(planFeatures as any).pos_usd}
          deliveryCommissions={deliveryCommissions}
          deliveryMode={isDeliveryMode}
        />
      )}

      {showQuickProduct && (
        <QuickProductModal
          onAdd={handleAddQuickProduct}
          onClose={() => setShowQuickProduct(false)}
        />
      )}

      {showDisplayTest && (
        <DisplayTestModal onClose={() => setShowDisplayTest(false)} />
      )}

      {/* Jornada offline pendiente de subir. Se muestra SIEMPRE que haya algo en
          cola, para que nadie apague la tablet creyendo que ya se guardó todo. */}
      {daySync.pending > 0 && (
        <div className="fixed bottom-3 left-3 z-40 print:hidden">
          <button
            onClick={() => daySync.sync()}
            disabled={daySync.syncing}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border shadow-lg text-xs font-bold transition ${
              daySync.online
                ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                : 'bg-gray-800 border-gray-700 text-gray-100'
            } disabled:opacity-60`}
            title={daySync.online
              ? 'Hay operaciones sin subir. Tocá para sincronizar ahora.'
              : 'Sin conexión: las ventas y el cierre están guardados en esta tablet y suben solos cuando vuelva el internet.'}
          >
            <span className={daySync.syncing ? 'animate-spin' : ''}>{daySync.syncing ? '⟳' : daySync.online ? '⬆' : '⏸'}</span>
            <span>
              {daySync.syncing
                ? 'Sincronizando…'
                : `${daySync.pending} sin subir${daySync.online ? ' · tocá para subir' : ' · sin conexión'}`}
            </span>
          </button>
        </div>
      )}

      {/* Comandos de teclado: chip discreto abajo a la izquierda (reemplaza los
          recordatorios sueltos repartidos por la pantalla). */}
      <PosShortcutsHint />

      {/* Aviso de cuota de comprobantes electrónicos (quedan 50/20/10 o agotados). */}
      <FeQuotaWarning />

      {/* Hidden display test trigger button — press Ctrl+D to open */}
      {typeof window !== 'undefined' && (
        <div style={{ display: 'none' }} id="display-test-trigger">
          {(() => {
            if (typeof window !== 'undefined' && !window.displayTestListener) {
              window.displayTestListener = true;
              document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'd') {
                  e.preventDefault();
                  setShowDisplayTest(prev => !prev);
                }
              });
            }
            return null;
          })()}
        </div>
      )}
    </div>
  );
};
