/**
 * Texto para contar qué negocios se crearon solos al guardar los datos de FE.
 *
 * Crear un negocio es algo grande para que pase en silencio: quien guardó tiene
 * que enterarse de que ahora hay uno nuevo en el selector de empresa.
 */
export interface ResultadoActividades {
  actividades_creadas?: Array<{ nombre: string; economic_activity_code: string; sucursal: string }>;
  actividades_avisos?: string[];
}

export function describirActividades(r: ResultadoActividades | null | undefined): { creadas: string; avisos: string } {
  const creadas = (r?.actividades_creadas ?? [])
    .map(a => `«${a.nombre}» (actividad ${a.economic_activity_code}, sucursal ${a.sucursal})`);
  return {
    creadas: creadas.length
      ? `Se ${creadas.length === 1 ? 'creó el negocio' : 'crearon los negocios'} ${creadas.join(', ')}, `
        + 'ligado a este como principal. Lo encontrás en el selector de empresa.'
      : '',
    avisos: (r?.actividades_avisos ?? []).join(' · '),
  };
}
