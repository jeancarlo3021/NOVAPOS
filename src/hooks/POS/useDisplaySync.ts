import { useEffect, useRef } from 'react';
import { displayService } from '@/services/pos/displayService';
import type { CartItem } from '@/types/Types_POS';

interface UseDisplaySyncProps {
  cartItems: CartItem[];
  total: number;
  isOnline: boolean;
}

/**
 * Hook que sincroniza los datos del carrito con el mini display de la POS
 * Muestra: cantidad de artículos, total, o mensajes de estado
 */
export const useDisplaySync = ({ cartItems, total, isOnline }: UseDisplaySyncProps) => {
  const initRef = useRef(false);
  const lastDisplayRef = useRef('');

  useEffect(() => {
    // Inicializar el display una sola vez
    if (!initRef.current) {
      initRef.current = true;
      displayService.initialize({ type: 'usb' }).catch(() => {
        // Si USB falla, intentar serie
        displayService.initialize({ type: 'serial' }).catch(() => {
          // Si ambos fallan, continuar sin display
        });
      });
    }
  }, []);

  useEffect(() => {
    if (!displayService.getIsConnected()) return;

    let displayText = '';

    if (!isOnline) {
      displayText = 'OFFLINE';
    } else if (cartItems.length === 0) {
      displayText = '0000';
    } else {
      // Mostrar el total o cantidad de artículos alternándose
      displayText = `₡${total.toString().padStart(5, '0')}`;
    }

    // Solo actualizar si cambió
    if (displayText !== lastDisplayRef.current) {
      lastDisplayRef.current = displayText;

      if (cartItems.length === 0 && isOnline) {
        displayService.showValue('0000').catch(() => {});
      } else if (!isOnline) {
        displayService.showMessage('OFFLINE').catch(() => {});
      } else {
        displayService.showTotal(total).catch(() => {});
      }
    }
  }, [cartItems.length, total, isOnline]);

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      displayService.clear().catch(() => {});
    };
  }, []);
};
