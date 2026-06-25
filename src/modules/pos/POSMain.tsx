import { useState, useEffect, useCallback } from 'react';
import { ShoppingBag, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCashSession } from '@/hooks/useCashSession';
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
import {
  getProductPromotion,
  calcPromoSubtotal,
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
  const { products, filteredProducts, searchTerm, setSearchTerm, loading: productsLoading, fromCache: productsCached, cachedAt: productsCachedAt, error: productsError } = usePOSProducts();
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
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(0);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
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
  const [taxRate, setTaxRate]         = useState(0.13);
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
  type ActiveCashier = { id: string; full_name: string; role: string };
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { apiFetch } = await import('@/lib/api');
        const cfg = await apiFetch<{ default_document_type?: string } | null>('/settings/electronic-invoice');
        if (cancelled || !cfg?.default_document_type) return;
        const allowed = ['ticket', 'tiquete_electronico', 'factura_electronica'];
        if (allowed.includes(cfg.default_document_type)) {
          setDocumentType(cfg.default_document_type as any);
        }
      } catch { /* sin config aún, dejamos ticket */ }
    })();
    return () => { cancelled = true; };
  }, []);

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
      if (typeof cfg.taxPercentage === 'number' && cfg.taxPercentage >= 0)
        setTaxRate(cfg.taxPercentage / 100);
    };

    // Apply cached config immediately
    const cached = cacheGet<any>(ck) ?? cacheGet<any>(ckOld);
    if (cached) applyConfig(cached);

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

        await invoicesService.createInvoice(
          inv.tenantId,
          sessionIdToUse,
          inv.cartItems,
          inv.subtotal,
          0,
          0,
          inv.taxAmount,
          inv.total,
          inv.paymentMethod,
          undefined,
          inv.notes,
          undefined,
          amountReceived,
          inv.changeAmount ?? 0,
          voucherNumber,
          inv.invoiceNumber, // Pass offline invoice number to preserve it
          inv.cashierId ?? null,
          inv.cashierName ?? null,
          (inv as any).payments ?? null,
          (inv as any).documentType ?? 'ticket',
        );
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

  useEffect(() => {
    if (isOnline) {
      // Delay slightly to allow cash sessions to sync first
      const timer = setTimeout(syncOfflineInvoices, 500);
      return () => clearTimeout(timer);
    }
  }, [isOnline, syncOfflineInvoices]);

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

  const subtotal = Math.round(cartItems.reduce((sum, item) => sum + item.subtotal, 0));
  const effectiveTaxRate = taxEnabled ? taxRate : 0;
  const taxAmount = Math.round(subtotal * effectiveTaxRate);
  const total = subtotal + taxAmount;

  // ── Atajos de teclado estilo Eleventa ─────────────────────────────────
  // F12 = Cobrar · F4 = Anular · Esc = Cerrar modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
  }, [cartItems.length, currentSession]);

  // Pre-cargar configuración de impresión y conexión QZ Tray
  // para que el primer cobro sea instantáneo
  useEffect(() => {
    if (!tenantId) return;
    posPrinterService.loadReceiptConfig(tenantId).catch(() => {});
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
      if (!selectedCustomer) { setCustomerPrices({}); return; }
      try {
        const { customerPricesService } = await import('@/services/customers/customerPricesService');
        const map = await customerPricesService.mapForCustomer(selectedCustomer.id);
        if (active) setCustomerPrices(map);
      } catch { if (active) setCustomerPrices({}); }
    })();
    return () => { active = false; };
  }, [selectedCustomer]);

  // Saldo de crédito del cliente seleccionado (cuentas por cobrar pendientes).
  const [creditBalance, setCreditBalance] = useState(0);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedCustomer?.credit_enabled) { setCreditBalance(0); return; }
      try {
        const { accountsReceivableService } = await import('@/services/accountsReceivable/accountsReceivableService');
        const rows = await accountsReceivableService.list({ customer_id: selectedCustomer.id });
        const bal = (rows ?? []).reduce((s, r) => s + (Number(r.total_amount) - Number(r.paid_amount)), 0);
        if (active) setCreditBalance(bal);
      } catch { if (active) setCreditBalance(0); }
    })();
    return () => { active = false; };
  }, [selectedCustomer]);

  // Precio efectivo de un producto según el cliente (especial o normal).
  const priceFor = (product: Product): number =>
    customerPrices[product.id] ?? product.unit_price;

  // Re-precificar el carrito cuando cambian los precios del cliente.
  useEffect(() => {
    setCartItems(prev => prev.map(item => {
      const base = customerPrices[item.product_id] ?? item.product?.unit_price ?? item.unit_price;
      if (Math.round(base) === item.unit_price) return item;
      const subtotal = Math.round(item.promo
        ? calcPromoSubtotal(base, item.quantity, item.promo as any)
        : item.quantity * base * (1 - (item.discount_percent ?? 0) / 100));
      return { ...item, unit_price: Math.round(base), subtotal };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerPrices]);

  const handleAddToCart = (product: Product, quantity: number = 1) => {
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
        const subtotal = Math.round(promo
          ? calcPromoSubtotal(existing.unit_price, newQty, promo)
          : newQty * existing.unit_price);
        return prev.map(item =>
          item.product_id === product.id
            ? { ...item, quantity: newQty, subtotal }
            : item
        );
      }
      const subtotal = Math.round(promo
        ? calcPromoSubtotal(base, quantity, promo)
        : base * quantity);
      return [...prev, {
        product_id: product.id,
        product,
        quantity,
        unit_price: Math.round(base),
        subtotal,
        promo: promo
          ? { id: promo.id, name: promo.name, type: promo.type, value: promo.value }
          : undefined,
      }];
    });
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
            subtotal = Math.round(calcPromoSubtotal(item.unit_price, quantity, item.promo as any));
          } else {
            subtotal = Math.round(quantity * item.unit_price * (1 - (item.discount_percent ?? 0) / 100));
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

  // Tipo de impresora (para el botón de abrir cajón, solo en Bluetooth).
  const printerTypeCached: string | undefined = (() => {
    try {
      const cached = cacheGet<any>(cacheKey(tenantId ?? '', 'settings_receipt'));
      return (cached?.config ?? cached)?.printerType;
    } catch { return undefined; }
  })();
  const isBluetoothPrinter = printerTypeCached === 'bluetooth';

  const handleOpenDrawer = async () => {
    if (!tenantId) return;
    try {
      await posPrinterService.openCashDrawer(tenantId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el cajón');
    }
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
          ? { ...item, discount_percent: pct, subtotal: Math.round(item.quantity * item.unit_price * (1 - pct / 100)) }
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
        })),
        subtotal: sub,
        tax,
        total: tot,
        paymentMethod: PAYMENT_METHOD_LABELS[paymentMethod] ?? paymentMethod,
        // Datos del local (sin email)
        storeName: general?.businessName,
        storeRuc: general?.ruc,
        storeCedula: general?.cedula,
        storeAddress: general?.address,
        storeCity: general?.city,
        storePhone: general?.phone,
        cashierName: activeCashier?.full_name ?? user?.email ?? undefined,
        customerName,
        simplificadoFooter,
        payments,
      };

      if (paymentMethod === 'credit') {
        // Venta a crédito: doble factura (copia para el cliente y para el vendedor).
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
        items: cartItems.map(it => ({ name: it.product.name, quantity: it.quantity, unitPrice: it.unit_price, subtotal: it.subtotal })),
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

  const handlePaymentConfirm = async (data: PaymentData) => {
    if (!tenantId || !currentSession) {
      setError('Sesión de caja no disponible');
      return;
    }

    if (currentSession.status !== 'open') {
      setError('La caja está cerrada. Debes abrir una nueva sesión para continuar.');
      return;
    }

    setPaymentLoading(true);
    const notes = data.voucherNumber ? `Comprobante: ${data.voucherNumber}` : undefined;

    // Snapshot del carrito para imprimir después (al limpiar inmediatamente)
    const cartSnapshot = [...cartItems];
    const subSnapshot = subtotal;
    const taxSnapshot = taxAmount;
    const totSnapshot = total;

    try {
      if (isOnline) {
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
        );

        // Limpiar UI INMEDIATAMENTE — resetActive vacía cart + cliente del tab
        // actual de una sola llamada (más limpio que setCartItems([]) + setCustomerName('')).
        resetActive();
        setShowPaymentModal(false);
        setCartOpen(false);
        setPaymentLoading(false);
        setLastInvoice(invoice);
        setPaymentData(data);
        setSuccess(`Pago procesado — Factura ${invoice.invoice_number}`);

        // Operaciones en background (no bloquean UI)
        posOfflineService.addCachedInvoice({
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          issued_at: (invoice as any).issued_at ?? invoice.created_at ?? localNowISO(),
          total: invoice.total,
          payment_method: invoice.payment_method,
        });
        printReceipt(invoice.invoice_number, cartSnapshot, subSnapshot, taxSnapshot, totSnapshot, data.paymentMethod, invoice.customer_name ?? undefined, data.payments ?? undefined);
        setInvoiceCounterKey(k => k + 1);
        return;
      } else {
        // ── Offline: queue for later sync ────────────────────────────────────
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
          customerName: customerName.trim() || undefined,
          cashierId: activeCashier?.id ?? null,
          cashierName: activeCashier?.full_name ?? null,
          documentType,
        } as any);

        // Snapshot del cliente antes del reset (lo necesitamos para impresión).
        const offlineCustomer = customerName.trim() || undefined;

        // Limpiar UI del tab activo INMEDIATAMENTE
        resetActive();
        setShowPaymentModal(false);
        setCartOpen(false);
        setPaymentLoading(false);
        setSuccess(`Venta guardada sin conexión (${invoiceNumber}) — se sincronizará al reconectar`);

        // Background
        posOfflineService.addCachedInvoice({
          id: invoiceNumber,
          invoice_number: invoiceNumber,
          issued_at: localNowISO(),
          total: totSnapshot,
          payment_method: data.paymentMethod,
        });
        refreshPendingCount();
        printReceipt(invoiceNumber, cartSnapshot, subSnapshot, taxSnapshot, totSnapshot, data.paymentMethod, offlineCustomer, data.payments ?? undefined);
        setInvoiceCounterKey(k => k + 1);
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
        error={error}
        success={success}
        isOnline={isOnline}
        pendingCount={pendingInvoices}
        syncing={syncing}
        productsCached={productsCached}
        productsCachedAt={productsCachedAt}
        currentSession={currentSession}
        onClearError={() => setError('')}
        onClearSuccess={() => setSuccess('')}
        onOpenCash={() => setShowOpenModal(true)}
        onCloseCash={() => setShowCloseModal(true)}
        onVoidInvoice={(currentSession && canVoidInvoice) ? () => setShowVoidModal(true) : undefined}
        onReprintInvoice={() => setShowReprintModal(true)}
        onCashIn={currentSession?.status === 'open' ? () => setCashMovement('in') : undefined}
        onCashOut={currentSession?.status === 'open' ? () => setCashMovement('out') : undefined}
        onOpenDrawer={(isBluetoothPrinter && currentSession?.status === 'open') ? handleOpenDrawer : undefined}
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
           ocupa el centro, así que el total grande va arriba como banner).  */}
      {(assisted || isListLayout) && (
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
                    <span className="text-emerald-300/40">·</span>
                    <span className="tabular-nums">IVA ₡{taxAmount.toLocaleString('es-CR')}</span>
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
              <p className="text-[10px] sm:text-xs font-semibold text-emerald-200/70 mt-0.5">
                Presiona <kbd className="px-1 py-0.5 rounded bg-emerald-500/30 border border-emerald-400/30 text-emerald-100 font-mono text-[10px]">F12</kbd> para cobrar
              </p>
            </div>
          </div>
        </div>
      )}

      <div className={`flex flex-1 overflow-hidden ${isListLayout ? 'flex-col' : 'flex-row'}`}>
        <POSProductsPanel
          viewMode={posViewMode}
          searchTabsEnabled={!!(planFeatures as any).pos_search_tabs}
          filteredProducts={filteredProducts}
          allProducts={products}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          customerPrices={customerPrices}
          onAddToCart={handleAddToCart}
          currentSession={currentSession}
          productsError={productsError}
          ignoreStock={!planFeatures.inventory || (planFeatures as any).inventory_products_only}
          activePromotions={activePromotions}
        />

        {/* Carrito inline — solo en pantallas grandes (lg+) */}
        <div className="hidden lg:flex">
          <POSCartPanel
            cartItems={cartItems}
            subtotal={subtotal}
            taxAmount={taxAmount}
            total={total}
            taxEnabled={taxEnabled}
            taxRate={taxRate}
            currentSession={currentSession}
            loading={paymentLoading}
            canDiscount={planFeatures.pos_discount && maxDiscountPercent > 0}
            maxDiscountPercent={maxDiscountPercent}
            onRemoveFromCart={handleRemoveFromCart}
            onChangeQuantity={handleChangeQuantity}
            onApplyDiscount={handleApplyDiscount}
            onPayment={() => setShowPaymentModal(true)}
            onPreTicket={printPreTicket}
            expanded={isListLayout}
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
            taxEnabled={taxEnabled}
            taxRate={taxRate}
            currentSession={currentSession}
            loading={paymentLoading}
            canDiscount={planFeatures.pos_discount && maxDiscountPercent > 0}
            maxDiscountPercent={maxDiscountPercent}
            onRemoveFromCart={handleRemoveFromCart}
            onChangeQuantity={handleChangeQuantity}
            onApplyDiscount={handleApplyDiscount}
            onPayment={() => setShowPaymentModal(true)}
            onPreTicket={printPreTicket}
            expanded
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

      {/* Cintillo de atajos F-keys estilo Eleventa — solo en modo escritorio */}
      {posViewMode === 'desktop' && (
        <div className="bg-gray-900 text-white px-4 py-1.5 flex items-center gap-3 text-[11px] font-mono shrink-0 overflow-x-auto pos-keyboard-hint">
          <span className="font-bold text-emerald-400">
            <span className="bg-emerald-600 text-white px-1.5 py-0.5 rounded mr-1.5">F12</span>
            Cobrar
          </span>
          <span className="text-gray-400">·</span>
          <span className="font-bold text-red-300">
            <span className="bg-red-600 text-white px-1.5 py-0.5 rounded mr-1.5">F4</span>
            Anular
          </span>
          <span className="text-gray-400">·</span>
          <span className="font-bold text-blue-300">
            <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded mr-1.5">F2</span>
            Pistola lectora
          </span>
          <span className="text-gray-400">·</span>
          <span className="font-bold text-gray-300">
            <span className="bg-gray-600 text-white px-1.5 py-0.5 rounded mr-1.5">Esc</span>
            Cancelar
          </span>
          <span className="text-gray-400">·</span>
          <span className="font-bold text-gray-300">
            <span className="bg-gray-600 text-white px-1.5 py-0.5 rounded mr-1.5">Enter</span>
            Confirmar
          </span>
          <span className="ml-auto text-gray-500">
            ColònClick · {assisted ? 'Modo Asistido' : 'Escritorio'}
          </span>
        </div>
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

      {showPaymentModal && (
        <PaymentConfirmationModal
          cartItems={cartItems}
          subtotal={subtotal}
          taxAmount={taxAmount}
          total={total}
          taxEnabled={taxEnabled}
          onConfirm={handlePaymentConfirm}
          onCancel={() => setShowPaymentModal(false)}
          loading={paymentLoading}
          allowCard={planFeatures.pos_card}
          allowSinpe={planFeatures.pos_sinpe}
          allowCredit={!!selectedCustomer?.credit_enabled}
          creditAvailable={
            selectedCustomer?.credit_enabled
              ? (Number(selectedCustomer.credit_limit ?? 0) > 0
                  ? Number(selectedCustomer.credit_limit) - creditBalance
                  : Infinity)
              : 0
          }
          creditBalance={creditBalance}
        />
      )}

      {showDisplayTest && (
        <DisplayTestModal onClose={() => setShowDisplayTest(false)} />
      )}

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
