/**
 * Impresión Bluetooth DENTRO del APK de Android.
 *
 * El WebView de Android no implementa Web Bluetooth, así que todo el flujo BLE
 * del navegador (`navigator.bluetooth`) es inservible en la app instalada. Este
 * módulo habla con el plugin nativo `@capacitor-community/bluetooth-le`, que sí
 * llega al Bluetooth del teléfono, y expone la MISMA forma que el servicio web
 * (`escanear → conectar → escribir bytes`) para que el resto del POS no tenga
 * que enterarse de en cuál de los dos está corriendo.
 *
 * El plugin se importa de forma ESTÁTICA. Antes se cargaba con `import(variable)`
 * para no obligar a tenerlo instalado, y eso NO PODÍA FUNCIONAR NUNCA: en tiempo
 * de ejecución el navegador recibe un especificador "desnudo"
 * (`@capacitor-community/bluetooth-le`) que no sabe resolver sin un import map.
 * Fallaba siempre y el POS respondía "la app no trae el módulo de impresión",
 * incluso con el plugin instalado y los permisos dados. Importándolo arriba, el
 * bundler lo empaqueta y el código llega resuelto.
 */
import { BleClient } from '@capacitor-community/bluetooth-le';

/** UUIDs de servicio típicos de impresoras térmicas ESC/POS por BLE. */
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

/** Característica de escritura por servicio (el orden importa: mismo índice). */
const WRITE_CHARS: Record<string, string[]> = {
  '000018f0-0000-1000-8000-00805f9b34fb': ['00002af1-0000-1000-8000-00805f9b34fb'],
  '49535343-fe7d-4ae5-8fa9-9fafd205e455': [
    '49535343-8841-43f4-a8d4-ecbe34729bb3',
    '49535343-aca3-481c-91ec-d85e28a60318',
  ],
  '0000ff00-0000-1000-8000-00805f9b34fb': ['0000ff02-0000-1000-8000-00805f9b34fb'],
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2': ['bef8d6c9-9c21-4c9e-b632-bd58c1009f9f'],
};

interface NativeConn {
  deviceId: string;
  name: string;
  service: string;
  characteristic: string;
}

const conns = new Map<string, NativeConn>();
let initialized = false;

/**
 * Inicializa el cliente BLE una sola vez.
 *
 * `androidNeverForLocation` acompaña al permiso declarado en el manifiesto: el
 * escaneo es solo para encontrar la impresora, no para ubicar al usuario. Sin
 * eso Android 12+ exige además permiso de ubicación para poder imprimir.
 */
async function ble(): Promise<typeof BleClient> {
  if (!initialized) {
    await BleClient.initialize({ androidNeverForLocation: true });
    initialized = true;
  }
  return BleClient;
}

/**
 * ¿Está el plugin NATIVO disponible?
 *
 * Se pregunta por el proxy que registra Capacitor, no por el import: el paquete
 * trae también una implementación web (que usa Web Bluetooth por debajo), así que
 * importarlo no prueba nada. Lo que importa es si hay plataforma nativa detrás.
 */
export function nativeBtAvailable(): boolean {
  try {
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return false;
    return !!cap?.Plugins?.BluetoothLe;
  } catch { return false; }
}

export function nativeBtIsConnected(id: string): boolean {
  return conns.has(id);
}

export function nativeBtDeviceName(id: string): string | null {
  return conns.get(id)?.name ?? null;
}

export function nativeBtDeviceId(id: string): string | null {
  return conns.get(id)?.deviceId ?? null;
}

/** Busca la combinación servicio+característica que acepta escritura. */
async function resolveWriteTarget(client: any, deviceId: string): Promise<{ service: string; characteristic: string }> {
  const services: any[] = await client.getServices(deviceId).catch(() => []);
  for (const svc of services) {
    const su = String(svc.uuid ?? '').toLowerCase();
    for (const ch of svc.characteristics ?? []) {
      const props = ch.properties ?? {};
      if (props.write || props.writeWithoutResponse) {
        return { service: su, characteristic: String(ch.uuid).toLowerCase() };
      }
    }
  }
  // Si el descubrimiento no devolvió nada usable, se prueban los UUIDs conocidos.
  for (const svc of PRINTER_SERVICES) {
    const chars = WRITE_CHARS[svc] ?? [];
    if (chars.length) return { service: svc, characteristic: chars[0] };
  }
  throw new Error('La impresora no expone un canal de escritura reconocible.');
}

/** Abre el selector del sistema y deja la impresora conectada para la estación. */
export async function nativeBtConnect(id: string): Promise<string> {
  const client = await ble();
  const device = await client.requestDevice({
    services: [],
    optionalServices: PRINTER_SERVICES,
  });
  await client.connect(device.deviceId, () => { conns.delete(id); });
  const target = await resolveWriteTarget(client, device.deviceId);
  const name = device.name || 'Impresora BT';
  conns.set(id, { deviceId: device.deviceId, name, ...target });
  return name;
}

/**
 * Reconecta sin abrir el selector, usando el id que ya se había guardado.
 * Al reabrir la app se pierde la conexión pero no el emparejamiento.
 */
export async function nativeBtReconnect(id: string, deviceId?: string): Promise<string> {
  if (!deviceId) throw new Error('La impresora no está emparejada todavía. Conectala una vez.');
  const client = await ble();
  await client.connect(deviceId, () => { conns.delete(id); });
  const target = await resolveWriteTarget(client, deviceId);
  const name = (await client.getDevices?.([deviceId]).catch(() => []))?.[0]?.name || 'Impresora BT';
  conns.set(id, { deviceId, name, ...target });
  return name;
}

/**
 * Envía los bytes ESC/POS.
 *
 * Va en trozos de 180 bytes con una pausa corta: los buffers de estas impresoras
 * son chicos y, mandando de corrido, cortan el tiquete a la mitad.
 */
export async function nativeBtPrint(id: string, bytes: Uint8Array): Promise<void> {
  const conn = conns.get(id);
  if (!conn) throw new Error('Esa impresora no está conectada. Conectala primero.');
  const client = await ble();

  const CHUNK = 180;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.slice(i, i + CHUNK);
    const view = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
    try {
      await client.writeWithoutResponse(conn.deviceId, conn.service, conn.characteristic, view);
    } catch {
      await client.write(conn.deviceId, conn.service, conn.characteristic, view);
    }
    await new Promise(r => setTimeout(r, 20));
  }
}

export async function nativeBtDisconnect(id: string): Promise<void> {
  const conn = conns.get(id);
  conns.delete(id);
  if (!conn) return;
  try { (await ble()).disconnect(conn.deviceId); } catch { /* ignore */ }
}
