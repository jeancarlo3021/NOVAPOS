import { useState, useEffect, useRef, useCallback } from 'react';

interface UseCustomerDisplayReturn {
  isConnected: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  updateDisplay: (line1: string, line2: string) => Promise<void>;
  autoReconnect: () => Promise<boolean>;
}

const STORAGE_KEY = 'pos_display_connected';

export const useCustomerDisplay = (): UseCustomerDisplayReturn => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Refs persistentes — no causan re-renders
  const portRef = useRef<SerialPort | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);

  // ── Conectar al display ─────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    try {
      setError(null);

      if (!('serial' in navigator)) {
        throw new Error('Web Serial API no soportada en este navegador. Usa Chrome o Edge.');
      }

      // 1. Solicitar permiso de puerto al usuario
      const port = await navigator.serial.requestPort();
      portRef.current = port;

      // 2. Abrir puerto con configuración estándar POS
      await port.open({
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
      });

      // 3. Obtener el escritor y guardarlo en el ref
      if (port.writable) {
        writerRef.current = port.writable.getWriter();
        setIsConnected(true);
        localStorage.setItem(STORAGE_KEY, '1');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido de conexión';
      setError(`No se pudo conectar al LCD: ${msg}`);
      setIsConnected(false);
    }
  }, []);

  // ── Reconectar automáticamente a un puerto ya autorizado ───────────────────
  const autoReconnect = useCallback(async (): Promise<boolean> => {
    try {
      if (!('serial' in navigator)) return false;
      if (localStorage.getItem(STORAGE_KEY) !== '1') return false;

      const ports = await navigator.serial.getPorts();
      if (ports.length === 0) return false;

      // Tomar el primer puerto previamente autorizado
      const port = ports[0];
      portRef.current = port;

      await port.open({
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
      });

      if (port.writable) {
        writerRef.current = port.writable.getWriter();
        setIsConnected(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  // ── Desconectar de forma limpia ─────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    try {
      if (writerRef.current) {
        try { writerRef.current.releaseLock(); } catch {}
        writerRef.current = null;
      }
      if (portRef.current) {
        try { await portRef.current.close(); } catch {}
        portRef.current = null;
      }
      setIsConnected(false);
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error('Error al cerrar el puerto Serial:', err);
    }
  }, []);

  // ── Actualizar texto en pantalla (2 líneas de 20 caracteres) ───────────────
  const updateDisplay = useCallback(async (line1: string, line2: string) => {
    if (!writerRef.current || !isConnected) {
      return;
    }

    try {
      const encoder = new TextEncoder();

      // Comando ESC/POS para limpiar pantalla (0x0C)
      const clearCmd = new Uint8Array([0x0C]);
      await writerRef.current.write(clearCmd);

      // Formatear líneas: 20 caracteres exactos por fila
      const formattedLine1 = line1.padEnd(20).substring(0, 20);
      const formattedLine2 = line2.padEnd(20).substring(0, 20);

      const fullTextBytes = encoder.encode(`${formattedLine1}${formattedLine2}`);
      await writerRef.current.write(fullTextBytes);
    } catch (err) {
      console.error('Error escribiendo en el display:', err);
      setError('Error de comunicación. Intenta reconectar.');
      setIsConnected(false);
    }
  }, [isConnected]);

  // ── Limpieza al desmontar componente ───────────────────────────────────────
  useEffect(() => {
    return () => {
      if (portRef.current) {
        disconnect();
      }
    };
  }, [disconnect]);

  return { isConnected, error, connect, disconnect, updateDisplay, autoReconnect };
};
