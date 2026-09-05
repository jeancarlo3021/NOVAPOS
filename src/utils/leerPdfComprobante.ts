/**
 * Lee un comprobante electrónico en PDF y saca sus datos.
 *
 * Alanube manda el PDF de cada comprobante por correo, y muchas veces es lo
 * único que queda de una factura que nunca llegó a la base: buscar su clave a
 * mano —50 dígitos partidos en varias líneas— es lento y se presta a error.
 *
 * Lo que de verdad importa es la CLAVE: con ella el importador trae el
 * comprobante completo desde Alanube, con sus líneas. El resto de los campos se
 * extraen como respaldo, para el caso en que haya que cargarlo a mano.
 */
export interface LineaDePdf {
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface DatosDePdf {
  clave: string | null;
  consecutivo: string | null;
  fecha: string | null;      // YYYY-MM-DD
  total: number | null;
  iva: number | null;
  cliente: string | null;
  lineas: LineaDePdf[];
  texto: string;             // el texto crudo, para revisar si algo no salió
}

/**
 * Texto del PDF RESPETANDO LAS FILAS.
 *
 * Un comprobante es una tabla, y `getTextContent` devuelve las celdas sueltas.
 * Pegarlas todas seguidas mezcla el nombre de un producto con el precio del
 * siguiente. Se agrupan por su posición vertical: lo que está a la misma altura
 * es una fila, que es como lo lee una persona.
 */
async function filasDelPdf(file: File): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  (pdfjs as any).GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await (pdfjs as any).getDocument({ data: await file.arrayBuffer() }).promise;
  const filas: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // y redondeado: dos celdas de la misma fila rara vez coinciden al decimal.
    const porAltura = new Map<number, Array<{ x: number; s: string }>>();
    for (const it of content.items as any[]) {
      const s = String(it.str ?? '');
      if (!s.trim()) continue;
      const y = Math.round((it.transform?.[5] ?? 0) / 3);
      const x = Number(it.transform?.[4] ?? 0);
      if (!porAltura.has(y)) porAltura.set(y, []);
      porAltura.get(y)!.push({ x, s });
    }
    // De arriba hacia abajo (en PDF la y crece hacia arriba).
    for (const y of [...porAltura.keys()].sort((a, b) => b - a)) {
      filas.push(porAltura.get(y)!.sort((a, b) => a.x - b.x).map(c => c.s).join(' ').trim());
    }
  }
  return filas;
}

/**
 * Busca la clave de 50 dígitos.
 *
 * En el PDF sale con espacios o guiones cada tantos dígitos, y a veces cortada
 * entre dos líneas, así que no sirve buscar 50 dígitos seguidos. Se juntan las
 * tiradas de dígitos y se busca una ventana de 50 que empiece como una clave de
 * Costa Rica: país 506 + día + mes + año.
 */
function buscarClave(texto: string): string | null {
  const compacto = texto.replace(/[\s\-.]/g, '');
  const soloDigitos = compacto.replace(/\D/g, '');
  for (let i = 0; i + 50 <= soloDigitos.length; i++) {
    const cand = soloDigitos.slice(i, i + 50);
    if (!cand.startsWith('506')) continue;
    const dd = Number(cand.slice(3, 5));
    const mm = Number(cand.slice(5, 7));
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12) continue;
    return cand;
  }
  return null;
}

/** Fecha de emisión, derivada de la clave (posiciones 4-9: dd mm aa). */
function fechaDeClave(clave: string): string | null {
  if (clave.length !== 50) return null;
  const dd = clave.slice(3, 5), mm = clave.slice(5, 7), aa = clave.slice(7, 9);
  return `20${aa}-${mm}-${dd}`;
}

/**
 * Monto total.
 *
 * Se toma el ÚLTIMO importe que aparece después de una etiqueta de total: en un
 * comprobante el gran total va al final, y agarrar el primer número con formato
 * de plata devolvería un subtotal o el precio de una línea.
 */
function buscarTotal(texto: string): number | null {
  const re = /total\s*(?:comprobante|general|a\s*pagar)?\s*:?\s*(?:₡|CRC|\$)?\s*([\d.,]{3,})/gi;
  let m: RegExpExecArray | null;
  let ultimo: number | null = null;
  while ((m = re.exec(texto)) !== null) {
    const crudo = m[1];
    // Formato de Costa Rica: punto separa miles y coma decimales.
    const normal = crudo.replace(/\./g, '').replace(',', '.');
    const v = Number(normal);
    if (Number.isFinite(v) && v > 0) ultimo = v;
  }
  return ultimo;
}

/** Un número con formato de plata de Costa Rica: 1.234,56 o 1234.56 */
function aNumero(txt: string): number {
  const t = txt.trim();
  // Con coma decimal: el punto separa miles. Sin coma, el punto es el decimal.
  const normal = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  const v = Number(normal);
  return Number.isFinite(v) ? v : 0;
}

/**
 * Líneas de detalle.
 *
 * Una fila de producto es: una descripción y después varios importes. Cuáles
 * son esos importes cambia entre plantillas —hay comprobantes con columna de
 * descuento, de impuesto, de exento—, así que no se asume el orden: se toman
 * todos los números de la fila y se deduce cuál es cuál.
 *
 * La CANTIDAD es el primero y el IMPORTE el último; el precio unitario es el
 * número del medio que hace cuadrar cantidad × precio = importe. Esa
 * comprobación es la que evita confundir el precio con el descuento, y también
 * descarta las filas que no son productos.
 */
function buscarLineas(filas: string[]): LineaDePdf[] {
  const NUM = String.raw`\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,3})?|\d+(?:[.,]\d{1,3})?`;
  const re = new RegExp(String.raw`^(.+?)\s+((?:(?:${NUM})\s+)+(?:${NUM}))$`);
  const descartar = /^(sub\s*total|total|iva|impuesto|descuento|exento|gravado|clave|consecutivo|resumen|condici|medio de pago|moneda|detalle|cant)/i;

  const out: LineaDePdf[] = [];
  for (const fila of filas) {
    const limpia = fila.replace(/[₡$]/g, ' ').replace(/\s+/g, ' ').trim();
    if (limpia.length < 6 || descartar.test(limpia)) continue;
    const m = re.exec(limpia);
    if (!m) continue;

    const nombre = m[1].trim();
    // El nombre tiene que parecer un nombre: con letras, no solo códigos.
    if (nombre.length < 3 || !/[A-Za-zÁÉÍÓÚÑáéíóúñ]{3}/.test(nombre)) continue;

    /**
     * Al menos TRES números: cantidad, precio e importe.
     *
     * Con dos entra cualquier renglón de datos del negocio —«Telefono 8888
     * 8888», «Cedula 3 101…»— y una línea inventada dentro de una factura vale
     * menos que una línea de menos.
     */
    const nums = m[2].split(/\s+/).map(aNumero);
    if (nums.length < 3) continue;
    const cantidad = nums[0];
    const importe = nums[nums.length - 1];
    if (!(cantidad > 0) || !(importe > 0)) continue;

    /**
     * El precio tiene que estar ESCRITO en la fila, no calculado.
     *
     * Deducirlo como importe ÷ cantidad cuadra siempre —es una división— y por
     * ahí entraba cualquier renglón de tres números, como «Cedula 3 101 612181».
     * Se exige que alguno de los números del medio sea el precio de verdad:
     *   cantidad × precio = importe, o
     *   cantidad × precio − descuento = importe (plantillas con descuento).
     */
    const medios = nums.slice(1, -1);
    const cerca = (v: number) => Math.abs(v - importe) / importe <= 0.01;
    const precio = medios.find(p =>
      p > 0 && (cerca(cantidad * p) || medios.some(d => d > 0 && cerca(cantidad * p - d))));
    // Ningún número cuadra: no es una fila de producto, o no se leyó bien. Se
    // descarta: una línea inventada en una factura es peor que una línea de menos.
    if (!precio) continue;

    out.push({
      product_name: nombre.slice(0, 200),
      quantity: cantidad,
      unit_price: Math.round(precio * 100) / 100,
      subtotal: importe,
    });
  }
  return out;
}

export async function leerPdfComprobante(file: File): Promise<DatosDePdf> {
  const filas = await filasDelPdf(file);
  const texto = filas.join('\n');
  const clave = buscarClave(texto);
  const cliente = /(?:receptor|cliente)\s*:?\s*([A-ZÁÉÍÓÚÑ][^\n]{3,60})/i.exec(texto)?.[1]?.trim() ?? null;
  const ivaTxt = /(?:total\s*)?(?:impuesto|iva)\s*:?\s*(?:₡|CRC)?\s*([\d.,]{1,})/i.exec(texto)?.[1];
  return {
    clave,
    consecutivo: clave ? clave.slice(31, 41) : null,
    fecha: clave ? fechaDeClave(clave) : null,
    total: buscarTotal(texto),
    iva: ivaTxt ? aNumero(ivaTxt) : null,
    cliente,
    lineas: buscarLineas(filas),
    texto,
  };
}
