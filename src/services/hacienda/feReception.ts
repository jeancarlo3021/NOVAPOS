/**
 * Recepción de facturas: lee el XML de la factura electrónica de un proveedor
 * (formato Hacienda CR 4.x) y extrae los datos para registrarla como gasto/compra.
 */

export interface FeReceivedLine {
  detalle: string;
  cantidad: number;
  precioUnitario: number;
  montoTotal: number;
  cabys?: string;
}

export interface FeReceived {
  tipo: 'factura' | 'tiquete' | 'nota_credito' | 'otro';
  clave: string;
  consecutivo: string;
  fecha: string;           // ISO
  emisor: { nombre: string; identificacion: string };
  receptor: { nombre?: string; identificacion?: string };
  condicionVenta: string;  // 01 contado, 02 crédito
  medioPago: string;
  subtotal: number;
  impuesto: number;
  total: number;
  lineas: FeReceivedLine[];
}

const txt = (el: Element | null | undefined, ...tags: string[]): string => {
  if (!el) return '';
  for (const t of tags) {
    // getElementsByTagName ignora el namespace/prefijo → robusto ante distintos XSD.
    const found = el.getElementsByTagName(t)[0];
    if (found?.textContent) return found.textContent.trim();
  }
  return '';
};
const num = (s: string) => Number(String(s).replace(/[^\d.-]/g, '')) || 0;

/** Parsea el string XML de una factura electrónica recibida. */
export function parseFeXml(xml: string): FeReceived {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('El archivo no es un XML válido.');
  }
  const root = doc.documentElement;
  const rootName = (root?.localName || root?.nodeName || '').toLowerCase();
  const tipo: FeReceived['tipo'] =
    rootName.includes('notacredito') ? 'nota_credito'
    : rootName.includes('factura') ? 'factura'
    : rootName.includes('tiquete') ? 'tiquete' : 'otro';

  const emisorEl = root.getElementsByTagName('Emisor')[0] ?? null;
  const receptorEl = root.getElementsByTagName('Receptor')[0] ?? null;
  const resumenEl = root.getElementsByTagName('ResumenFactura')[0] ?? null;

  const lineas: FeReceivedLine[] = [];
  const lineEls = root.getElementsByTagName('LineaDetalle');
  for (let i = 0; i < lineEls.length; i++) {
    const l = lineEls[i];
    lineas.push({
      detalle: txt(l, 'Detalle'),
      cantidad: num(txt(l, 'Cantidad')),
      precioUnitario: num(txt(l, 'PrecioUnitario')),
      montoTotal: num(txt(l, 'MontoTotalLinea', 'MontoTotal', 'SubTotal')),
      cabys: txt(l, 'CodigoCABYS', 'Codigo'),
    });
  }

  const impuesto = num(txt(resumenEl, 'TotalImpuesto'));
  const total = num(txt(resumenEl, 'TotalComprobante'));
  const subtotal = num(txt(resumenEl, 'TotalVentaNeta', 'SubTotal')) || (total - impuesto);
  const medioEl = resumenEl?.getElementsByTagName('MedioPago')[0];

  return {
    tipo,
    clave: txt(root, 'Clave'),
    consecutivo: txt(root, 'NumeroConsecutivo'),
    fecha: txt(root, 'FechaEmision'),
    emisor: {
      nombre: txt(emisorEl, 'Nombre'),
      identificacion: txt(emisorEl?.getElementsByTagName('Identificacion')[0] as any, 'Numero'),
    },
    receptor: {
      nombre: txt(receptorEl, 'Nombre'),
      identificacion: txt(receptorEl?.getElementsByTagName('Identificacion')[0] as any, 'Numero'),
    },
    condicionVenta: txt(root, 'CondicionVenta'),
    medioPago: medioEl?.textContent?.trim() ?? '',
    subtotal, impuesto, total,
    lineas,
  };
}

/** Mapea el medio de pago de Hacienda a nuestro método (para el gasto). */
export function medioPagoToMethod(medio: string): 'cash' | 'card' | 'sinpe' | 'transfer' | 'check' {
  switch (String(medio).padStart(2, '0')) {
    case '02': return 'card';
    case '03': return 'check';
    case '04': return 'transfer';
    case '06': return 'sinpe';
    default:   return 'cash';
  }
}
