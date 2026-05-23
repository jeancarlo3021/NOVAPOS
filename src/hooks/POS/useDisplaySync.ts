import { useEffect, useRef } from 'react';
import { eyabDisplayService } from '@/services/pos/eyabDisplayService';
import { displayService } from '@/services/pos/displayService';
import type { CartItem } from '@/types/Types_POS';

interface UseDisplaySyncProps {
  cartItems: CartItem[];
  total: number;
  isOnline: boolean;
}

/**
 * Hook que sincroniza los datos del carrito con el mini display de la POS
 * Soporta: displays Eyab, USB, y puerto serie
 */
export const useDisplaySync = ({ cartItems, total, isOnline }: UseDisplaySyncProps) => {
  const initRef = useRef(false);
  const lastDisplayRef = useRef('');
  const displayServiceRef = useRef<typeof eyabDisplayService | typeof displayService>(eyabDisplayService);

  useEffect(() => {
    // Inicializar el display una sola vez
    if (!initRef.current) {
      initRef.current = true;

      // Intentar Eyab primero (máquinas integradas)
      eyabDisplayService.connect().then((connected) => {
        if (connected) {
          displayServiceRef.current = eyabDisplayService;
          return;
        }

        // Si Eyab falla, intentar USB
        displayService.initialize({ type: 'usb' }).then(() => {
          displayServiceRef.current = displayService;
        }).catch(() => {
          // Si USB falla, intentar serie
          displayService.initialize({ type: 'serial' }).catch(() => {
            // Si ambos fallan, continuar sin display
          });
        });
      });
    }
  }, []);

  useEffect(() => {
    // Determinar si tenemos conexión a algún display
    const isEyabConnected = eyabDisplayService.getIsConnected();
    const isGeneralConnected = displayService.getIsConnected();

    if (!isEyabConnected && !isGeneralConnected) return;

    const service = isEyabConnected ? eyabDisplayService : displayService;
    let displayText = '';

    if (!isOnline) {
      displayText = 'OFFLINE';
    } else if (cartItems.length === 0) {
      displayText = '0.00'; // Eyab espera formato con decimales
    } else {
      // Mostrar el total en formato 0.00
      const formatted = (total / 100).toFixed(2);
      displayText = formatted;
    }

    // Solo actualizar si cambió
    if (displayText !== lastDisplayRef.current) {
      lastDisplayRef.current = displayText;

      if (isEyabConnected) {
        // Para Eyab, enviar solo texto
        if (cartItems.length === 0 && isOnline) {
          eyabDisplayService.showTotal(0).catch(() => {});
        } else if (!isOnline) {
          eyabDisplayService.sendText('OFFLINE').catch(() => {});
        } else {
          eyabDisplayService.showTotal(total).catch(() => {});
        }
      } else {
        // Para displays genéricos
        if (cartItems.length === 0 && isOnline) {
          displayService.showValue('0000').catch(() => {});
        } else if (!isOnline) {
          displayService.showMessage('OFFLINE').catch(() => {});
        } else {
          displayService.showTotal(total).catch(() => {});
        }
      }
    }
  }, [cartItems.length, total, isOnline]);

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      eyabDisplayService.clear().catch(() => {});
      displayService.clear().catch(() => {});
    };
  }, []);
};
