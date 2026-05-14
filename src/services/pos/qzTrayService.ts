// QZ-Tray integration service
// QZ-Tray runs locally on the user's machine and exposes a WebSocket API.
// The global `qz` object is injected by QZ-Tray itself — no npm import needed.

declare const qz: any;

const PRIVATE_KEY_LS = 'qz_private_key';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PrinterEntry {
  id: string;
  label: string;           // "Principal", "Cocina", "Barra"
  type: 'receipt' | 'comanda';
  connection: 'usb' | 'network';
  printer_name?: string;   // USB: nombre en el SO
  ip?: string;             // Network: dirección IP
  port?: number;           // Network: puerto (default 9100)
  is_active: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN[\w\s]+-----/g, '')
    .replace(/-----END[\w\s]+-----/g, '')
    .replace(/\s/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function signMessage(message: string): Promise<string> {
  const privPem = localStorage.getItem(PRIVATE_KEY_LS);
  if (!privPem) throw new Error('Llave privada no configurada en este equipo');

  const der = pemToDer(privPem);
  const key = await window.crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const sig = await window.crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(message),
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// ── QZ connection ─────────────────────────────────────────────────────────────

function getQZ(): any {
  if (typeof qz !== 'undefined') return qz;
  if ((window as any).qz) return (window as any).qz;
  throw new Error('QZ Tray no está disponible — asegúrese de que esté instalado y corriendo');
}

export async function qzConnect(publicCert?: string): Promise<void> {
  const q = getQZ();
  if (q.websocket.isActive()) return;

  // Certificate (optional — required if site is not in QZ allow-list)
  if (publicCert?.trim()) {
    q.security.setCertificatePromise((_resolve: any, _reject: any) => {
      _resolve(publicCert);
    });
    q.security.setSignatureAlgorithm('SHA512');
    q.security.setSignaturePromise((toSign: string) => (resolve: any, reject: any) => {
      signMessage(toSign).then(resolve).catch(reject);
    });
  }

  await q.websocket.connect();
}

export async function qzDisconnect(): Promise<void> {
  try {
    const q = getQZ();
    if (q.websocket.isActive()) await q.websocket.disconnect();
  } catch {
    // ignore
  }
}

export function qzIsConnected(): boolean {
  try {
    return getQZ().websocket.isActive();
  } catch {
    return false;
  }
}

export function qzIsAvailable(): boolean {
  try {
    getQZ();
    return true;
  } catch {
    return false;
  }
}

export async function qzGetPrinters(): Promise<string[]> {
  const q = getQZ();
  if (!q.websocket.isActive()) throw new Error('QZ Tray no conectado');
  const list: string[] = await q.printers.find();
  return Array.isArray(list) ? list : [];
}

// ── Print functions ───────────────────────────────────────────────────────────

/**
 * Print raw ESC/POS bytes to a USB printer (identified by OS name).
 */
export async function qzPrintUSB(printerName: string, data: Uint8Array): Promise<void> {
  const q = getQZ();
  const config = q.configs.create(printerName);
  await q.print(config, [{ type: 'raw', format: 'command', data }]);
}

/**
 * Print raw ESC/POS bytes directly to a network printer via TCP socket.
 * Most thermal printers listen on port 9100.
 */
export async function qzPrintNetwork(ip: string, port: number, data: Uint8Array): Promise<void> {
  const q = getQZ();
  const config = q.configs.create({ host: ip, port });
  await q.print(config, [{ type: 'raw', format: 'command', data }]);
}

/**
 * Print to a PrinterEntry — handles USB vs network automatically.
 */
export async function qzPrintToPrinter(printer: PrinterEntry, data: Uint8Array): Promise<void> {
  if (printer.connection === 'network') {
    if (!printer.ip) throw new Error(`Impresora "${printer.label}": IP no configurada`);
    await qzPrintNetwork(printer.ip, printer.port ?? 9100, data);
  } else {
    if (!printer.printer_name) throw new Error(`Impresora "${printer.label}": nombre de impresora no configurado`);
    await qzPrintUSB(printer.printer_name, data);
  }
}
