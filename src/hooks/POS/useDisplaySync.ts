import { useEffect, useRef } from 'react';
import { useDisplay } from '@/context/CustomerDisplayContext';
import type { CartItem } from '@/types/Types_POS';

interface UseDisplaySyncProps {
  cartItems: CartItem[];
  total: number;
  isOnline: boolean;
}

/**
 * Hook que sincroniza el carrito con el LED numérico del cliente (Eyab/DSP800/CD5220)
 * Envía SOLO el precio total — ej: "    0.00" o "12345.67"
 */
export const useDisplaySync = ({ cartItems, total, isOnline }: UseDisplaySyncProps) => {
  const { isConnected, updatePrice } = useDisplay();
  const lastValueRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isConnected) return;

    // LED numérico: solo enviar el total. Si no hay nada → 0.00
    const valueToShow = cartItems.length === 0 ? 0 : total;

    // Si está offline pero hay items, igual mostramos el total
    if (!isOnline && cartItems.length === 0) return;

    if (valueToShow === lastValueRef.current) return;
    lastValueRef.current = valueToShow;

    updatePrice(valueToShow).catch(() => {});
  }, [cartItems.length, total, isOnline, isConnected, updatePrice]);
};
