// Service específico para displays integrados en máquinas Eyab POS
// Los displays Eyab se comunican generalmente por puerto COM interno
// Formato: número/texto + terminador (CR/LF o ETX)

interface EyabDisplayConfig {
  portName?: string;
  baudRate?: number;
  timeout?: number;
}

class EyabDisplayService {
  private port: SerialPort | null = null;
  private isConnected = false;
  private config: EyabDisplayConfig = {
    portName: 'COM3', // Puerto default para Eyab
    baudRate: 9600,
    timeout: 5000,
  };

  /**
   * Intenta conectar al display Eyab
   * Prueba puertos COM comunes
   */
  async connect(config?: EyabDisplayConfig): Promise<boolean> {
    this.config = { ...this.config, ...config };

    if (!('serial' in navigator)) {
      return false;
    }

    try {
      // Obtener puertos disponibles
      const ports = await (navigator as any).serial.getPorts();

      if (ports.length === 0) {
        // Si no hay puertos listados, intentar solicitar uno
        try {
          this.port = await (navigator as any).serial.requestPort({
            filters: [
              { usbVendorId: 0x10c4 }, // Silicon Labs (común en Eyab)
              { usbVendorId: 0x067b }, // Prolific (otro común)
              { usbVendorId: 0x0403 }, // FTDI (también usado)
            ],
          });
        } catch {
          return false;
        }
      } else {
        this.port = ports[0];
      }

      if (!this.port) return false;

      // Abrir puerto
      await (this.port as any).open({
        baudRate: this.config.baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none',
      });

      this.isConnected = true;
      return true;
    } catch (err) {
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Envía un número al display (formato: 0.00)
   */
  async showTotal(amount: number): Promise<boolean> {
    const formatted = amount.toLocaleString('es-CR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return this.sendDisplay(formatted);
  }

  /**
   * Envía texto al display
   */
  async sendText(text: string): Promise<boolean> {
    const truncated = text.substring(0, 16).padEnd(16, ' ');
    return this.sendDisplay(truncated);
  }

  /**
   * Envía un comando al display Eyab
   * Intenta múltiples formatos de terminador
   */
  private async sendDisplay(data: string): Promise<boolean> {
    if (!this.isConnected || !this.port) {
      return false;
    }

    try {
      const writer = (this.port as any).writable?.getWriter();
      if (!writer) return false;

      const encoder = new TextEncoder();

      // Intentar con diferentes terminadores
      // Formato 1: data + CR (0x0D)
      try {
        await writer.write(encoder.encode(data + '\r'));
        writer.releaseLock();
        return true;
      } catch {
        // continue
      }

      // Formato 2: data + LF (0x0A)
      try {
        await writer.write(encoder.encode(data + '\n'));
        writer.releaseLock();
        return true;
      } catch {
        // continue
      }

      // Formato 3: data + CR+LF
      try {
        await writer.write(encoder.encode(data + '\r\n'));
        writer.releaseLock();
        return true;
      } catch {
        // continue
      }

      // Formato 4: data + ETX (0x03)
      try {
        const arr = encoder.encode(data);
        const withETX = new Uint8Array(arr.length + 1);
        withETX.set(arr);
        withETX[arr.length] = 0x03; // ETX
        await writer.write(withETX);
        writer.releaseLock();
        return true;
      } catch {
        // continue
      }

      writer.releaseLock();
      return false;
    } catch (err) {
      return false;
    }
  }

  /**
   * Limpia el display (muestra espacios en blanco)
   */
  async clear(): Promise<boolean> {
    return this.sendText('                '); // 16 espacios
  }

  /**
   * Desconecta del puerto
   */
  async disconnect(): Promise<void> {
    if (this.port) {
      try {
        await (this.port as any).close();
      } catch {
        // ignore
      }
    }
    this.isConnected = false;
    this.port = null;
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Obtiene información de diagnóstico
   */
  async getDiagnosticInfo(): Promise<{
    connected: boolean;
    supportsSerial: boolean;
    portsAvailable: number;
  }> {
    let portsAvailable = 0;
    let supportsSerial = 'serial' in navigator;

    if (supportsSerial) {
      try {
        const ports = await (navigator as any).serial.getPorts();
        portsAvailable = ports.length;
      } catch {
        // ignore
      }
    }

    return {
      connected: this.isConnected,
      supportsSerial,
      portsAvailable,
    };
  }
}

export const eyabDisplayService = new EyabDisplayService();
