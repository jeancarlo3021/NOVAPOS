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
  /**
   * Comanda: estaciones de cocina (de la receta) que atiende esta impresora.
   *
   * Va aparte de las categorías porque son dos cosas distintas: la categoría es
   * de VENTA (Bebidas, Platos fuertes) y la estación es de PRODUCCIÓN (Barra,
   * Parrilla). Un postre y un café son categorías distintas que salen del mismo
   * lugar, y eso con categorías solas no se puede expresar.
   *
   * Antes la estación se adivinaba comparando con el NOMBRE de la impresora, que
   * se rompe apenas alguien la llama «Barra 1» o le corrige una tilde.
   */
  stations?: string[];
  /**
   * Comanda: GRUPOS de categorías asignados a esta impresora (ids de
   * `comandaGroups`).
   *
   * Marcar categoría por categoría en cada impresora se vuelve inmanejable: un
   * restaurante con cuarenta categorías y tres estaciones obliga a repetir el
   * mismo trabajo tres veces, y al crear una categoría nueva hay que acordarse
   * de ir a marcarla en la impresora que le toca —si no, el plato no se imprime
   * en ninguna parte—. Con grupos se arma «Cocina caliente» una vez y se le
   * asigna a la impresora.
   *
   * Las categorías sueltas (`categories`) siguen valiendo y se SUMAN a las del
   * grupo, para no romper lo que ya está configurado.
   */
  groups?: string[];
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

async function qzConnectOnce(certificate?: string): Promise<void> {
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

  /**
   * FIRMAR SOLO SI HAY CERTIFICADO *Y* LLAVE. Si falta uno, modo comunidad.
   *
   * Acá se configuraba la firma con solo encontrar una llave privada guardada en
   * el navegador, y NUNCA se configuraba el certificado del sitio
   * (`setCertificatePromise`). Eso le deja a QZ Tray una firma que no puede
   * verificar, porque no sabe con qué certificado comprobarla: el handshake se
   * rechaza. Desde afuera se ve exactamente como lo que estaba pasando — los
   * puertos responden, QZ está abierto, y la conexión no entra.
   *
   * Peor: una llave vieja que quedó de una prueba basta para romper la conexión
   * de un negocio que nunca quiso firmar nada.
   *
   * Sin firma, QZ usa el modo comunidad: muestra una vez su ventana de permiso y
   * la recuerda. Es lo que corresponde cuando no hay certificado.
   */
  const privPem = localStorage.getItem(PRIVATE_KEY_LS);
  const certPem = (certificate ?? '').trim();
  if (privPem && certPem) {
    try {
      q.security.setCertificatePromise((resolve: any) => resolve(certPem));
      q.security.setSignatureAlgorithm('SHA512');
      q.security.setSignaturePromise((toSign: string) => (resolve: any, reject: any) => {
        signMessage(toSign)
          .then(resolve)
          .catch(() => reject(new Error('Signing failed')));
      });
    } catch {
      // Si no se puede configurar, se sigue en modo comunidad.
    }
  } else if (privPem && !certPem) {
    console.warn('[QZ] Hay una llave privada guardada pero NO hay certificado: '
      + 'se conecta en modo comunidad. Una firma sin certificado hace que QZ rechace la conexión.');
  }

  // Si la página corre en HTTPS, el navegador BLOQUEA ws:// (sin TLS) por
  // "mixed content". En ese caso solo sirve wss:// y NO intentamos el fallback
  // inseguro (en Edge/Chrome simplemente fallaría sin mensaje claro).
  const pageIsHttps = typeof location !== 'undefined' && location.protocol === 'https:';

  // wss primero (puertos 8181/8282). Si la página es HTTP, además probamos ws.
  const attempts: Array<{ usingSecure: boolean; label: string }> = pageIsHttps
    ? [{ usingSecure: true, label: 'wss' }]
    : [{ usingSecure: true, label: 'wss' }, { usingSecure: false, label: 'ws' }];

  /**
   * PRIMERO `localhost.qz.io`, DESPUÉS `localhost`.
   *
   * Ese nombre es un registro público de QZ que apunta a 127.0.0.1, y QZ Tray
   * trae para él un certificado firmado por una autoridad en la que el navegador
   * YA confía. Conectando por ahí no aparece ninguna advertencia y no hay que
   * aceptar nada: es el camino por el que QZ resolvió justamente este problema.
   *
   * El cliente de QZ ya traía los dos nombres, pero en este orden: `localhost`
   * primero —el del certificado autofirmado, el que dispara la advertencia— y
   * recién después el confiable. Invertirlo es todo lo que hacía falta.
   *
   * Se deja `localhost` como respaldo porque `localhost.qz.io` necesita resolver
   * por DNS: en una red que lo bloquee, o sin internet, el respaldo salva.
   */
  const hosts = ['localhost.qz.io', 'localhost'];

  /**
   * Un intento que quedó COLGADO bloqueaba todos los siguientes.
   *
   * Si el handshake no termina —el caso típico cuando el navegador no confía en
   * el certificado: el socket se queda en CONNECTING en vez de fallar rápido— el
   * cliente de QZ rechaza cualquier `connect()` posterior con «An open connection
   * already exists» o «The current connection attempt has not returned yet». A
   * partir de ahí no vuelve a conectar por más que se reinicie QZ Tray, porque el
   * estado trabado está en la PÁGINA, no en QZ. Solo se arreglaba recargando.
   *
   * Cuando aparece uno de esos mensajes se fuerza el cierre y se reintenta una
   * vez, que es lo que antes había que hacer a mano con F5.
   */
  const estadoTrabado = (e: unknown) =>
    /already exists|has not returned|still closing/i.test(
      e instanceof Error ? e.message : String(e ?? ''));

  const intentar = async (usingSecure: boolean) => {
    try {
      await q.websocket.connect({ host: hosts, usingSecure, retries: 2, delay: 1 });
    } catch (e) {
      if (!estadoTrabado(e)) throw e;
      try { await q.websocket.disconnect(); } catch { /* ya estaba cerrado */ }
      await new Promise(r => setTimeout(r, 300));
      await q.websocket.connect({ host: hosts, usingSecure, retries: 1, delay: 1 });
    }
  };

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      // Más reintentos internos: Edge tarda más en el handshake del cert localhost.
      await intentar(attempt.usingSecure);
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

  /**
   * EL MOTIVO REAL VA EN EL MENSAJE.
   *
   * Acá se lanzaba un texto escrito a mano —«aceptá el certificado»— y se tiraba
   * a la basura el error que devuelve el cliente de QZ. Con eso, todas las fallas
   * se veían iguales y había que adivinar: el certificado, Chrome bloqueando el
   * acceso a la red local, una versión vieja de QZ, el socket ocupado. Tres
   * intentos de arreglo a ciegas después, el motivo seguía escondido.
   *
   * Los mensajes del cliente de QZ que importan:
   *   · «denied by Local Network Access restrictions» → Chrome bloqueó el acceso
   *     a localhost. Se destraba en el candado de la barra de direcciones.
   *   · «Unable to establish connection» → no hubo handshake: certificado no
   *     aceptado, QZ cerrado, o puerto ocupado.
   */
  const detalle = lastError instanceof Error ? lastError.message : String(lastError ?? 'sin detalle');
  const esLna = /local network|denied/i.test(detalle);
  if (pageIsHttps) {
    throw new Error(
      esLna
        ? 'Chrome bloqueó el acceso a la red local (QZ Tray corre en esta misma computadora). '
          + 'Tocá el candado en la barra de direcciones → Permisos → permitir el acceso a '
          + 'dispositivos de la red local, y reintentá. '
          + `[detalle: ${detalle}]`
        : 'No se pudo conectar a QZ Tray. Para imprimir YA, cambiá a «Imprimir por el navegador» '
          + 'en Configuración → Factura: no necesita QZ ni certificado. '
          + `[detalle: ${detalle}]`,
    );
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('No se pudo conectar a QZ Tray (wss ni ws)');
}

/**
 * DIAGNÓSTICO de por qué no conecta QZ Tray.
 *
 * «No se conecta» puede ser cuatro cosas muy distintas y hasta ahora todas se
 * veían iguales: el componente del navegador que no carga, QZ Tray que no está
 * abierto, el certificado de localhost sin aceptar, o el socket rechazando la
 * conexión por otra razón. Sin distinguirlas, el soporte es adivinar por
 * teléfono.
 *
 * Se prueba en orden y se devuelve el primer motivo real, con el paso concreto
 * que lo arregla.
 */
export interface DiagnosticoQz {
  pasos: Array<{ nombre: string; ok: boolean; detalle?: string }>;
  /** Qué hacer, en una frase, si algo falló. */
  recomendacion: string | null;
  version?: string | null;
}

/** ¿Responde algo en ese puerto con TLS aceptado por el navegador? */
async function puertoResponde(puerto: number, host = 'localhost'): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    // `no-cors`: no se puede leer la respuesta, pero si el handshake TLS falla
    // —o no hay nadie escuchando— la promesa se rechaza, que es justo el dato.
    await fetch(`https://${host}:${puerto}`, {
      mode: 'no-cors', cache: 'no-store', signal: ctrl.signal,
    });
    clearTimeout(t);
    return true;
  } catch { return false; }
}

/** ¿Estamos en la app INSTALADA (PWA), sin barra de direcciones ni candado? */
export function enAppInstalada(): boolean {
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches === true
      || (navigator as any).standalone === true;
  } catch { return false; }
}

export async function qzDiagnostico(certificado?: string): Promise<DiagnosticoQz> {
  const pasos: DiagnosticoQz['pasos'] = [];

  /**
   * LA APP INSTALADA NO PUEDE ACEPTAR PERMISOS NI CERTIFICADOS.
   *
   * En la ventana del PWA no hay barra de direcciones ni candado: no se puede
   * abrir https://localhost:8181 para aceptar el certificado, ni tocar el candado
   * para darle permiso de red local al sitio. Las dos cosas se piden UNA VEZ en
   * Chrome normal y quedan guardadas para el origen, así que después la app
   * instalada ya conecta.
   *
   * Sin decir esto, alguien puede pasar horas probando dentro del PWA: los
   * botones están, pero los diálogos que hacen falta no pueden aparecer ahí.
   */
  /**
   * EL ESTADO DE LA FIRMA, que es invisible y puede trabar todo.
   *
   * La llave privada vive en el navegador de cada equipo y el certificado en la
   * configuración del negocio. Si queda UNA de las dos —una llave de alguna
   * prueba, o un certificado pegado sin su llave— el handshake se rechaza: QZ
   * recibe una firma que no puede verificar, o un certificado sin firmas.
   *
   * Sin certificado y sin llave, QZ funciona en MODO COMUNIDAD: pide permiso una
   * vez y lo recuerda. No hace falta comprar ningún certificado para imprimir —
   * el certificado pago solo sirve para que no pregunte nunca.
   */
  const hayLlave = !!localStorage.getItem(PRIVATE_KEY_LS);
  const hayCert = !!(certificado ?? '').trim();
  pasos.push({
    nombre: 'Modo de conexión',
    ok: !(hayLlave !== hayCert),
    detalle: hayLlave && hayCert ? 'Firmado (certificado + llave)'
      : !hayLlave && !hayCert ? 'Comunidad — QZ pide permiso una vez y lo recuerda'
      : hayLlave ? 'HAY UNA LLAVE PRIVADA SIN CERTIFICADO: así QZ rechaza la conexión'
      : 'HAY UN CERTIFICADO SIN LLAVE PRIVADA: así QZ rechaza la conexión',
  });
  if (hayLlave !== hayCert) {
    return {
      pasos,
      recomendacion: 'Borrá el certificado y la llave privada (botón «Usar modo comunidad» '
        + 'en esta misma pantalla) y reintentá. Con los dos campos vacíos, QZ pide permiso una '
        + 'vez y queda andando: NO hace falta comprar ningún certificado para imprimir.',
    };
  }

  const pwa = enAppInstalada();
  if (pwa) {
    pasos.push({
      nombre: 'Estás en la app instalada (PWA)',
      ok: false,
      detalle: 'Acá no se pueden aceptar permisos ni certificados: no hay barra de direcciones',
    });
  }

  // 1. El componente del navegador (lo sirve la propia app).
  let scriptOk = !!(window as any).qz;
  if (!scriptOk) {
    try { await loadQZTrayScript(); scriptOk = !!(window as any).qz; } catch { scriptOk = false; }
  }
  pasos.push({
    nombre: 'Componente de impresión del navegador',
    ok: scriptOk,
    detalle: scriptOk ? undefined : 'No se pudo cargar /qz-tray.js',
  });
  if (!scriptOk) {
    return {
      pasos,
      recomendacion: 'Recargá la página (Ctrl+F5). Si sigue, la app quedó a medio '
        + 'actualizar: cerrá y volvé a abrir el navegador.',
    };
  }

  /**
   * 2. ¿Hay algo escuchando, y por cuál nombre?
   *
   * Importa CUÁL de los dos responde: por `localhost.qz.io` el certificado ya es
   * confiable y no hay que aceptar nada; por `localhost` el navegador va a pedir
   * aceptar el autofirmado.
   */
  const combinaciones: Array<{ host: string; puerto: number }> = [];
  for (const h of ['localhost.qz.io', 'localhost']) {
    for (const p of [8181, 8282]) combinaciones.push({ host: h, puerto: p });
  }
  let vivo: { host: string; puerto: number } | null = null;
  for (const c of combinaciones) {
    if (await puertoResponde(c.puerto, c.host)) { vivo = c; break; }
  }
  pasos.push({
    nombre: 'QZ Tray escuchando en la computadora',
    ok: vivo !== null,
    detalle: vivo
      ? `Responde en ${vivo.host}:${vivo.puerto}`
        + (vivo.host.endsWith('qz.io') ? ' — certificado ya confiable, no hay que aceptar nada' : '')
      : 'No responde en 8181 ni 8282',
  });
  const puertoVivo = vivo?.puerto ?? null;
  if (puertoVivo === null) {
    return {
      pasos,
      recomendacion: 'QZ Tray no responde por ninguno de los dos nombres. Revisá que esté '
        + 'abierto (icono en la bandeja del reloj). Si está abierto y sigue sin responder, la red '
        + 'de esta computadora está bloqueando el acceso a localhost. '
        + 'Mientras tanto se puede imprimir con «Imprimir por el navegador», que no necesita QZ.',
    };
  }

  const enChrome = (texto: string) => pwa
    ? 'Esto hay que hacerlo UNA VEZ en Chrome normal, no en la app instalada: abrí '
      + `${location.origin} en una pestaña de Chrome y ahí ${texto} Después volvé a la app: `
      + 'el permiso queda guardado para el sitio.'
    : texto;

  // 3. La conexión de verdad.
  try {
    await qzConnect();
    let version: string | null = null;
    try { version = await getQZ().api.getVersion(); } catch { /* opcional */ }
    pasos.push({ nombre: 'Conexión establecida', ok: true, detalle: version ? `QZ Tray ${version}` : undefined });
    return { pasos, recomendacion: null, version };
  } catch (e: any) {
    pasos.push({ nombre: 'Conexión establecida', ok: false, detalle: e?.message ?? 'rechazada' });
    /**
     * Responde pero rechaza: lo más probable es la VERSIÓN de QZ Tray.
     *
     * El certificado confiable de `localhost.qz.io` lo traen las versiones 2.1 y
     * posteriores. En una más vieja, ese nombre no tiene certificado válido y el
     * navegador lo rechaza igual que el autofirmado — ahí sí no queda más que
     * actualizar QZ o aceptar el certificado a mano.
     */
    const porQzIo = vivo?.host.endsWith('qz.io');
    return {
      pasos,
      recomendacion: pwa
        ? enChrome('tocá «Conectar QZ Tray» y aceptá lo que pida (el permiso de red local, '
          + 'y la ventana de QZ marcando «Remember»).')
        : porQzIo
        ? 'QZ Tray responde pero RECHAZA la conexión. La causa más común: este sitio quedó en '
          + 'la lista de BLOQUEADOS de QZ. Esa lista se guarda en disco, así que cerrar y volver '
          + 'a abrir QZ no la limpia. Clic derecho en el icono de QZ (junto al reloj) → Advanced '
          + '→ Site Manager: si aparece el sitio en «Blocked», quitalo y reintentá. '
          + 'Si no está, actualizá QZ Tray a la última versión.'
        : 'QZ Tray responde solo por «localhost», no por «localhost.qz.io» — eso pasa en '
          + 'versiones viejas de QZ. Actualizá QZ Tray a la última versión y vas a poder '
          + 'conectar SIN aceptar ningún certificado. Mientras tanto, imprimí por el navegador.',
    };
  }
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
/**
 * Imprime asegurando que el canal esté VIVO, y reintenta una vez.
 *
 * ── Por qué ────────────────────────────────────────────────────────────────
 * QZ corre en la computadora y su conexión se cae sola: la máquina se suspende,
 * se cambia de red, se reinicia el programa. `qz.websocket.isActive()` sigue
 * diciendo «activo» cuando el socket quedó a medio morir, así que se llamaba a
 * imprimir sobre un canal muerto: la impresión fallaba, el recibo no salía y el
 * cajero veía cortarse el cobro sin entender por qué.
 *
 * Acá se comprueba de verdad antes de mandar y, si la impresión falla por
 * conexión, se reconecta y se manda UNA vez más. Un segundo intento es seguro:
 * si el canal estaba muerto, el primero no llegó a la impresora.
 */
async function conCanalVivo(fn: (q: any) => Promise<void>): Promise<void> {
  if (!qzIsConnected() || !rawSocketActive()) {
    await qzConnect();
  }
  try {
    await fn(getQZ());
    return;
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? '');
    // Solo se reintenta si el problema fue el canal. Si la impresora rechazó el
    // trabajo (sin papel, nombre equivocado), repetir no arregla nada y podría
    // sacar el recibo dos veces.
    const esConexion = /websocket|connection|closed|not connected|sendData|socket|disconnect/i.test(msg);
    if (!esConexion) throw e;

    connected = false;
    emitStatus('disconnected');
    await qzConnect();
    await fn(getQZ());
  }
}

export async function qzPrintUSB(printerName: string, data: Uint8Array): Promise<void> {
  await conCanalVivo(async (q) => {
    const config = q.configs.create(printerName);
    await q.print(config, [{ type: 'raw', format: 'base64', data: uint8ToBase64(data) }]);
  });
}

/**
 * Print raw ESC/POS bytes directly to a network printer via TCP socket.
 * Most thermal printers listen on port 9100.
 */
export async function qzPrintNetwork(ip: string, port: number, data: Uint8Array): Promise<void> {
  await conCanalVivo(async (q) => {
    const config = q.configs.create({ host: ip, port });
    await q.print(config, [{ type: 'raw', format: 'base64', data: uint8ToBase64(data) }]);
  });
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
  await conCanalVivo(async (qq) => {
    const config = qq.configs.create(printerName!);
    await qq.print(config, [{ type: 'raw', format: 'base64', data: uint8ToBase64(data) }]);
  });
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
