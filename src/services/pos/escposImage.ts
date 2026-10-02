/**
 * EL LOGO EN LA IMPRESORA TÉRMICA.
 *
 * El logo se imprimía solo cuando el tiquete salía por el navegador o en hoja
 * A4, porque esos caminos son HTML y el `<img>` lo dibuja el navegador. La
 * impresora térmica —Bluetooth o QZ Tray, que es lo que usa el mostrador— recibe
 * bytes ESC/POS, y ahí nunca se mandó la imagen: el negocio subía su logo, lo
 * veía en la vista previa, y en el papel nunca salía.
 *
 * Una térmica no entiende PNG: imprime puntos. Hay que convertir la imagen a
 * blanco y negro de un bit y mandarla con `GS v 0` (ráster). Eso es lo que hace
 * este archivo.
 *
 * El resultado se guarda convertido: rasterizar pide el navegador y la imagen
 * desde la red, y el cobro no puede quedar esperando eso en cada venta. Ya
 * convertido, el logo también sale SIN internet, que es cuando el POS más
 * trabaja.
 */

/** Puntos por milímetro de una térmica de 203 dpi (el estándar). */
const PUNTOS_POR_MM = 8;
/**
 * Alto máximo del logo, en puntos (≈2 cm).
 *
 * Sin tope, un logo cuadrado en papel de 80 mm ocupa 7 cm de papel en cada
 * tiquete. Se paga en rollo y en tiempo de impresión.
 */
const ALTO_MAX = 160;
const CACHE_PREFIX = 'novapos_logo_escpos_';

const enMemoria = new Map<string, Uint8Array>();

const llave = (url: string, anchoMax: number) => `${CACHE_PREFIX}${anchoMax}_${url}`;

function guardado(url: string, anchoMax: number): Uint8Array | null {
  const k = llave(url, anchoMax);
  const mem = enMemoria.get(k);
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const bin = atob(raw);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    enMemoria.set(k, bytes);
    return bytes;
  } catch { return null; }
}

function guardar(url: string, anchoMax: number, bytes: Uint8Array): void {
  const k = llave(url, anchoMax);
  enMemoria.set(k, bytes);
  try {
    /**
     * Solo se guarda el logo ACTUAL.
     *
     * Al cambiar el logo, la dirección cambia (lleva la hora pegada), así que
     * cada cambio dejaría una copia vieja ocupando espacio para siempre. Y una
     * imagen convertida pesa decenas de kilobytes.
     */
    const mismoLogo = `_${url}`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const otra = localStorage.key(i);
      // Las de ESTE logo se conservan: pueden ser el mismo logo convertido para
      // otro ancho de papel (una caja de 58 mm y otra de 80 mm).
      if (otra && otra.startsWith(CACHE_PREFIX) && !otra.endsWith(mismoLogo)) {
        localStorage.removeItem(otra);
      }
    }
  } catch { /* sin acceso al almacenamiento: no pasa nada */ }
  try {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    localStorage.setItem(k, btoa(bin));
  } catch { /* sin espacio: queda solo en memoria */ }
}

/** Puntos imprimibles del papel: 48 mm en 58 mm de papel, 72 mm en 80 mm. */
export function puntosImprimibles(anchoCaracteres: number): number {
  const mm = anchoCaracteres >= 48 ? 72 : anchoCaracteres >= 40 ? 64 : 48;
  // Múltiplo de 8: la impresora recibe la imagen por bytes de 8 puntos.
  return Math.floor((mm * PUNTOS_POR_MM) / 8) * 8;
}

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Sin esto el canvas queda «contaminado» y leer los píxeles lanza: el logo
    // vive en otro dominio (el almacenamiento de archivos).
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('no se pudo cargar el logo'));
    img.src = url;
  });
}

/**
 * Convierte el logo en los bytes ESC/POS que lo imprimen, centrado.
 *
 * Devuelve null —sin lanzar— cuando no se puede: no hay logo, el navegador no
 * deja leer la imagen, o no hay red y tampoco copia guardada. El tiquete se
 * imprime igual sin logo; nunca se pierde una venta por una imagen.
 */
export async function logoEscPos(url: string, anchoCaracteres: number): Promise<Uint8Array | null> {
  if (!url) return null;
  const anchoMax = puntosImprimibles(anchoCaracteres);
  const ya = guardado(url, anchoMax);
  if (ya) return ya;

  try {
    const img = await cargarImagen(url);
    const escala = Math.min(1, anchoMax / (img.naturalWidth || anchoMax));
    let ancho = Math.max(8, Math.floor(((img.naturalWidth || anchoMax) * escala) / 8) * 8);
    let alto = Math.max(1, Math.round((img.naturalHeight || 1) * escala));
    if (alto > ALTO_MAX) {
      // Demasiado alto: se reescala por el alto y el ancho se recorta a bytes.
      const f = ALTO_MAX / alto;
      alto = ALTO_MAX;
      ancho = Math.max(8, Math.floor((ancho * f) / 8) * 8);
    }

    const canvas = document.createElement('canvas');
    canvas.width = ancho; canvas.height = alto;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Fondo blanco: un PNG transparente, sin esto, da negro y sale un borrón.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(img, 0, 0, ancho, alto);
    const px = ctx.getImageData(0, 0, ancho, alto).data;

    const bytesPorFila = ancho / 8;
    const datos = new Uint8Array(bytesPorFila * alto);
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < ancho; x++) {
        const i = (y * ancho + x) * 4;
        // Luminancia percibida. El umbral alto conviene: en térmica un gris
        // claro que no se imprime se ve mejor que un logo embarrado.
        const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        if (lum < 160) datos[y * bytesPorFila + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }

    const cabecera = [
      0x1B, 0x61, 0x01,                                  // ESC a 1 → centrado
      0x1D, 0x76, 0x30, 0x00,                            // GS v 0, modo normal
      bytesPorFila & 0xff, (bytesPorFila >> 8) & 0xff,   // ancho, en bytes
      alto & 0xff, (alto >> 8) & 0xff,                   // alto, en puntos
    ];
    // Volver a la IZQUIERDA es obligatorio: el resto del tiquete se centra
    // rellenando con espacios, así que si la impresora queda centrada los
    // totales y las columnas salen corridos.
    const pie = [0x0A, 0x1B, 0x61, 0x00];                // salto + ESC a 0

    const salida = new Uint8Array(cabecera.length + datos.length + pie.length);
    salida.set(cabecera, 0);
    salida.set(datos, cabecera.length);
    salida.set(pie, cabecera.length + datos.length);
    guardar(url, anchoMax, salida);
    return salida;
  } catch {
    return null;
  }
}
