import QRCode from 'qrcode';

/**
 * URL de consulta pública del comprobante electrónico — es el contenido que
 * se codifica en el QR según la representación impresa (resolución DGT 4.4).
 * NOTA: si Hacienda/Facturemos define otra URL exacta, cambiarla solo aquí.
 */
export function haciendaConsultaUrl(clave: string): string {
  return `https://www.hacienda.go.cr/ATV/ComprobanteElectronico/frmConsultaComprobantes.aspx?clave=${clave}`;
}

/** Genera el QR (PNG data URL) + el contenido (URL) para el comprobante. */
export async function generateFeQr(clave: string): Promise<{ url: string; dataUrl: string }> {
  const url = haciendaConsultaUrl(clave);
  const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 260, errorCorrectionLevel: 'L' });
  return { url, dataUrl };
}
