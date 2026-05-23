import React, { createContext, useContext, useEffect, useState, lazy, Suspense } from 'react';
import { useCustomerDisplay, type BaudRate } from '@/hooks/POS/useCustomerDisplay';

const DisplayTestPanel = lazy(() =>
  import('@/modules/pos/components/DisplayTestPanel').then(m => ({ default: m.DisplayTestPanel }))
);

interface CustomerDisplayContextValue {
  isConnected: boolean;
  error: string | null;
  baudRate: BaudRate;
  connect: (baud?: BaudRate) => Promise<void>;
  disconnect: () => Promise<void>;
  updatePrice: (amount: number) => Promise<void>;
  updateDisplay: (line1: string, line2: string) => Promise<void>;
  setBaudRate: (rate: BaudRate) => void;
  openTestPanel: () => void;
  closeTestPanel: () => void;
}

const CustomerDisplayContext = createContext<CustomerDisplayContextValue | null>(null);

interface ProviderProps {
  children: React.ReactNode;
}

export const CustomerDisplayProvider: React.FC<ProviderProps> = ({ children }) => {
  const display = useCustomerDisplay();
  const [showTestPanel, setShowTestPanel] = useState(false);

  const openTestPanel = () => setShowTestPanel(true);
  const closeTestPanel = () => setShowTestPanel(false);

  // Auto-reconectar al cargar si previamente estaba conectado
  useEffect(() => {
    display.autoReconnect().then(connected => {
      if (connected) {
        display.updatePrice(0); // LED numérico — muestra "    0.00"
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Shortcut global Ctrl+I — funciona desde CUALQUIER página
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
        const target = e.target as HTMLElement;
        const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        if (isTyping) return;
        e.preventDefault();
        setShowTestPanel(prev => !prev);
      }
      if (e.key === 'Escape' && showTestPanel) {
        setShowTestPanel(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showTestPanel]);

  return (
    <CustomerDisplayContext.Provider value={{ ...display, openTestPanel, closeTestPanel }}>
      {children}
      {showTestPanel && (
        <Suspense fallback={null}>
          <DisplayTestPanel onClose={closeTestPanel} />
        </Suspense>
      )}
    </CustomerDisplayContext.Provider>
  );
};

export const useDisplay = (): CustomerDisplayContextValue => {
  const ctx = useContext(CustomerDisplayContext);
  if (!ctx) {
    throw new Error('useDisplay debe usarse dentro de CustomerDisplayProvider');
  }
  return ctx;
};
