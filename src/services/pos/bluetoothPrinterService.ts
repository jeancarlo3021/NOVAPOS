// Servicio de impresión por Bluetooth (Web Bluetooth API) — multi-dispositivo.
// Soporta varias estaciones (caja, cocina, barra), cada una con su propia
// conexión, identificadas por un `id`. Funciona con impresoras térmicas ESC/POS
// en Chrome/Edge sobre HTTPS. Modos: BLE (Web Bluetooth), Serial (COM) y USB.

const PRINTER_SERVICE_UUIDS = [
  0x18f0,
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

export type BtMode = 'ble' | 'serial' | 'usb';

interface Conn {
  mode: BtMode;
  device?: any;          // BLE BluetoothDevice
  characteristic?: any;  // BLE write characteristic
  serialPort?: any;      // Web Serial port
  usbDevice?: any;       // Web USB device
  usbEndpoint?: number;  // bulk OUT endpoint
  name: string;
  deviceId?: string;     // BLE: device.id (para reconectar sin el selector)
}

// Conexiones por estación (id de PrinterEntry). El id '__single__' es el modo
// simple de una sola impresora (compatibilidad con el flujo anterior).
const conns = new Map<string, Conn>();
const SINGLE = '__single__';

// ── Soporte del navegador ──────────────────────────────────────────────────────
export const btIsSupported     = () => typeof navigator !== 'undefined' && !!(navigator as any).bluetooth;
export const serialIsSupported = () => typeof navigator !== 'undefined' && !!(navigator as any).serial;
export const usbIsSupported    = () => typeof navigator !== 'undefined' && !!(navigator as any).usb;

// ── Estado por estación ─────────────────────────────────────────────────────────
export function btIsConnectedFor(id: string): boolean {
  const c = conns.get(id);
  if (!c) return false;
  if (c.mode === 'serial') return !!c.serialPort;
  if (c.mode === 'usb')    return !!c.usbDevice;
  return !!c.characteristic && !!c.device?.gatt?.connected;
}
export function btDeviceNameFor(id: string): string | null {
  return conns.get(id)?.name ?? null;
}
export function btDeviceIdFor(id: string): string | null {
  return conns.get(id)?.deviceId ?? null;
}
export function btDisconnectFor(id: string): void {
  const c = conns.get(id);
  if (!c) return;
  try { c.device?.gatt?.disconnect(); } catch { /* ignore */ }
  try { c.serialPort?.close(); } catch { /* ignore */ }
  try { c.usbDevice?.close(); } catch { /* ignore */ }
  conns.delete(id);
}

// ── Conexión por estación ───────────────────────────────────────────────────────
async function connectBleFor(id: string): Promise<string> {
  if (!btIsSupported()) throw new Error('Este navegador no soporta Bluetooth web (usá Chrome/Edge en HTTPS).');
  const device = await (navigator as any).bluetooth.requestDevice({
    acceptAllDevices: true, optionalServices: PRINTER_SERVICE_UUIDS,
  });
  const server = await device.gatt.connect();
  let writeChar: any = null;
  for (const svc of await server.getPrimaryServices()) {
    for (const ch of await svc.getCharacteristics()) {
      if (ch.properties.write || ch.properties.writeWithoutResponse) { writeChar = ch; break; }
    }
    if (writeChar) break;
  }
  if (!writeChar) throw new Error('La impresora no expone una característica de escritura compatible.');
  const name = device.name ?? 'Impresora BT';
  conns.set(id, { mode: 'ble', device, characteristic: writeChar, name, deviceId: device.id });
  return name;
}

// ── Reconexión rápida: usa los dispositivos ya autorizados, sin abrir selector ──
async function findWriteChar(server: any): Promise<any> {
  for (const svc of await server.getPrimaryServices()) {
    for (const ch of await svc.getCharacteristics()) {
      if (ch.properties.write || ch.properties.writeWithoutResponse) return ch;
    }
  }
  return null;
}

export async function btReconnectFor(id: string, mode: BtMode, deviceId?: string): Promise<string> {
  if (mode === 'ble') {
    const bt = (navigator as any).bluetooth;
    if (!bt?.getDevices) throw new Error('Reconexión BLE no soportada por este navegador.');
    const devices: any[] = await bt.getDevices();
    const device = deviceId ? devices.find(d => d.id === deviceId) : devices[0];
    if (!device) throw new Error('La impresora no está autorizada todavía. Conéctala una vez.');
    const server = await device.gatt.connect();
    const writeChar = await findWriteChar(server);
    if (!writeChar) throw new Error('Sin característica de escritura.');
    const name = device.name ?? 'Impresora BT';
    conns.set(id, { mode: 'ble', device, characteristic: writeChar, name, deviceId: device.id });
    return name;
  }
  if (mode === 'serial') {
    const serial = (navigator as any).serial;
    if (!serial?.getPorts) throw new Error('Reconexión serie no soportada.');
    const ports: any[] = await serial.getPorts();
    const port = ports[0];
    if (!port) throw new Error('No hay un puerto COM autorizado. Conéctalo una vez.');
    try { await port.open({ baudRate: 9600 }); } catch { /* puede estar ya abierto */ }
    conns.set(id, { mode: 'serial', serialPort: port, name: 'Puerto serie/COM' });
    return 'Puerto serie/COM';
  }
  // usb
  const usb = (navigator as any).usb;
  if (!usb?.getDevices) throw new Error('Reconexión USB no soportada.');
  const devices: any[] = await usb.getDevices();
  const device = devices[0];
  if (!device) throw new Error('No hay un dispositivo USB autorizado. Conéctalo una vez.');
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  let endpoint: number | null = null;
  for (const iface of device.configuration.interfaces) {
    for (const alt of iface.alternates) {
      const out = alt.endpoints.find((e: any) => e.direction === 'out');
      if (out) { try { await device.claimInterface(iface.interfaceNumber); endpoint = out.endpointNumber; } catch { /* next */ } }
      if (endpoint != null) break;
    }
    if (endpoint != null) break;
  }
  if (endpoint == null) throw new Error('Sin endpoint de impresión.');
  const name = device.productName ?? 'Impresora USB';
  conns.set(id, { mode: 'usb', usbDevice: device, usbEndpoint: endpoint, name });
  return name;
}

async function connectSerialFor(id: string): Promise<string> {
  if (!serialIsSupported()) throw new Error('Este navegador no soporta Web Serial (usá Chrome/Edge en computadora).');
  const port = await (navigator as any).serial.requestPort();
  await port.open({ baudRate: 9600 });
  const name = 'Puerto serie/COM';
  conns.set(id, { mode: 'serial', serialPort: port, name });
  return name;
}

async function connectUsbFor(id: string): Promise<string> {
  if (!usbIsSupported()) throw new Error('Este navegador no soporta Web USB (usá Chrome/Edge en computadora).');
  const device = await (navigator as any).usb.requestDevice({ filters: [] });
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  let endpoint: number | null = null;
  for (const iface of device.configuration.interfaces) {
    for (const alt of iface.alternates) {
      const out = alt.endpoints.find((e: any) => e.direction === 'out');
      if (out) { try { await device.claimInterface(iface.interfaceNumber); endpoint = out.endpointNumber; } catch { /* next */ } }
      if (endpoint != null) break;
    }
    if (endpoint != null) break;
  }
  if (endpoint == null) throw new Error('No se encontró un endpoint de impresión en el dispositivo USB.');
  const name = device.productName ?? 'Impresora USB';
  conns.set(id, { mode: 'usb', usbDevice: device, usbEndpoint: endpoint, name });
  return name;
}

/** Conecta un dispositivo para una estación específica. */
export async function btConnectFor(id: string, mode: BtMode): Promise<string> {
  if (mode === 'ble')    return connectBleFor(id);
  if (mode === 'serial') return connectSerialFor(id);
  return connectUsbFor(id);
}

/** Envía bytes ESC/POS a la estación indicada. */
export async function btPrintTo(id: string, bytes: Uint8Array): Promise<void> {
  const c = conns.get(id);
  if (!c) throw new Error('Esa impresora Bluetooth no está conectada. Conéctala primero.');

  if (c.mode === 'usb') {
    if (!c.usbDevice || c.usbEndpoint == null) throw new Error('Impresora USB no conectada.');
    const CHUNK = 16384;
    for (let i = 0; i < bytes.length; i += CHUNK) await c.usbDevice.transferOut(c.usbEndpoint, bytes.slice(i, i + CHUNK));
    return;
  }
  if (c.mode === 'serial') {
    if (!c.serialPort) throw new Error('Puerto serie no conectado.');
    const writer = c.serialPort.writable.getWriter();
    try {
      const CHUNK = 1024;
      for (let i = 0; i < bytes.length; i += CHUNK) await writer.write(bytes.slice(i, i + CHUNK));
    } finally { writer.releaseLock(); }
    return;
  }
  // BLE
  const ch = c.characteristic;
  if (!ch || !c.device?.gatt?.connected) {
    // intentar reconectar
    await connectBleFor(id).catch(() => { throw new Error('Impresora Bluetooth desconectada.'); });
  }
  const ch2 = conns.get(id)?.characteristic;
  if (!ch2) throw new Error('Impresora Bluetooth no conectada.');
  const CHUNK = 180;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.slice(i, i + CHUNK);
    if (ch2.properties.writeWithoutResponse) await ch2.writeValueWithoutResponse(slice);
    else await ch2.writeValue(slice);
    await new Promise(r => setTimeout(r, 20));
  }
}

// ── Compatibilidad: API de una sola impresora (usa la estación '__single__') ────
export const btIsConnected = () => btIsConnectedFor(SINGLE);
export const btDeviceName  = () => btDeviceNameFor(SINGLE);
export const btDisconnect  = () => btDisconnectFor(SINGLE);
export const btRequestDevice   = () => btConnectFor(SINGLE, 'ble');
export const serialRequestPort = () => btConnectFor(SINGLE, 'serial');
export const usbRequestDevice  = () => btConnectFor(SINGLE, 'usb');
export const btPrint = async (bytes: Uint8Array) => {
  // Si no hay estación simple pero hay alguna conectada, usar la primera.
  if (!conns.has(SINGLE) && conns.size > 0) {
    const firstId = conns.keys().next().value as string;
    return btPrintTo(firstId, bytes);
  }
  return btPrintTo(SINGLE, bytes);
};
