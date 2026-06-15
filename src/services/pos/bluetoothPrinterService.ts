// Servicio de impresión por Bluetooth (Web Bluetooth API).
// Funciona con impresoras térmicas ESC/POS BLE en Chrome/Edge sobre HTTPS.
// Guarda el dispositivo emparejado para reconectar sin volver a elegir.

// Servicios GATT comunes en impresoras térmicas BT (58/80mm chinas, etc.)
const PRINTER_SERVICE_UUIDS = [
  0x18f0,                                  // servicio genérico de impresora
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',  // ISSC / módulos comunes
  '0000ff00-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

interface BTState {
  // BLE (Web Bluetooth) — móviles y algunas impresoras BLE en desktop
  device: any | null;
  characteristic: any | null;
  // Web Serial — desktop con impresora BT emparejada (puerto COM)
  serialPort: any | null;
  // Web USB — desktop con impresora térmica por cable USB
  usbDevice: any | null;
  usbEndpoint: number | null;
  mode: 'ble' | 'serial' | 'usb' | null;
}
const state: BTState = {
  device: null, characteristic: null, serialPort: null,
  usbDevice: null, usbEndpoint: null, mode: null,
};

export function btIsSupported(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).bluetooth;
}

export function serialIsSupported(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).serial;
}

export function usbIsSupported(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).usb;
}

export function btIsConnected(): boolean {
  if (state.mode === 'serial') return !!state.serialPort;
  if (state.mode === 'usb') return !!state.usbDevice;
  return !!state.characteristic && !!state.device?.gatt?.connected;
}

export function btDeviceName(): string | null {
  if (state.mode === 'serial') return 'Impresora (puerto serie/COM)';
  if (state.mode === 'usb') return state.usbDevice?.productName ?? 'Impresora USB';
  return state.device?.name ?? null;
}

/** Conecta por Web USB — la mejor opción para impresoras térmicas por cable
 *  USB en computadora. Detecta el dispositivo por su clase/endpoint. */
export async function usbRequestDevice(): Promise<string> {
  if (!usbIsSupported()) {
    throw new Error('Este navegador no soporta Web USB (usá Chrome/Edge en computadora).');
  }
  const usb = (navigator as any).usb;
  // Sin filtros estrictos para que aparezcan todas; el usuario elige la impresora.
  const device = await usb.requestDevice({ filters: [] });
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);

  // Buscar interfaz con endpoint de salida (bulk OUT) y reclamarla.
  let claimed = false;
  for (const iface of device.configuration.interfaces) {
    for (const alt of iface.alternates) {
      const out = alt.endpoints.find((e: any) => e.direction === 'out');
      if (out) {
        try {
          await device.claimInterface(iface.interfaceNumber);
          state.usbEndpoint = out.endpointNumber;
          claimed = true;
        } catch { /* probar siguiente */ }
      }
      if (claimed) break;
    }
    if (claimed) break;
  }
  if (!claimed) throw new Error('No se encontró un endpoint de impresión en el dispositivo USB.');

  state.usbDevice = device;
  state.mode = 'usb';
  return device.productName ?? 'Impresora USB';
}

/** Abre el selector del navegador para emparejar una impresora BT. */
export async function btRequestDevice(): Promise<string> {
  if (!btIsSupported()) throw new Error('Este navegador no soporta Bluetooth web (usá Chrome/Edge en HTTPS).');
  const bt = (navigator as any).bluetooth;
  const device = await bt.requestDevice({
    // acceptAllDevices para que aparezcan todas; optionalServices para poder
    // acceder a los servicios de impresión tras conectar.
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICE_UUIDS,
  });
  state.device = device;
  state.mode = 'ble';
  await btConnect();
  return device.name ?? 'Impresora BT';
}

/** Conecta por Web Serial — desktop con impresora Bluetooth emparejada en el
 *  SO (aparece como puerto COM) o impresora USB serie. */
export async function serialRequestPort(): Promise<string> {
  if (!serialIsSupported()) {
    throw new Error('Este navegador no soporta Web Serial (usá Chrome/Edge en computadora).');
  }
  const serial = (navigator as any).serial;
  const port = await serial.requestPort();
  await port.open({ baudRate: 9600 });  // térmicas suelen usar 9600; algunas 115200
  state.serialPort = port;
  state.mode = 'serial';
  return 'Puerto serie/COM';
}

/** Conecta (o reconecta) al device guardado y resuelve la característica de escritura. */
export async function btConnect(): Promise<void> {
  if (!state.device) throw new Error('No hay impresora Bluetooth seleccionada.');
  const server = await state.device.gatt.connect();

  // Buscar una característica escribible entre los servicios conocidos.
  let writeChar: any = null;
  const services = await server.getPrimaryServices();
  for (const svc of services) {
    const chars = await svc.getCharacteristics();
    for (const ch of chars) {
      if (ch.properties.write || ch.properties.writeWithoutResponse) {
        writeChar = ch;
        break;
      }
    }
    if (writeChar) break;
  }
  if (!writeChar) throw new Error('La impresora no expone una característica de escritura compatible.');
  state.characteristic = writeChar;
}

/** Envía bytes ESC/POS a la impresora (BLE, Serial o USB según el modo). */
export async function btPrint(bytes: Uint8Array): Promise<void> {
  // Modo USB (desktop / cable)
  if (state.mode === 'usb') {
    if (!state.usbDevice || state.usbEndpoint == null) throw new Error('Impresora USB no conectada.');
    const CHUNK = 16384;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      await state.usbDevice.transferOut(state.usbEndpoint, bytes.slice(i, i + CHUNK));
    }
    return;
  }

  // Modo Serial (desktop / COM)
  if (state.mode === 'serial') {
    if (!state.serialPort) throw new Error('Puerto serie no conectado.');
    const writer = state.serialPort.writable.getWriter();
    try {
      const CHUNK = 1024;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        await writer.write(bytes.slice(i, i + CHUNK));
      }
    } finally {
      writer.releaseLock();
    }
    return;
  }

  // Modo BLE (móvil / impresora BLE)
  if (!btIsConnected()) await btConnect();
  const ch = state.characteristic;
  if (!ch) throw new Error('Impresora Bluetooth no conectada.');

  const CHUNK = 180;  // tamaño seguro por escritura BLE
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.slice(i, i + CHUNK);
    if (ch.properties.writeWithoutResponse) {
      await ch.writeValueWithoutResponse(slice);
    } else {
      await ch.writeValue(slice);
    }
    await new Promise(r => setTimeout(r, 20));
  }
}

export function btDisconnect(): void {
  try { state.device?.gatt?.disconnect(); } catch { /* ignore */ }
  try { state.serialPort?.close(); } catch { /* ignore */ }
  try { state.usbDevice?.close(); } catch { /* ignore */ }
  state.characteristic = null;
  state.serialPort = null;
  state.usbDevice = null;
  state.usbEndpoint = null;
  state.mode = null;
}
