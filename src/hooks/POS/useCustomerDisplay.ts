import { useState, useEffect, useRef, useCallback } from 'react';

// Baud rates a probar para POS compactos (LED numérico):
// - 2400: estándar Eyab/DSP800 ← DEFAULT
// - 4800: alternativa común
// - 9600: pantallas LCD modernas
export type BaudRate = 2400 | 4800 | 9600 | 19200;

const STORAGE_KEY = 'pos_display_connected';
const STORAGE_BAUD = 'pos_display_baud';

interface UseCustomerDisplayReturn {
  isConnected: boolean;
  error: string | null;
  baudRate: BaudRate;
  connect: (baudRate?: BaudRate) => Promise<void>;
  disconnect: () => Promise<void>;
  updatePrice: (amount: number) => Promise<void>;
  updateDisplay: (line1: string, line2: string) => Promise<void>;
  autoReconnect: () => Promise<boolean>;
  setBaudRate: (rate: BaudRate) => void;
}

export const useCustomerDisplay = (): UseCustomerDisplayReturn => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [baudRate, setBaudRateState] = useState<BaudRate>(() => {
    const saved = localStorage.getItem(STORAGE_BAUD);
    const parsed = saved ? parseInt(saved, 10) : 2400;
    return ([2400, 4800, 9600, 19200].includes(parsed) ? parsed : 2400) as BaudRate;
  });

  const portRef = useRef<SerialPort | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);

  const setBaudRate = useCallback((rate: BaudRate) => {
    setBaudRateState(rate);
    localStorage.setItem(STORAGE_BAUD, String(rate));
  }, []);

  // ── Conectar al display ─────────────────────────────────────────────────────
  const connect = useCallback(async (overrideBaud?: BaudRate) => {
    try {
      setError(null);

      if (!('serial' in navigator)) {
        throw new Error('Web Serial API no soportada en este navegador. Usa Chrome o Edge.');
      }

      const baud = overrideBaud ?? baudRate;
      if (overrideBaud) setBaudRate(overrideBaud);

      const port = await navigator.serial.requestPort();
      portRef.current = port;

      await port.open({
        baudRate: baud,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
      });

      if (port.writable) {
        writerRef.current = port.writable.getWriter();
        setIsConnected(true);
        localStorage.setItem(STORAGE_KEY, '1');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido de conexión';
      setError(`No se pudo conectar al LED: ${msg}`);
      setIsConnected(false);
    }
  }, [baudRate, setBaudRate]);

  // ── Reconectar automáticamente a un puerto ya autorizado ───────────────────
  const autoReconnect = useCallback(async (): Promise<boolean> => {
    try {
      if (!('serial' in navigator)) return false;
      if (localStorage.getItem(STORAGE_KEY) !== '1') return false;

      const ports = await navigator.serial.getPorts();
      if (ports.length === 0) return false;

      const port = ports[0];
      portRef.current = port;

      await port.open({
        baudRate,
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
  }, [baudRate]);

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

  // ── Actualizar PRECIO (LED numérico — DSP800 / CD5220) ─────────────────────
  // Envía un valor numérico formateado a "    0.00" (8 dígitos right-aligned)
  const updatePrice = useCallback(async (amount: number) => {
    if (!writerRef.current || !isConnected) return;

    try {
      const encoder = new TextEncoder();

      // 1. ESC @ (0x1B, 0x40) — Inicialización / limpieza para pantallas LED numéricas
      const initCmd = new Uint8Array([0x1B, 0x40]);
      await writerRef.current.write(initCmd);

      // 2. Formato: 8 dígitos ajustados a la derecha, ej: "    4.50" o "12345.67"
      const safeAmount = Number.isFinite(amount) ? amount : 0;
      const precioString = safeAmount.toFixed(2).padStart(8, ' ');

      // 3. Convertir a bytes y enviar
      const dataBytes = encoder.encode(precioString);
      await writerRef.current.write(dataBytes);
    } catch (err) {
      console.error('Error escribiendo en el LED:', err);
      setError('Error de comunicación. Intenta reconectar.');
      setIsConnected(false);
    }
  }, [isConnected]);

  // ── (Legacy) Texto de 2 líneas — solo para LCDs alfanuméricos ──────────────
  const updateDisplay = useCallback(async (line1: string, line2: string) => {
    if (!writerRef.current || !isConnected) return;

    try {
      const encoder = new TextEncoder();
      const clearCmd = new Uint8Array([0x0C]);
      await writerRef.current.write(clearCmd);

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

  // ── Limpieza al desmontar ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (portRef.current) {
        disconnect();
      }
    };
  }, [disconnect]);

  return {
    isConnected,
    error,
    baudRate,
    connect,
    disconnect,
    updatePrice,
    updateDisplay,
    autoReconnect,
    setBaudRate,
  };
};
