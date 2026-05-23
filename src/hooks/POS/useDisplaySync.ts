import { useEffect, useRef } from 'react';
import { useDisplay } from '@/context/CustomerDisplayContext';
import type { CartItem } from '@/types/Types_POS';

interface UseDisplaySyncProps {
  cartItems: CartItem[];
  total: number;
  isOnline: boolean;
}

/**
 * Hook que sincroniza el carrito con el display LCD del cliente
 * Usa Web Serial API a través del CustomerDisplayContext (puerto persistente)
 */
export const useDisplaySync = ({ cartItems, total, isOnline }: UseDisplaySyncProps) => {
  const { isConnected, updateDisplay } = useDisplay();
  const lastKeyRef = useRef('');

  useEffect(() => {
    if (!isConnected) return;

    let line1 = '';
    let line2 = '';

    if (!isOnline) {
      line1 = 'SIN CONEXION';
      line2 = 'Modo offline';
    } else if (cartItems.length === 0) {
      line1 = 'Bienvenido';
      line2 = 'Total: C 0.00';
    } else {
      const lastProduct = cartItems[cartItems.length - 1];
      line1 = lastProduct.product.name;
      line2 = `Total: C ${total.toLocaleString('es-CR')}`;
    }

    // Evitar reescritura si nada cambió
    const key = `${line1}|${line2}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    updateDisplay(line1, line2).catch(() => {});
  }, [cartItems, total, isOnline, isConnected, updateDisplay]);
};
