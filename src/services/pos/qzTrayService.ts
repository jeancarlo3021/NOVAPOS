// QZ-Tray integration service
// QZ-Tray runs locally on the user's machine and exposes a WebSocket API.
// The global `qz` object is injected by QZ-Tray itself — no npm import needed.

declare const qz: any;

const PRIVATE_KEY_LS = 'qz_private_key';
const QZ_SCRIPT_URL = '/qz-tray.js';

// Load QZ Tray script dynamically
function loadQZTrayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).qz) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = QZ_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar QZ Tray script'));
    document.head.appendChild(script);
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PrinterEntry {
  id: string;
  label: string;           // "Principal", "Cocina", "Barra"
  type: 'receipt' | 'comanda';
  connection: 'usb' | 'network' | 'bluetooth';
  /** Comanda: categorías (ids) que se imprimen en esta estación. Vacío = todo lo
   *  que no esté asignado a otra estación (catch-all). */
  categories?: string[];
  printer_name?: string;   // USB: nombre en el SO
  ip?: string;             // Network: dirección IP
  port?: number;           // Network: puerto (default 9100)
  is_active: boolean;
  /** Bluetooth: sub-modo de conexión (BLE / Serial-COM / USB). */
  bt_mode?: 'ble' | 'serial' | 'usb';
  /** Bluetooth: nombre del dispositivo conectado (para mostrar). */
  bt_name?: string;
  /** Bluetooth BLE: id del dispositivo, para reconectar sin abrir el selector. */
  bt_device_id?: string;
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
  if (!privPem) throw new Error('No private key');

  try {
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
  } catch (err) {
    throw new Error('Invalid private key format');
  }
}

// ── QZ connection ─────────────────────────────────────────────────────────────

function getQZ(): any {
  if (typeof qz !== 'undefined') return qz;
  if ((window as any).qz) return (window as any).qz;
  throw new Error('QZ Tray no está disponible — asegúrese de que esté instalado y corriendo');
}

// ── Auto-reconnect ──────────────────────────────────────────────────────────
// Cuando QZ Tray se cae (se cierra la app, se pierde la red, se reinicia el
// servicio), intentamos reconectar varias veces con backoff exponencial.

export type QzStatus = 'connected' | 'disconnected' | 'reconnecting' | 'failed';

const RECONNECT_MAX_ATTEMPTS = 12;
const RECONNECT_BASE_DELAY = 1000;   // 1s, sube hasta ~15s
const RECONNECT_MAX_DELAY = 15000;

let autoReconnectEnabled = false;
let reconnecting = false;
let callbacksRegistered = false;
// Flag REAL de conexión. No usamos qz.websocket.isActive() para esto porque QZ
// considera "activo" un socket en estado CONNECTING (a medio abrir / colgado),
// lo que hacía que Config mostrara "conectado" sin estarlo.
let connected = false;

const statusListeners = new Set<(s: QzStatus, attempt?: number) => void>();

/** Suscribirse a cambios de estado de la conexión QZ (para UI/toasts). */
export function onQzStatus(cb: (s: QzStatus, attempt?: number) => void): () => void {
  statusListeners.add(cb);
  return () => statusListeners.delete(cb);
}

function emitStatus(s: QzStatus, attempt?: number) {
  for (const cb of statusListeners) { try { cb(s, attempt); } catch { /* noop */ } }
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Registra los callbacks de cierre/error de QZ para disparar la reconexión. */
function registerCloseCallbacks() {
  if (callbacksRegistered) return;
  let q: any;
  try { q = getQZ(); } catch { return; }
  try {
    q.websocket.setClosedCallbacks(() => {
      connected = false;
      emitStatus('disconnected');
      if (autoReconnectEnabled) void attemptReconnect();
    });
  } catch { /* versión de QZ sin este API */ }
  try {
    q.websocket.setErrorCallbacks(() => {
      // El error normalmente viene seguido de un close; no forzamos aquí.
    });
  } catch { /* noop */ }
  callbacksRegistered = true;
}

// ── Watchdog ────────────────────────────────────────────────────────────────
// A veces el socket muere sin disparar el evento de cierre (queda "half-open").
// Este chequeo periódico detecta que la conexión ya no está viva y dispara la
// reconexión aunque QZ nunca avisó.
const WATCHDOG_INTERVAL = 20000;   // 20s
let watchdogTimer: ReturnType<typeof setInterval> | null = null;

/** ¿El socket sigue realmente abierto? (consulta directa a QZ, sin nuestro flag) */
function rawSocketActive(): boolean {
  try { return getQZ().websocket.isActive(); } catch { return false; }
}

let visibilityHooked = false;
function hookVisibility() {
  if (visibilityHooked || typeof document === 'undefined') return;
  visibilityHooked = true;
  // Al volver al frente, los timers estaban estrangulados: chequeamos ya mismo.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!autoReconnectEnabled || reconnecting) return;
    if (connected && !rawSocketActive()) {
      connected = false;
      emitStatus('disconnected');
      void attemptReconnect();
    }
  });
}

function startWatchdog() {
  hookVisibility();
  if (watchdogTimer) return;
  watchdogTimer = setInterval(() => {
    if (!autoReconnectEnabled) return;
    if (reconnecting) return;
    // Creíamos estar conectados pero el socket ya no está vivo → reconectar.
    if (connected && !rawSocketActive()) {
      connected = false;
      emitStatus('disconnected');
      void attemptReconnect();
    }
  }, WATCHDOG_INTERVAL);
}

function stopWatchdog() {
  if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
}

/** Activa la reconexión automática + watchdog (idempotente). */
export function qzEnableAutoReconnect(): void {
  autoReconnectEnabled = true;
  registerCloseCallbacks();
  startWatchdog();
}

export function qzDisableAutoReconnect(): void {
  autoReconnectEnabled = false;
  stopWatchdog();
}

/** Reintenta conectar varias veces con backoff. Seguro de llamar en paralelo. */
export async function attemptReconnect(): Promise<boolean> {
  if (reconnecting) return false;
  if (qzIsConnected()) { emitStatus('connected'); return true; }
  reconnecting = true;
  try {
    for (let attempt = 1; attempt <= RECONNECT_MAX_ATTEMPTS; attempt++) {
      if (qzIsConnected()) { emitStatus('connected'); return true; }
      emitStatus('reconnecting', attempt);
      try {
        await qzConnect();
        if (qzIsConnected()) { emitStatus('connected'); return true; }
      } catch { /* sigue reintentando */ }
      const delay = Math.min(RECONNECT_BASE_DELAY * 2 ** (attempt - 1), RECONNECT_MAX_DELAY);
      await sleep(delay);
    }
    emitStatus('failed');
    return false;
  } finally {
    reconnecting = false;
  }
}

// Una sola conexión en curso a la vez. Si se llama qzConnect mientras otra
// conexión está en progreso (p. ej. el clic manual + la reconexión automática),
// ambas comparten la misma promesa en vez de crear dos WebSockets que se pisan
// (causa típica del error "connection.sendData is not a function").
let connectInFlight: Promise<void> | null = null;

export function qzConnect(certificate?: string): Promise<void> {
  if (connectInFlight) return connectInFlight;
  connectInFlight = qzConnectOnce(certificate).finally(() => { connectInFlight = null; });
  return connectInFlight;
}

async function qzConnectOnce(_certificate?: string): Promise<void> {
  void _certificate; // firma compat: el firmado usa la private key de localStorage
  // Try to load script if not already loaded
  if (!(window as any).qz) {
    await loadQZTrayScript();
  }

  const q = getQZ();
  if (connected && q.websocket.isActive()) { qzEnableAutoReconnect(); return; }
  // Si quedó un socket colgado en estado CONNECTING (isActive true pero nunca
  // terminó de abrir), lo cerramos antes de reintentar para no chocar.
  if (q.websocket.isActive()) {
    try { await q.websocket.disconnect(); } catch { /* noop */ }
  }

  // Only configure signing if a private key is available and valid.
  // Without signing, QZ Tray uses community mode (user approves once, then remembers).
  const privPem = localStorage.getItem(PRIVATE_KEY_LS);
  if (privPem) {
    try {
      q.security.setSignatureAlgorithm('SHA512');
      q.security.setSignaturePromise((toSign: string) => (resolve: any, reject: any) => {
        signMessage(toSign)
          .then(resolve)
          .catch(() => reject(new Error('Signing failed, using community mode')));
      });
    } catch {
      // Silently fall back to community mode if signing setup fails
    }
  }

  // Si la página corre en HTTPS, el navegador BLOQUEA ws:// (sin TLS) por
  // "mixed content". En ese caso solo sirve wss:// y NO intentamos el fallback
  // inseguro (en Edge/Chrome simplemente fallaría sin mensaje claro).
  const pageIsHttps = typeof location !== 'undefined' && location.protocol === 'https:';

  // wss primero (puertos 8181/8282). Si la página es HTTP, además probamos ws.
  const attempts: Array<{ usingSecure: boolean; label: string }> = pageIsHttps
    ? [{ usingSecure: true, label: 'wss' }]
    : [{ usingSecure: true, label: 'wss' }, { usingSecure: false, label: 'ws' }];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      // Más reintentos internos: Edge tarda más en el handshake del cert localhost.
      await q.websocket.connect({ usingSecure: attempt.usingSecure, retries: 2, delay: 1 });
      connected = true;
      qzEnableAutoReconnect();
      emitStatus('connected');
      return;
    } catch (err) {
      lastError = err;
      // Si ya quedó activo (OPEN) en algún reintento interno, salimos.
      if (q.websocket.isActive()) { connected = true; qzEnableAutoReconnect(); emitStatus('connected'); return; }
      // Continúa con el siguiente protocolo.
    }
  }

  if (pageIsHttps) {
    throw new Error(
      'No se pudo conectar a QZ Tray. En Edge/Chrome abrí https://localhost:8181 ' +
      'en una pestaña y aceptá el certificado (Avanzado → Continuar), luego reintentá.',
    );
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('No se pudo conectar a QZ Tray (wss ni ws)');
}

export async function qzDisconnect(): Promise<void> {
  qzDisableAutoReconnect();   // no reintentar tras una desconexión manual
  connected = false;
  try {
    const q = getQZ();
    if (q.websocket.isActive()) await q.websocket.disconnect();
  } catch {
    // ignore
  }
  emitStatus('disconnected');
}

export function qzIsConnected(): boolean {
  // Conexión REAL: nuestro flag (puesto al resolver connect / quitado al cerrar)
  // y que el socket siga abierto. Evita el falso positivo del estado CONNECTING.
  try {
    return connected && getQZ().websocket.isActive();
  } catch {
    return false;
  }
}

export async function qzIsAvailable(): Promise<boolean> {
  try {
    // Try to load script if not already loaded
    if (!(window as any).qz) {
      await loadQZTrayScript();
    }
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
 * QZ Tray serializa el payload del WebSocket a JSON. Si le pasamos un
 * Uint8Array directo, se convierte a {"0":27,"1":...} literalmente y
 * la impresora termina imprimiendo esa cadena. La forma correcta es
 * codificarlo a base64 y usar `format: 'base64'`.
 */
function uint8ToBase64(data: Uint8Array): string {
  let binary = '';
  // Procesamos en chunks para evitar el límite de argumentos de fromCharCode.
  const chunk = 0x8000;
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(data.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

/**
 * Print raw ESC/POS bytes to a USB printer (identified by OS name).
 */
export async function qzPrintUSB(printerName: string, data: Uint8Array): Promise<void> {
  const q = getQZ();
  const config = q.configs.create(printerName);
  await q.print(config, [{ type: 'raw', format: 'base64', data: uint8ToBase64(data) }]);
}

/**
 * Print raw ESC/POS bytes directly to a network printer via TCP socket.
 * Most thermal printers listen on port 9100.
 */
export async function qzPrintNetwork(ip: string, port: number, data: Uint8Array): Promise<void> {
  const q = getQZ();
  const config = q.configs.create({ host: ip, port });
  await q.print(config, [{ type: 'raw', format: 'base64', data: uint8ToBase64(data) }]);
}

/**
 * Print raw ESC/POS bytes to the system's DEFAULT printer via QZ Tray.
 * Se usa cuando el tenant no configuró una impresora específica: en vez de
 * abrir el diálogo del navegador, imprimimos raw a la default del sistema.
 */
export async function qzPrintDefault(data: Uint8Array): Promise<void> {
  const q = getQZ();
  // q.printers.getDefault() devuelve el nombre de la impresora por defecto.
  let printerName: string | null = null;
  try { printerName = await q.printers.getDefault(); } catch { /* sin default */ }
  if (!printerName) {
    // Si no hay default, tomamos la primera que encuentre.
    const list = await qzGetPrinters();
    printerName = list[0] ?? null;
  }
  if (!printerName) throw new Error('No hay impresoras disponibles en QZ Tray');
  const config = q.configs.create(printerName);
  await q.print(config, [{ type: 'raw', format: 'base64', data: uint8ToBase64(data) }]);
}

/**
 * Imprime HTML rasterizado a un tamaño físico exacto (para etiquetas).
 * QZ soporta `type:'pixel', format:'html'`: renderiza el HTML y lo manda
 * a la impresora al tamaño indicado en mm. Ideal para rotuladoras.
 */
export async function qzPrintHTML(
  printerName: string,
  html: string,
  opts: { widthMm: number; heightMm: number; copies?: number },
): Promise<void> {
  const q = getQZ();
  const config = q.configs.create(printerName, {
    size: { width: opts.widthMm, height: opts.heightMm },
    units: 'mm',
    margins: 0,
    colorType: 'blackwhite',
    rasterize: true,
    copies: opts.copies && opts.copies > 1 ? opts.copies : 1,
  });
  await q.print(config, [{
    type: 'pixel', format: 'html', flavor: 'plain',
    data: html,
    options: { pageWidth: opts.widthMm, pageHeight: opts.heightMm, units: 'mm' },
  }]);
}

/**
 * Imprime una imagen PNG (base64, sin prefijo) a un tamaño físico exacto en mm.
 * Más confiable que enviar HTML: el navegador ya rasterizó todo el contenido
 * (texto, código de barras, precio), y QZ solo imprime la imagen tal cual.
 */
export async function qzPrintImage(
  printerName: string,
  pngBase64: string,
  opts: { widthMm: number; heightMm: number; copies?: number },
): Promise<void> {
  const q = getQZ();
  const config = q.configs.create(printerName, {
    size: { width: opts.widthMm, height: opts.heightMm },
    units: 'mm',
    margins: 0,
    colorType: 'blackwhite',
    rasterize: true,
    copies: opts.copies && opts.copies > 1 ? opts.copies : 1,
  });
  await q.print(config, [{
    type: 'pixel', format: 'image', flavor: 'base64',
    data: pngBase64,
  }]);
}

/** Imprime VARIAS imágenes PNG (base64) en un solo trabajo. */
export async function qzPrintImageMany(
  printerName: string,
  pngs: string[],
  opts: { widthMm: number; heightMm: number },
): Promise<void> {
  if (!pngs.length) return;
  const q = getQZ();
  const config = q.configs.create(printerName, {
    size: { width: opts.widthMm, height: opts.heightMm },
    units: 'mm',
    margins: 0,
    colorType: 'blackwhite',
    rasterize: true,
  });
  await q.print(config, pngs.map(data => ({
    type: 'pixel', format: 'image', flavor: 'base64', data,
  })));
}

/**
 * Imprime VARIAS etiquetas HTML en un solo trabajo (impresión masiva).
 * Cada string de `htmls` es una etiqueta; se envían todas juntas al mismo tamaño.
 */
export async function qzPrintHTMLMany(
  printerName: string,
  htmls: string[],
  opts: { widthMm: number; heightMm: number },
): Promise<void> {
  if (!htmls.length) return;
  const q = getQZ();
  const config = q.configs.create(printerName, {
    size: { width: opts.widthMm, height: opts.heightMm },
    units: 'mm',
    margins: 0,
    colorType: 'blackwhite',
    rasterize: true,
  });
  const data = htmls.map(html => ({
    type: 'pixel', format: 'html', flavor: 'plain',
    data: html,
    options: { pageWidth: opts.widthMm, pageHeight: opts.heightMm, units: 'mm' },
  }));
  await q.print(config, data);
}

/**
 * Print to a PrinterEntry — handles USB vs network automatically.
 */
/**
 * Envía comandos TSPL crudos a una etiquetadora (Xprinter / TSC / Gprinter…).
 * Los comandos van en texto plano, uno por línea (CRLF).
 */
export async function qzSendTSPL(printerName: string, commands: string): Promise<void> {
  const bytes = new TextEncoder().encode(commands);
  await qzPrintUSB(printerName, bytes);
}

/**
 * Calibra el sensor de GAP (espacio entre etiquetas) de una etiquetadora TSPL.
 * Tras esto la impresora detecta el corte de cada etiqueta y se posiciona en el
 * borde de la siguiente, evitando que corte a media etiqueta.
 * `gapMm` = alto del espacio entre etiquetas (típico 2–3 mm).
 */
export async function qzCalibrateGap(
  printerName: string,
  opts: { widthMm: number; heightMm: number; gapMm?: number },
): Promise<void> {
  const gap = opts.gapMm ?? 2;
  const cmd =
    `SIZE ${opts.widthMm} mm, ${opts.heightMm} mm\r\n` +
    `GAP ${gap} mm, 0 mm\r\n` +
    `DIRECTION 1\r\n` +
    `CLS\r\n` +
    `GAPDETECT\r\n` +      // mide y memoriza el gap avanzando etiquetas
    `HOME\r\n`;            // se posiciona en el inicio de la siguiente etiqueta
  await qzSendTSPL(printerName, cmd);
}

export async function qzPrintToPrinter(printer: PrinterEntry, data: Uint8Array): Promise<void> {
  if (printer.connection === 'network') {
    if (!printer.ip) throw new Error(`Impresora "${printer.label}": IP no configurada`);
    await qzPrintNetwork(printer.ip, printer.port ?? 9100, data);
  } else {
    if (!printer.printer_name) throw new Error(`Impresora "${printer.label}": nombre de impresora no configurado`);
    await qzPrintUSB(printer.printer_name, data);
  }
}
