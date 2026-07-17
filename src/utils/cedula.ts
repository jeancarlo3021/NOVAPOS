// Máscaras / formato de cédulas de Costa Rica según el TIPO de identificación de
// Hacienda. Se usa en todos los campos de cédula del proyecto.
//
//   01 Física   → 9 dígitos  → 1-2345-6789   (1-4-4)
//   02 Jurídica → 10 dígitos → 3-101-234567  (1-3-6)
//   03 DIMEX    → 11-12 díg  → sin guiones
//   04 NITE     → 10 dígitos → sin guiones
//   05 Extranjero (sin ID) → texto libre (pasaporte, etc.)
//
// Guardar SIEMPRE el valor limpio (solo dígitos) y mostrar el formateado: así la
// base de datos y la emisión/recepción de FE comparan sin importar los guiones.

export type IdType = '01' | '02' | '03' | '04' | '05' | string;

/** Máximo de dígitos aceptados según el tipo. */
export function maxCedulaDigits(type?: IdType): number {
  switch (type) {
    case '01': return 9;    // física
    case '02': return 10;   // jurídica
    case '03': return 12;   // DIMEX (11 o 12)
    case '04': return 10;   // NITE
    default:   return 20;
  }
}

/** Deja solo lo válido para guardar (dígitos; alfanumérico para extranjero 05). */
export function cleanCedula(v: string, type?: IdType): string {
  if (type === '05') return String(v ?? '').replace(/[^0-9A-Za-z]/g, '').slice(0, 20);
  return String(v ?? '').replace(/\D/g, '').slice(0, maxCedulaDigits(type));
}

/** Devuelve la cédula formateada con guiones según el tipo (para MOSTRAR). */
export function formatCedula(v: string, type?: IdType): string {
  if (type === '05') return String(v ?? '');
  const d = cleanCedula(v, type);
  if (!d) return '';
  if (type === '01') {
    const m = d.match(/^(\d{1})(\d{0,4})(\d{0,4})$/);
    return m ? [m[1], m[2], m[3]].filter(Boolean).join('-') : d;
  }
  if (type === '02') {
    const m = d.match(/^(\d{1})(\d{0,3})(\d{0,6})$/);
    return m ? [m[1], m[2], m[3]].filter(Boolean).join('-') : d;
  }
  return d;   // DIMEX / NITE: sin guiones
}

/** Ejemplo/placeholder según el tipo. */
export function cedulaPlaceholder(type?: IdType): string {
  switch (type) {
    case '01': return '1-2345-6789';
    case '02': return '3-101-234567';
    case '03': return '155812345678';
    case '04': return '2000123456';
    case '05': return 'Pasaporte / ID extranjero';
    default:   return 'Número de identificación';
  }
}
