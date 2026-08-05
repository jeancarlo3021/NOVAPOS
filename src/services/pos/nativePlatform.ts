/**
 * Detección del APK (Capacitor) y de lo que SÍ se puede hacer adentro.
 *
 * La app del APK carga la misma web en un WebView de Android, así que el código
 * es idéntico… pero el WebView NO es Chrome. Tres APIs que la impresión usa
 * simplemente no existen ahí:
 *
 *   · `navigator.bluetooth` (Web Bluetooth) — no implementado en Android WebView.
 *   · `navigator.serial` / `navigator.usb`  — tampoco.
 *   · `window.print()`                       — existe pero NO HACE NADA.
 *
 * Ese último es el peor: no lanza error, no imprime, no avisa. Desde el POS se
 * ve como si la impresión hubiera salido. Por eso todo esto se detecta explícito
 * y se le dice al cajero qué pasa, en vez de dejarlo esperando un tiquete que
 * nunca va a salir.
 */

/** ¿Estamos dentro del APK (WebView de Capacitor) y no en un navegador? */
export function isNativeApp(): boolean {
  try {
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform) return !!cap.isNativePlatform();
    return !!cap?.isNative;
  } catch { return false; }
}

/** Plataforma nativa: 'android' | 'ios' | 'web'. */
export function nativePlatform(): string {
  try { return (window as any).Capacitor?.getPlatform?.() ?? 'web'; } catch { return 'web'; }
}

/**
 * ¿El plugin nativo de Bluetooth está instalado en el APK?
 *
 * Se consulta en caliente para que la app funcione igual en el navegador (donde
 * el plugin no existe) sin romper el build.
 */
export function hasNativeBluetooth(): boolean {
  try {
    const plugins = (window as any).Capacitor?.Plugins;
    return !!plugins?.BluetoothLe;
  } catch { return false; }
}

/**
 * Qué decirle al cajero cuando pide imprimir POR EL NAVEGADOR dentro del APK.
 *
 * El APK sí imprime tiquetes térmicos (por el plugin nativo de Bluetooth); lo que
 * no tiene es el diálogo de impresión del sistema, que es lo que usan los
 * formatos de página entera (A4, cierres, reportes).
 */
export function nativePrintingMessage(): string {
  return 'La app de Android imprime tiquetes térmicos por Bluetooth, pero no puede abrir '
    + 'el diálogo de impresión del sistema. Para imprimir en hoja completa, abrí '
    + 'ColónClick en Chrome. Si querés tiquete, configurá la impresora como Bluetooth.';
}

/** Cuando el APK es viejo y no trae el módulo de impresión Bluetooth. */
export function outdatedNativeAppMessage(): string {
  return 'Esta versión de la app no trae el módulo de impresión Bluetooth. '
    + 'Actualizala desde «App de Android» o imprimí abriendo ColónClick en Chrome.';
}
