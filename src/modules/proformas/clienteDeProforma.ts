import type { Customer } from '@/services/customers/customersService';

/**
 * A QUIÉN SE LE HIZO LA PROFORMA.
 *
 * Una cotización se le hace a alguien con nombre, y al pasarla a venta ese
 * alguien se perdía: el POS corriente se quedaba solo con el nombre escrito en
 * la mesa y el POS electrónico ni eso. Las consecuencias no son cosméticas:
 *
 *  · Sin cliente no se puede emitir FACTURA electrónica, solo tiquete. El
 *    cliente que pidió la cotización justamente para tener factura se iba con
 *    un tiquete que no le sirve para su declaración.
 *  · Se pierden los precios del cliente, el crédito y la marca de «no contar
 *    en el cierre». Se cotizaba con precio de cliente y se cobraba de lista.
 *
 * Lo que NO se hace es adivinar. Un cliente se identifica por su cédula, no
 * por su nombre: «Pulpería La Esquina» y «Pulpería La Esquina S.A.» son dos
 * contribuyentes distintos, y emitirle a uno la factura del otro es un
 * comprobante mal dirigido que después hay que anular con nota de crédito.
 * Si no hay una coincidencia clara, se dice y se deja que el cajero elija.
 */
export interface ProformaCliente {
  customer_id?: string | null;
  customer_name?: string | null;
  customer_identification?: string | null;
}

export type ClienteResuelto =
  /** La proforma no tiene a nadie: venta normal, sin cliente. */
  | { estado: 'sin_nombre' }
  /** Se encontró uno solo, sin dudas. `por` dice con qué se encontró. */
  | { estado: 'encontrado'; cliente: Customer; por: 'id' | 'cedula' | 'nombre' }
  /** Varios con ese nombre: no se elige por el cajero. */
  | { estado: 'ambiguo'; nombre: string; candidatos: Customer[] }
  /** Tiene nombre pero no está en el catálogo de clientes. */
  | { estado: 'no_esta'; nombre: string; parecidos: Customer[] };

/** Minúsculas, sin acentos, sin puntuación y con los espacios colapsados. */
export function normalizarNombre(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,;:()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Solo los dígitos: una cédula se escribe con guiones o sin ellos. */
export function soloDigitos(s: unknown): string {
  return String(s ?? '').replace(/\D/g, '');
}

export interface BuscadorDeClientes {
  get: (id: string) => Promise<Customer>;
  list: (q?: string) => Promise<Customer[]>;
}

/**
 * Busca al cliente de la proforma, en orden de qué tan seguro es el dato.
 *
 * 1. `customer_id`: es el mismo cliente, no hay nada que interpretar.
 * 2. La CÉDULA: identifica a un contribuyente de forma única. Vale incluso si
 *    el nombre quedó escrito distinto —se cotizó a «Mary» y el catálogo dice
 *    «María Rodríguez Soto»—.
 * 3. El NOMBRE, y solo si coincide EXACTO (normalizado). Un parecido no
 *    alcanza: ver el comentario de arriba.
 */
export async function resolverClienteDeProforma(
  pf: ProformaCliente,
  api: BuscadorDeClientes,
): Promise<ClienteResuelto> {
  const nombre = String(pf?.customer_name ?? '').trim();
  const cedula = soloDigitos(pf?.customer_identification);
  const id = String(pf?.customer_id ?? '').trim();

  if (!id && !nombre && !cedula) return { estado: 'sin_nombre' };

  /* El cliente guardado en la proforma. Si ya no existe —se borró del
     catálogo— se sigue buscando en vez de darlo por perdido. */
  if (id) {
    try {
      const c = await api.get(id);
      if (c && c.id) return { estado: 'encontrado', cliente: c, por: 'id' };
    } catch { /* se busca por cédula o nombre */ }
  }

  if (cedula) {
    try {
      const porCedula = (await api.list(cedula) ?? [])
        .filter(c => soloDigitos(c.identification) === cedula);
      if (porCedula.length === 1) return { estado: 'encontrado', cliente: porCedula[0], por: 'cedula' };
      /* Dos clientes con la MISMA cédula es el catálogo duplicado, no una
         duda legítima: igual no se elige por el cajero. */
      if (porCedula.length > 1) {
        return { estado: 'ambiguo', nombre: nombre || cedula, candidatos: porCedula };
      }
    } catch { /* sigue por nombre */ }
  }

  if (!nombre) return { estado: 'no_esta', nombre: cedula, parecidos: [] };

  let candidatos: Customer[] = [];
  try { candidatos = (await api.list(nombre)) ?? []; } catch { candidatos = []; }

  const buscado = normalizarNombre(nombre);
  const exactos = candidatos.filter(c => normalizarNombre(c.name) === buscado);
  if (exactos.length === 1) return { estado: 'encontrado', cliente: exactos[0], por: 'nombre' };
  if (exactos.length > 1) return { estado: 'ambiguo', nombre, candidatos: exactos };
  return { estado: 'no_esta', nombre, parecidos: candidatos.slice(0, 5) };
}

/**
 * ¿Este cliente sirve para una FACTURA electrónica?
 *
 * Hacienda exige nombre + tipo de identificación + número. Sin los tres el
 * comprobante se rechaza, así que la pantalla no debe ofrecer la factura.
 */
export function sirveParaFactura(c: Customer | null | undefined): boolean {
  return !!(c && String(c.name ?? '').trim()
    && (c as any).identification_type
    && soloDigitos((c as any).identification));
}
