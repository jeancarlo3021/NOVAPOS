// Service para controlar el mini monitor/display numérico integrado en la POS
// Soporta: USB, Serie, o acceso directo al hardware

interface DisplayConfig {
  type: 'usb' | 'serial' | 'direct';
  port?: string;
  baudrate?: number;
  vendorId?: string;
  productId?: string;
}

class DisplayService {
  private port: any = null;
  private config: DisplayConfig = { type: 'usb' };
  private isConnected = false;

  async initialize(config?: DisplayConfig): Promise<void> {
    this.config = config || this.config;

    if (!navigator.serial && !('usb' in navigator)) {
      return;
    }

    try {
      if (this.config.type === 'serial') {
        await this.initSerialPort();
      } else if (this.config.type === 'usb') {
        await this.initUSBPort();
      }
      this.isConnected = true;
    } catch (err) {
      this.isConnected = false;
    }
  }

  private async initSerialPort(): Promise<void> {
    if (!navigator.serial) return;

    try {
      this.port = await navigator.serial.requestPort({
        filters: [{ usbVendorId: 0x10c4 }], // Silicon Labs VCP
      });
      await this.port.open({
        baudRate: this.config.baudrate || 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
      });
    } catch (err) {
      throw new Error('No se pudo conectar al puerto serie del display');
    }
  }

  private async initUSBPort(): Promise<void> {
    if (!('usb' in navigator)) return;

    try {
      const device = await (navigator as any).usb.requestDevice({
        filters: [
          { vendorId: 0x0471 }, // Philips
          { vendorId: 0x10c4 }, // Silicon Labs
        ],
      });
      await device.open();
      this.port = device;
    } catch (err) {
      throw new Error('No se pudo conectar al display USB');
    }
  }

  /**
   * Muestra un número o texto en el display
   * Formato: "0001" (4 dígitos), "₡1500", "25 art", etc.
   */
  async showValue(value: string | number): Promise<void> {
    if (!this.isConnected) return;

    const display = String(value).padStart(4, '0').substring(0, 16);
    await this.sendCommand(display);
  }

  /**
   * Muestra el total formateado
   */
  async showTotal(total: number): Promise<void> {
    const formatted = total.toString().padStart(6, '0');
    await this.showValue(formatted);
  }

  /**
   * Muestra cantidad de artículos
   */
  async showItemCount(count: number): Promise<void> {
    await this.showValue(`${count} ART`);
  }

  /**
   * Muestra mensaje dinámico
   */
  async showMessage(message: string): Promise<void> {
    const truncated = message.substring(0, 16).padEnd(16, ' ');
    await this.sendCommand(truncated);
  }

  /**
   * Limpia el display
   */
  async clear(): Promise<void> {
    await this.sendCommand('                '); // 16 espacios
  }

  /**
   * Envía comando al display
   */
  private async sendCommand(data: string): Promise<void> {
    if (!this.isConnected || !this.port) return;

    try {
      if (this.config.type === 'serial' && navigator.serial) {
        const writer = this.port.writable?.getWriter();
        if (writer) {
          const encoder = new TextEncoder();
          await writer.write(encoder.encode(data));
          writer.releaseLock();
        }
      } else if (this.config.type === 'usb') {
        const encoder = new TextEncoder();
        await (this.port as any).transferOut(1, encoder.encode(data));
      }
    } catch (err) {
      this.isConnected = false;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.port) return;

    try {
      if (navigator.serial && this.port.close) {
        await this.port.close();
      } else if ((this.port as any).close) {
        await (this.port as any).close();
      }
    } catch {
      // ignore
    }
    this.isConnected = false;
    this.port = null;
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }
}

export const displayService = new DisplayService();
