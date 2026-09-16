/**
 * Emite el comprobante SIN dejar al vendedor esperando.
 *
 * En ruta, la venta se cobra con el cliente enfrente. La emisión va al servidor
 * y de ahí al proveedor, que puede tardar diez o veinte segundos: durante ese
 * rato la pantalla quedaba trabada y el ticket no salía. Y si la conexión móvil
 * está mala, peor.
 *
 * Con un plazo corto, el ticket sale igual. La emisión NO se cancela del lado
 * del servidor: la factura ya existe y su clave queda guardada cuando el
 * proveedor responda; lo único que se pierde es imprimirla en ese ticket.
 */
export interface DatosFeTicket {
  feClave?: string;
  feConsecutivo?: string;
  feTipoLabel?: string;
}

export async function emitirConPlazo(
  invoiceId: string,
  documentType: 'tiquete_electronico' | 'factura_electronica',
  plazoMs = 7000,
): Promise<{ feFields: DatosFeTicket; aTiempo: boolean; error?: string }> {
  try {
    const { haciendaService } = await import('@/services/hacienda/haciendaService');
    const res: any = await Promise.race([
      haciendaService.emit(invoiceId),
      new Promise<null>(resolve => setTimeout(() => resolve(null), plazoMs)),
    ]);

    // Se acabó el plazo: el ticket sale sin la clave y la emisión sigue su curso.
    if (res === null) return { feFields: {}, aTiempo: false };

    if (res?.clave) {
      const esFactura = (res.tipo ?? (documentType === 'factura_electronica' ? '01' : '04')) === '01';
      const consec = res.consecutivo
        ?? (typeof res.clave === 'string' && res.clave.length === 50 ? res.clave.slice(21, 41) : undefined);
      return {
        aTiempo: true,
        feFields: {
          feClave: res.clave,
          feConsecutivo: consec,
          feTipoLabel: esFactura ? 'FACTURA ELECTRÓNICA' : 'TIQUETE ELECTRÓNICO',
        },
      };
    }
    return { feFields: {}, aTiempo: true };
  } catch (e) {
    // Un fallo de emisión NO puede impedir entregar el ticket: la venta ya está
    // hecha y el comprobante se reintenta desde FE Facturas.
    console.error('[FE emit] no se pudo emitir ahora:', e);
    return { feFields: {}, aTiempo: true, error: e instanceof Error ? e.message : 'error' };
  }
}
