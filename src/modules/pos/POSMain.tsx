import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCashSession } from '@/hooks/useCashSession';
import { useTenantId } from '@/hooks/useTenant';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { usePOSProducts } from '@/hooks/POS/usePOSProducts';
import { offlineSyncService } from '@/services/offlineSyncService';
import { supabase } from '@/lib/supabase';
import { POSSidebar } from './POSSIdeBar';
import { POSHeader } from './POSHeader';
import { POSProductsPanel } from './POSProducts';
import { POSCartPanel } from './POSCart';
import { POSModals } from './POSModals';
import { LoadingState } from '@/components/ui/uiComponents';
import type { CartItem, Product } from '@/types/Types_POS';

const TAX_RATE = 0.13;

export const POSMain = () => {
  const { user } = useAuth();
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenantId();
  const { currentSession, loading: sessionLoading } = useCashSession();
  const { isOnline, syncStatus, sync } = useOfflineSync();
  const { filteredProducts, searchTerm, setSearchTerm, loading: productsLoading } = usePOSProducts();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<any>(null);
  const [paymentData, setPaymentData] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sessionError] = useState<string | null>(null);

  useEffect(() => {
    if (isOnline && syncStatus.pending > 0) {
      sync();
    }
  }, [isOnline, syncStatus.pending, sync]);

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
      const newItem: CartItem = {
        product_id: product.id,
        product,
        quantity,
        unit_price: product.unit_price,
        subtotal: product.unit_price * quantity,
      };
      return [...prev, newItem];
    });
  };

  const handleRemoveFromCart = (productId: string) => {
    setCartItems(prev => prev.filter(item => item.product_id !== productId));
  };

  const handleChangeQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(productId);
    } else {
      setCartItems(prev =>
        prev.map(item =>
          item.product_id === productId
            ? { ...item, quantity, subtotal: quantity * item.unit_price }
            : item
        )
      );
    }
  };

  const handlePaymentSuccess = async (invoice: any, payment: any) => {
    if (!tenantId) {
      setError('Tenant ID no disponible');
      return;
    }

    const saleData = {
      tenant_id: tenantId,
      items: cartItems,
      total,
      subtotal,
      tax_amount: taxAmount,
      payment_method: payment.method,
      created_at: new Date().toISOString(),
    };

    try {
      if (isOnline) {
        const { error: supabaseError } = await supabase.from('sales').insert(saleData);
        if (supabaseError) throw supabaseError;
      } else {
        await offlineSyncService.addOperation({ type: 'create', table: 'sales', data: saleData });
      }

      setLastInvoice(invoice);
      setPaymentData(payment);
      setCartItems([]);
      setShowPaymentModal(false);
      setShowReceiptModal(true);
      setSuccess('Pago procesado correctamente');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error procesando el pago');
    }
  };

  const isLoading = tenantLoading || sessionLoading || productsLoading;

  if (isLoading) {
    return <LoadingState message="Cargando POS..." />;
  }

  if (tenantError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-600 mb-4">{tenantError}</p>
          <p className="text-sm text-gray-500">Contacta al administrador</p>
        </div>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-yellow-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-yellow-600 mb-4">Advertencia</h1>
          <p className="text-gray-600">Tenant ID no disponible</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <POSSidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        currentSession={currentSession}
        user={user}
        isOnline={isOnline}
        pendingCount={syncStatus.pending}
        onOpenCash={() => setShowOpenModal(true)}
        onCloseCash={() => setShowCloseModal(true)}
        onShowOriginalSidebar={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <POSHeader
          sessionError={sessionError}
          error={error}
          success={success}
          isOnline={isOnline}
          pendingCount={syncStatus.pending}
          onClearSessionError={() => {}}
          onClearError={() => setError('')}
          onClearSuccess={() => setSuccess('')}
        />

        <div className="flex-1 flex overflow-hidden">
          <POSProductsPanel
            filteredProducts={filteredProducts}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onAddToCart={handleAddToCart}
            currentSession={currentSession}
          />

          <POSCartPanel
            cartItems={cartItems}
            subtotal={subtotal}
            taxAmount={taxAmount}
            total={total}
            currentSession={currentSession}
            loading={false}
            onRemoveFromCart={handleRemoveFromCart}
            onChangeQuantity={handleChangeQuantity}
            onPayment={() => setShowPaymentModal(true)}
          />
        </div>
      </div>

      <POSModals
        showOpenModal={showOpenModal}
        showCloseModal={showCloseModal}
        showPaymentModal={showPaymentModal}
        showReceiptModal={showReceiptModal}
        currentSession={currentSession}
        user={user}
        cartItems={cartItems}
        subtotal={subtotal}
        taxAmount={taxAmount}
        total={total}
        lastInvoice={lastInvoice}
        paymentData={paymentData}
        onOpenModalClose={() => setShowOpenModal(false)}
        onCloseModalClose={() => setShowCloseModal(false)}
        onPaymentModalClose={() => setShowPaymentModal(false)}
        onReceiptModalClose={() => setShowReceiptModal(false)}
        onOpenCashSuccess={() => setShowOpenModal(false)}
        onCloseCashSuccess={() => setShowCloseModal(false)}
        onPaymentSuccess={handlePaymentSuccess}
        onPaymentError={setError}
      />
    </div>
  );
};
