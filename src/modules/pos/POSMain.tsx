import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCashSession } from '@/hooks/useCashSession';
import { useTenantId } from '@/hooks/useTenant';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { usePOSProducts } from '@/hooks/POS/usePOSProducts';
import { cacheSet, cacheGet, cacheKey } from '@/utils/offlineCache';
import { usePOSPromotions } from '@/hooks/POS/usePOSPromotions';
import {
  getProductPromotion,
  calcPromoSubtotal,
} from '@/services/promotions/promotionsService';
import { invoicesService } from '@/services/invoice/invoiceService';
import { posOfflineService, OfflineInvoicePayload, generateInvoiceNumber } from '@/services/pos/posOfflineService';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { apiFetch } from '@/lib/api';
import { POSHeader } from './POSHeader';
import { CashMovementModal } from './cashManagement/CashMovementModal';
import { POSProductsPanel } from './POSProducts';
import { POSCartPanel } from './POSCart';
import { POSModals } from './POSModals';
import { VoidInvoiceModal } from './VoidInvoiceModal';
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
};

export const POSMain = () => {
  const { user, planFeatures } = useAuth();
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenantId();
  const { currentSession, loading: sessionLoading, refetchSession } = useCashSession();
  const { isOnline } = useOfflineSync();
  const { products, filteredProducts, searchTerm, setSearchTerm, loading: productsLoading, fromCache: productsCached, cachedAt: productsCachedAt, error: productsError } = usePOSProducts();
  const activePromotions = usePOSPromotions(tenantId);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(0);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<any>(null);
  const [paymentData, setPaymentData] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Tax settings loaded from general config
  const [taxEnabled, setTaxEnabled]   = useState(true);
  const [taxRate, setTaxRate]         = useState(0.13);
  const [pendingInvoices, setPendingInvoices] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
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

  const handleAddToCart = (product: Product, quantity: number = 1) => {
    const promo = getProductPromotion(
      product.id,
      (product as any).category_id ?? (product as any).category?.id ?? null,
      activePromotions,
    );
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
        ? calcPromoSubtotal(product.unit_price, quantity, promo)
        : product.unit_price * quantity);
      return [...prev, {
        product_id: product.id,
        product,
        quantity,
        unit_price: Math.round(product.unit_price),
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

  const handleApplyDiscount = (productId: string, discount_percent: number) => {
    setCartItems(prev =>
      prev.map(item =>
        item.product_id === productId
          ? { ...item, discount_percent, subtotal: Math.round(item.quantity * item.unit_price * (1 - discount_percent / 100)) }
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
  ) => {
    if (!tenantId) return;
    try {
      // Cache de settings — sin esperar API (mismo key que useSettings)
      const cachedGeneral = cacheGet<any>(cacheKey(tenantId, 'settings_general'))
                          ?? cacheGet<any>(cacheKey(tenantId, 'general_settings'));
      const general = cachedGeneral?.config ?? cachedGeneral;
      const now = new Date();

      // Receipt
      await posPrinterService.printAuto(
        {
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
          cashierName: user?.email ?? undefined,
          customerName,
        },
        tenantId,
      );

      // Comandas (fire-and-forget — non-blocking)
      posPrinterService.printComandas(
        invoiceNumber,
        items.map(item => ({ name: item.product.name, quantity: item.quantity })),
        tenantId,
        customerName,
      ).catch(err => console.warn('Error al imprimir comanda:', err));

    } catch (err) {
    }
  }, [tenantId, user]);

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
          undefined,
          notes,
          undefined,
          data.amountReceived,
          data.change,
          data.voucherNumber,
          invNum
        );

        // Limpiar UI INMEDIATAMENTE para que esté lista para nueva venta
        setCartItems([]);
        setShowPaymentModal(false);
        setPaymentLoading(false);
        setLastInvoice(invoice);
        setPaymentData(data);
        setSuccess(`Pago procesado — Factura ${invoice.invoice_number}`);

        // Operaciones en background (no bloquean UI)
        posOfflineService.addCachedInvoice({
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          issued_at: (invoice as any).issued_at ?? invoice.created_at ?? new Date().toISOString(),
          total: invoice.total,
          payment_method: invoice.payment_method,
        });
        printReceipt(invoice.invoice_number, cartSnapshot, subSnapshot, taxSnapshot, totSnapshot, data.paymentMethod, invoice.customer_name ?? undefined);
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
        });

        // Limpiar UI INMEDIATAMENTE
        setCartItems([]);
        setShowPaymentModal(false);
        setPaymentLoading(false);
        setSuccess(`Venta guardada sin conexión (${invoiceNumber}) — se sincronizará al reconectar`);

        // Background
        posOfflineService.addCachedInvoice({
          id: invoiceNumber,
          invoice_number: invoiceNumber,
          issued_at: new Date().toISOString(),
          total: totSnapshot,
          payment_method: data.paymentMethod,
        });
        refreshPendingCount();
        printReceipt(invoiceNumber, cartSnapshot, subSnapshot, taxSnapshot, totSnapshot, data.paymentMethod);
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
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
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
        onVoidInvoice={currentSession ? () => setShowVoidModal(true) : undefined}
        onCashIn={currentSession?.status === 'open' ? () => setCashMovement('in') : undefined}
        onCashOut={currentSession?.status === 'open' ? () => setCashMovement('out') : undefined}
        onSync={isOnline ? syncOfflineInvoices : undefined}
      />

      <div className="flex flex-1 overflow-hidden">
        <POSProductsPanel
          filteredProducts={filteredProducts}
          allProducts={products}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onAddToCart={handleAddToCart}
          currentSession={currentSession}
          productsError={productsError}
          ignoreStock={!planFeatures.inventory || (planFeatures as any).inventory_products_only}
          activePromotions={activePromotions}
        />

        <POSCartPanel
          cartItems={cartItems}
          subtotal={subtotal}
          taxAmount={taxAmount}
          total={total}
          taxEnabled={taxEnabled}
          taxRate={taxRate}
          currentSession={currentSession}
          loading={paymentLoading}
          canDiscount={planFeatures.pos_discount}
          onRemoveFromCart={handleRemoveFromCart}
          onChangeQuantity={handleChangeQuantity}
          onApplyDiscount={handleApplyDiscount}
          onPayment={() => setShowPaymentModal(true)}
        />
      </div>

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
