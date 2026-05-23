import React, { createContext, useContext, useEffect } from 'react';
import { useCustomerDisplay } from '@/hooks/POS/useCustomerDisplay';

interface CustomerDisplayContextValue {
  isConnected: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  updateDisplay: (line1: string, line2: string) => Promise<void>;
}

const CustomerDisplayContext = createContext<CustomerDisplayContextValue | null>(null);

interface ProviderProps {
  children: React.ReactNode;
}

export const CustomerDisplayProvider: React.FC<ProviderProps> = ({ children }) => {
  const display = useCustomerDisplay();

  // Auto-reconectar al cargar si previamente estaba conectado
  useEffect(() => {
    display.autoReconnect().then(connected => {
      if (connected) {
        display.updateDisplay('Sistema listo', 'Bienvenido');
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <CustomerDisplayContext.Provider value={display}>
      {children}
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
