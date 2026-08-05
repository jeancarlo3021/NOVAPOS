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
 * El plugin se carga con `import()` en caliente y a propósito: en el navegador no
 * está instalado, y un import estático rompería el build de la web.
 *
 * ── Para que esto funcione en el APK ──────────────────────────────────────
 *   1) npm i @capacitor-community/bluetooth-le
 *   2) npx cap sync android
 *   3) En android/app/src/main/AndroidManifest.xml, permisos de Android 12+:
 *        BLUETOOTH_SCAN (con android:usesPermissionFlags="neverForLocation")
 *        BLUETOOTH_CONNECT
 *   4) Recompilar el APK.
 * Sin esos pasos este módulo queda inerte y el POS avisa que hay que usar Chrome.
 */

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
let bleModule: any = null;

async function ble(): Promise<any> {
  if (bleModule) return bleModule;
  try {
    // El especificador va en una variable a propósito: así ni TypeScript ni el
    // bundler intentan resolver un paquete que en la web NO está instalado.
    // En el APK sí existe y el import se resuelve en tiempo de ejecución.
    const pkg = '@capacitor-community/bluetooth-le';
    const mod: any = await import(/* @vite-ignore */ pkg);
    bleModule = mod.BleClient;
    await bleModule.initialize({ androidNeverForLocation: true });
    return bleModule;
  } catch (e) {
    throw new Error(
      'La app de Android no trae el módulo de impresión Bluetooth. '
      + 'Actualizá la app desde la tienda o imprimí desde Chrome.',
    );
  }
}

export function nativeBtAvailable(): boolean {
  try { return !!(window as any).Capacitor?.Plugins?.BluetoothLe; } catch { return false; }
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
