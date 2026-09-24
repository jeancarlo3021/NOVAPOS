import { zipSync, strToU8 } from 'fflate';
import { haciendaService } from '@/services/hacienda/haciendaService';

export interface AvanceXml {
  /** Comprobantes ya procesados y total del período. */
  hechos: number;
  total: number;
  /** XML que entraron al ZIP hasta ahora. */
  archivos: number;
  /** Lo que se está haciendo, para mostrarlo debajo de la barra. */
  detalle: string;
}

/**
 * Baja el CONSOLIDADO de XML de un período y arma el ZIP en el navegador.
 *
 * Va por tandas a propósito. Los XML que no están guardados hay que pedírselos
 * al proveedor uno por uno: en un mes con cientos de tiquetes, una sola llamada
 * se pasa del tiempo del servidor y se cae sin entregar nada. Con tandas, cada
 * llamada termina rápido, se puede mostrar cuánto lleva y lo que ya se bajó
 * queda guardado, así que si se corta, la próxima vez va más rápido.
 *
 * `onAvance` se llama después de cada tanda; `cancelado()` permite cortar.
 */
export async function descargarXmlConsolidado(
  rango: { from?: string; to?: string; tipo?: string },
  onAvance: (a: AvanceXml) => void,
  cancelado: () => boolean = () => false,
): Promise<{ total: number; archivos: number; faltantes: number; cancelado: boolean }> {
  const TANDA = 15;
  const archivos: Record<string, Uint8Array> = {};
  const resumen: Array<Record<string, any>> = [];
  let hechos = 0;
  let total = 0;

  for (let fila = 0; ; fila += TANDA) {
    if (cancelado()) break;
    const r = await haciendaService.xmlLote({ ...rango, desdeFila: fila, cantidad: TANDA });
    total = r.total;

    for (const a of r.archivos) {
      // base64 → bytes, sin pasar por texto (los XML llevan acentos).
      const bin = atob(a.xml_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      archivos[a.ruta] = bytes;
    }
    resumen.push(...r.resumen);
    hechos += r.procesados;

    onAvance({
      hechos, total,
      archivos: Object.keys(archivos).length,
      detalle: `Comprobante ${Math.min(hechos, total)} de ${total}`,
    });

    if (!r.hay_mas || r.procesados === 0) break;
  }

  /**
   * El resumen va SIEMPRE, aunque falte algún XML.
   *
   * Es la lista de lo que hay y de lo que no: un ZIP incompleto sin aviso se
   * archiva igual y el hueco aparece meses después.
   */
  const cab = ['fecha', 'tipo', 'consecutivo', 'clave', 'cliente', 'monto', 'estado', 'xml'];
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cab.join(';'), ...resumen.map(r => cab.map(k => esc(r[k])).join(';'))].join('\n');
  archivos['resumen.csv'] = strToU8('﻿' + csv);

  const zip = zipSync(archivos, { level: 6 });
  const nombre = `comprobantes-${rango.from ?? 'inicio'}_${rango.to ?? 'hoy'}.zip`;
  const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  const incluidos = Object.keys(archivos).length - 1;   // sin contar el resumen
  return {
    total,
    archivos: incluidos,
    faltantes: resumen.filter(r => String(r.xml ?? '').startsWith('no disponible')).length,
    cancelado: cancelado(),
  };
}
