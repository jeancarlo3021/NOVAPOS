// Service para controlar displays LCD integrados en computadoras POS
// Soporta múltiples métodos de acceso y fabricantes

interface DisplayDiagnostics {
  method: 'detected' | 'not_detected';
  detectedMethods: string[];
  errors: string[];
}

class IntegratedDisplayService {
  private diagnosticsResult: DisplayDiagnostics | null = null;

  /**
   * Ejecuta diagnóstico para detectar cómo está conectado el display
   */
  async runDiagnostics(): Promise<DisplayDiagnostics> {
    const detected: string[] = [];
    const errors: string[] = [];

    // Método 1: Intentar acceso a COM ports (Windows)
    try {
      if ('serial' in navigator) {
        detected.push('Serial ports (COM) disponibles');
      }
    } catch (e) {
      errors.push(`Serial: ${String(e)}`);
    }

    // Método 2: Intentar USB HID
    try {
      if ('hid' in navigator) {
        detected.push('USB HID disponible');
      }
    } catch (e) {
      errors.push(`USB HID: ${String(e)}`);
    }

    // Método 3: Comprobar si hay acceso WebSocket a controlador local
    try {
      const response = await fetch('http://localhost:8888/display/info', {
        method: 'GET',
        timeout: 1000,
      }).catch(() => null);
      if (response?.ok) {
        detected.push('WebSocket local (puerto 8888) disponible');
      }
    } catch (e) {
      errors.push(`WebSocket local: ${String(e)}`);
    }

    // Método 4: Buscar archivos de dispositivo (Windows)
    if (typeof navigator !== 'undefined' && (navigator.userAgent.includes('Windows') || navigator.userAgent.includes('Win'))) {
      detected.push('Sistema Windows detectado - COM ports disponibles');
    }

    // Método 5: Intentar acceso directo Windows
    try {
      // En Windows, podría haber un driver específico
      if ((window as any).electronAPI) {
        detected.push('Electron API disponible');
      }
    } catch {
      // ignore
    }

    this.diagnosticsResult = {
      method: detected.length > 0 ? 'detected' : 'not_detected',
      detectedMethods: detected,
      errors,
    };

    return this.diagnosticsResult;
  }

  /**
   * Intenta enviar datos al display usando múltiples métodos
   */
  async sendToDisplay(text: string): Promise<{success: boolean; method?: string; error?: string}> {
    // Método 1: Serial COM
    try {
      if ('serial' in navigator) {
        return await this.trySendSerial(text);
      }
    } catch (e) {
      // continue
    }

    // Método 2: USB HID
    try {
      if ('hid' in navigator) {
        return await this.trySendUSBHID(text);
      }
    } catch (e) {
      // continue
    }

    // Método 3: WebSocket local
    try {
      return await this.trySendWebSocket(text);
    } catch (e) {
      // continue
    }

    // Método 4: Electron/Node.js
    try {
      if ((window as any).electronAPI) {
        return await this.trySendElectron(text);
      }
    } catch (e) {
      // continue
    }

    return {
      success: false,
      error: 'No se encontró método para acceder al display',
    };
  }

  private async trySendSerial(text: string): Promise<{success: boolean; method?: string; error?: string}> {
    try {
      if (!('serial' in navigator)) {
        return { success: false, error: 'Serial ports no disponibles' };
      }

      const ports = await (navigator as any).serial.getPorts();
      if (ports.length === 0) {
        return { success: false, error: 'No se encontraron puertos serie' };
      }

      const port = ports[0];
      if (!port.readable) {
        await port.open({ baudRate: 9600 });
      }

      const writer = port.writable!.getWriter();
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(text + '\n'));
      writer.releaseLock();

      return { success: true, method: 'Serial COM' };
    } catch (e) {
      return { success: false, error: `Serial: ${String(e)}` };
    }
  }

  private async trySendUSBHID(text: string): Promise<{success: boolean; method?: string; error?: string}> {
    try {
      if (!('hid' in navigator)) {
        return { success: false, error: 'USB HID no disponible' };
      }

      const devices = await (navigator as any).hid.getDevices();
      if (devices.length === 0) {
        return { success: false, error: 'No se encontraron dispositivos HID' };
      }

      const device = devices[0];
      if (!device.opened) {
        await device.open();
      }

      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      await device.sendReport(0, data);

      return { success: true, method: 'USB HID' };
    } catch (e) {
      return { success: false, error: `USB HID: ${String(e)}` };
    }
  }

  private async trySendWebSocket(text: string): Promise<{success: boolean; method?: string; error?: string}> {
    try {
      const response = await fetch('http://localhost:8888/display/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (response.ok) {
        return { success: true, method: 'WebSocket local (8888)' };
      }
      return { success: false, error: `HTTP error: ${response.status}` };
    } catch (e) {
      return { success: false, error: `WebSocket: ${String(e)}` };
    }
  }

  private async trySendElectron(text: string): Promise<{success: boolean; method?: string; error?: string}> {
    try {
      const api = (window as any).electronAPI;
      if (api && api.sendToDisplay) {
        await api.sendToDisplay(text);
        return { success: true, method: 'Electron' };
      }
      return { success: false, error: 'Electron API sin método sendToDisplay' };
    } catch (e) {
      return { success: false, error: `Electron: ${String(e)}` };
    }
  }

  getDiagnostics(): DisplayDiagnostics | null {
    return this.diagnosticsResult;
  }

  /**
   * Obtiene información del sistema que podría ser útil
   */
  getSystemInfo(): Record<string, any> {
    return {
      userAgent: navigator.userAgent,
      isWindows: navigator.userAgent.includes('Windows'),
      isLinux: navigator.userAgent.includes('Linux'),
      isMac: navigator.userAgent.includes('Mac'),
      supportsSerial: 'serial' in navigator,
      supportsHID: 'hid' in navigator,
      supportsWebUSB: 'usb' in navigator,
      hasElectron: !!(window as any).electronAPI,
    };
  }
}

export const integratedDisplayService = new IntegratedDisplayService();
