import { useEffect, useRef } from 'react';
import type { CartItem } from '@/types/Types_POS';

const DISPLAY_SERVER_URL = 'http://localhost:8888';

interface UseDisplaySyncProps {
  cartItems: CartItem[];
  total: number;
  isOnline: boolean;
}

/**
 * Hook que sincroniza el carrito con el display POS via servidor local
 * El servidor (display-server/) debe estar corriendo en localhost:8888
 * Funciona con: Eyab Jwk, CD5220, ESC/POS y otros displays seriales
 */
export const useDisplaySync = ({ cartItems, total, isOnline }: UseDisplaySyncProps) => {
  const lastDisplayRef = useRef('');
  const serverAvailableRef = useRef(false);

  // Verificar disponibilidad del servidor al iniciar
  useEffect(() => {
    fetch(`${DISPLAY_SERVER_URL}/status`, { signal: AbortSignal.timeout(2000) })
      .then(r => r.json())
      .then(data => {
        serverAvailableRef.current = data?.running === true;
      })
      .catch(() => {
        serverAvailableRef.current = false;
      });
  }, []);

  // Enviar actualizaciones al display
  useEffect(() => {
    if (!serverAvailableRef.current) return;

    let displayText = '';
    let endpoint = '/total';
    let body: any = {};

    if (!isOnline) {
      displayText = 'OFFLINE';
      endpoint = '/display';
      body = { text: 'OFFLINE' };
    } else if (cartItems.length === 0) {
      displayText = '0.00';
      endpoint = '/total';
      body = { amount: 0 };
    } else {
      displayText = total.toFixed(2);
      endpoint = '/total';
      body = { amount: total };
    }

    if (displayText === lastDisplayRef.current) return;
    lastDisplayRef.current = displayText;

    fetch(`${DISPLAY_SERVER_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {
      // Si falla, marcar servidor como no disponible
      serverAvailableRef.current = false;
    });
  }, [cartItems.length, total, isOnline]);

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      if (!serverAvailableRef.current) return;
      fetch(`${DISPLAY_SERVER_URL}/clear`, {
        method: 'POST',
        signal: AbortSignal.timeout(1000),
      }).catch(() => {});
    };
  }, []);
};
