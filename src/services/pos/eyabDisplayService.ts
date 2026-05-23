// Service específico para displays integrados en máquinas Eyab POS (Eyab Jwk)
// Los displays Eyab usan protocolo CD5220 o ESC/POS
// Conexión: Virtual COM port (USB que emula serial)
//
// CD5220 Commands (más común en máquinas chinas como Eyab):
// - 0x0C       - Limpia display
// - 0x0B       - Cursor al inicio
// - 0x1B 0x51 0x41 + texto + 0x0D  - Línea superior
// - 0x1B 0x51 0x42 + texto + 0x0D  - Línea inferior
// - 0x1B 0x73  - Mostrar fecha/hora
//
// ESC/POS Commands (alternativo):
// - 0x1F 0x40  - Inicializar display
// - 0x1F 0x43 0x01 - Cursor on
// - 0x1F 0x24 X Y - Posición cursor

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
   * Envía un comando al display Eyab usando protocolo CD5220
   * Línea 1: texto superior (16 chars)
   * Línea 2: texto inferior (16 chars) - típicamente el total
   */
  private async sendDisplay(data: string): Promise<boolean> {
    if (!this.isConnected || !this.port) {
      return false;
    }

    try {
      const writer = (this.port as any).writable?.getWriter();
      if (!writer) return false;

      // Protocolo CD5220 - estándar para máquinas chinas Eyab
      const line1 = 'TOTAL:          '.substring(0, 16);
      const line2 = data.padEnd(16, ' ').substring(0, 16);

      // Comando CD5220 completo
      const cmd = new Uint8Array([
        0x0C,                          // Clear display
        0x1B, 0x51, 0x41,              // ESC Q A - escribir línea 1
        ...new TextEncoder().encode(line1),
        0x0D,                          // CR
        0x1B, 0x51, 0x42,              // ESC Q B - escribir línea 2
        ...new TextEncoder().encode(line2),
        0x0D,                          // CR
      ]);

      await writer.write(cmd);
      writer.releaseLock();
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Envía un comando ESC/POS alternativo (si CD5220 no funciona)
   */
  async sendDisplayESCPOS(text: string): Promise<boolean> {
    if (!this.isConnected || !this.port) return false;

    try {
      const writer = (this.port as any).writable?.getWriter();
      if (!writer) return false;

      const cmd = new Uint8Array([
        0x1F, 0x40,                    // Initialize display
        0x1F, 0x43, 0x00,              // Cursor off
        ...new TextEncoder().encode(text.padEnd(20, ' ').substring(0, 20)),
      ]);

      await writer.write(cmd);
      writer.releaseLock();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Modo de prueba: envía texto crudo sin formato
   */
  async sendRaw(text: string): Promise<boolean> {
    if (!this.isConnected || !this.port) return false;

    try {
      const writer = (this.port as any).writable?.getWriter();
      if (!writer) return false;

      const encoder = new TextEncoder();
      await writer.write(encoder.encode(text + '\r\n'));
      writer.releaseLock();
      return true;
    } catch {
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
