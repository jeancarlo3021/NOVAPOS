import { haciendaService } from './haciendaService';

/**
 * Si se agotó la cuota de comprobantes del plan, muestra una pantalla emergente
 * de aviso ("se acabaron las facturas, se cobrará ₡X c/u") y devuelve si el
 * usuario decide continuar. Si hay cupo (o falla la consulta) devuelve true.
 * Solo aplica online (la cuota se consulta al servidor).
 */
export async function confirmFeQuota(): Promise<boolean> {
  if (!navigator.onLine) return true;
  try {
    const q = await haciendaService.quota();
    if (q && q.available !== null && q.available <= 0 && q.extra_fee > 0) {
      return window.confirm(
        `⚠ Se acabaron las facturas incluidas de tu plan.\n\n` +
        `Cada comprobante adicional se cobra ₡${Number(q.extra_fee).toLocaleString('es-CR')}.\n` +
        `Este cobro extra aplica hasta pagar o hasta que se reinicie el mes.\n\n` +
        `¿Emitir de todos modos?`,
      );
    }
  } catch { /* si falla la consulta de cuota, no bloqueamos la venta */ }
  return true;
}
