import { savePdf } from '@/utils/savePdf';
import { cargarDatosComprobante } from './feInvoicePdf';
import { construirComprobantePdf } from './feComprobanteArchivo';

/**
 * BAJA el comprobante como archivo PDF.
 *
 * «Ver PDF» abre la ventana de impresión del navegador: sirve para imprimirlo,
 * pero para GUARDARLO hay que entrar al diálogo de impresión y elegir «Guardar
 * como PDF», y en la app de Android esa ventana ni siquiera existe. Quien
 * necesita mandarle el comprobante al contador por WhatsApp necesita el
 * archivo, no la vista previa.
 *
 * `savePdf` se encarga del caso de la app embebida, donde un `<a download>` no
 * hace nada.
 */
export async function descargarFeComprobantePdf(
  invoiceId: string, opts: { creditNote?: boolean } = {},
): Promise<void> {
  const { inv, emisor, receptor } = await cargarDatosComprobante(invoiceId);
  const { pdf, nombreArchivo } = construirComprobantePdf({ inv, emisor, receptor, creditNote: !!opts.creditNote });
  await savePdf(pdf, nombreArchivo);
}

export default descargarFeComprobantePdf;
