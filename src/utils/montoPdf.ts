/**
 * IMPORTES PARA LOS PDF QUE ARMA jsPDF.
 *
 * Las fuentes estándar del PDF (Helvetica, Courier…) están codificadas en
 * **WinAnsi**, y el **colón (₡, U+20A1) no existe en WinAnsi**: jsPDF no falla,
 * lo sustituye, y en el archivo salía «¡5 000,00». Un comprobante de Costa Rica
 * con el signo de la moneda roto se ve como un error del sistema, porque lo es.
 *
 * WinAnsi sí tiene el signo de centavo (¢, U+00A2), que es prácticamente el
 * mismo dibujo —al colón le sobra una barra— y se imprime bien en cualquier
 * lector. Es lo que ya usaba el PDF de la factura, y acá queda en un solo lugar
 * para que el próximo PDF no vuelva a nacer con «¡».
 *
 * Para el colón EXACTO habría que embeber una tipografía (unos 400 KB en el
 * paquete de la app). En el servidor, donde eso no cuesta nada, los PDF sí
 * llevan el ₡ de verdad: ver `services/pdfFont.ts` del backend.
 *
 * En HTML (el tiquete, el correo, la vista de impresión) NO hace falta nada de
 * esto: ahí se usa ₡ normal.
 */
export const montoPdf = (n: number): string =>
  `¢${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default montoPdf;
