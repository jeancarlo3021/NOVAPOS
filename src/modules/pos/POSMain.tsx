import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCashSession } from '@/hooks/useCashSession';
import { useTenantId } from '@/hooks/useTenant';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { usePOSProducts } from '@/hooks/POS/usePOSProducts';
import { invoicesService } from '@/services/invoice/invoiceService';
import { posOfflineService, OfflineInvoicePayload } from '@/services/pos/posOfflineService';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { supabase } from '@/lib/supabase';
import { POSHeader } from './POSHeader';
import { POSProductsPanel } from './POSProducts';
import { POSCartPanel } from './POSCart';
import { POSModals } from './POSModals';
import { VoidInvoiceModal } from './VoidInvoiceModal';
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

const TAX_RATE = 0.13;

export const POSMain = () => {
  const { user, planFeatures } = useAuth();
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenantId();
  const { currentSession, loading: sessionLoading, refetchSession } = useCashSession();
  const { isOnline } = useOfflineSync();
  const { filteredProducts, searchTerm, setSearchTerm, loading: productsLoading, fromCache: productsCached, error: productsError } = usePOSProducts();

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<any>(null);
  const [paymentData, setPaymentData] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [pendingInvoices, setPendingInvoices] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);

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
        await invoicesService.createInvoice(
          inv.tenantId,
          inv.sessionId,
          inv.cartItems,
          inv.subtotal,
          0,
          0,
          inv.taxAmount,
          inv.total,
          inv.paymentMethod,
          undefined,
          inv.notes
        );
      });

      await refreshPendingCount();
      if (result.synced > 0) {
        setSuccess(`${result.synced} factura(s) sincronizada(s)`);
      }
      if (result.errors > 0) {
        setError(`${result.errors} factura(s) no pudieron sincronizarse`);
      }
    } finally {
      setSyncing(false);
    }
  }, [refreshPendingCount]);

  useEffect(() => {
    if (isOnline) syncOfflineInvoices();
  }, [isOnline, syncOfflineInvoices]);

  const subtotal = cartItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const taxAmount = subtotal * TAX_RATE;
  const total = subtotal + taxAmount;

  const handleAddToCart = (product: Product, quantity: number = 1) => {
    setCartItems(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + quantity, subtotal: (item.quantity + quantity) * item.unit_price }
            : item
        );
      }
      return [...prev, {
        product_id: product.id,
        product,
        quantity,
        unit_price: product.unit_price,
        subtotal: product.unit_price * quantity,
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
        prev.map(item =>
          item.product_id === productId
            ? { ...item, quantity, subtotal: quantity * item.unit_price * (1 - (item.discount_percent ?? 0) / 100) }
            : item
        )
      );
    }
  };

  const handleApplyDiscount = (productId: string, discount_percent: number) => {
    setCartItems(prev =>
      prev.map(item =>
        item.product_id === productId
          ? { ...item, discount_percent, subtotal: item.quantity * item.unit_price * (1 - discount_percent / 100) }
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
  ) => {
    if (!tenantId) return;
    try {
      const { data: generalData } = await supabase
        .from('settings')
        .select('config')
        .eq('tenant_id', tenantId)
        .eq('type', 'general')
        .maybeSingle();

      const general = generalData?.config as any;
      const now = new Date();

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
          storeName: general?.businessName,
          storeAddress: general?.address,
          storePhone: general?.phone,
          cashierName: user?.email ?? undefined,
        },
        tenantId,
      );
    } catch (err) {
      console.error('Error al imprimir recibo:', err);
    }
  }, [tenantId, user]);

  const handlePaymentConfirm = async (data: PaymentData) => {
    if (!tenantId || !currentSession) {
      setError('Sesión de caja no disponible');
      return;
    }

    setPaymentLoading(true);
    const notes = data.voucherNumber ? `Comprobante: ${data.voucherNumber}` : undefined;

    try {
      if (isOnline) {
        // ── Online: create invoice directly ──────────────────────────────────
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
          data.voucherNumber
        );
        setLastInvoice(invoice);
        setPaymentData(data);
        setSuccess(`Pago procesado — Factura ${invoice.invoice_number}`);
        printReceipt(invoice.invoice_number, cartItems, subtotal, taxAmount, total, data.paymentMethod);
      } else {
        // ── Offline: queue for later sync ────────────────────────────────────
        const offlineId = await posOfflineService.queueInvoice({
          tenantId,
          sessionId: currentSession.id,
          cartItems,
          subtotal,
          taxAmount,
          total,
          paymentMethod: data.paymentMethod,
          notes,
        });
        await refreshPendingCount();
        setSuccess('Venta guardada sin conexión — se sincronizará al reconectar');
        printReceipt(offlineId, cartItems, subtotal, taxAmount, total, data.paymentMethod);
      }

      setCartItems([]);
      setShowPaymentModal(false);
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
        currentSession={currentSession}
        onClearError={() => setError('')}
        onClearSuccess={() => setSuccess('')}
        onOpenCash={() => setShowOpenModal(true)}
        onCloseCash={() => setShowCloseModal(true)}
        onVoidInvoice={currentSession ? () => setShowVoidModal(true) : undefined}
        onSync={isOnline ? syncOfflineInvoices : undefined}
      />

      <div className="flex flex-1 overflow-hidden">
        <POSProductsPanel
          filteredProducts={filteredProducts}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onAddToCart={handleAddToCart}
          currentSession={currentSession}
          productsError={productsError}
        />

        <POSCartPanel
          cartItems={cartItems}
          subtotal={subtotal}
          taxAmount={taxAmount}
          total={total}
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
          onSuccess={(session) => {
            setShowCloseModal(false);
            posOfflineService.cacheSession(session);
            refetchSession();
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

      {showPaymentModal && (
        <PaymentConfirmationModal
          cartItems={cartItems}
          subtotal={subtotal}
          taxAmount={taxAmount}
          total={total}
          onConfirm={handlePaymentConfirm}
          onCancel={() => setShowPaymentModal(false)}
          loading={paymentLoading}
          allowCard={planFeatures.pos_card}
          allowSinpe={planFeatures.pos_sinpe}
        />
      )}
    </div>
  );
};
