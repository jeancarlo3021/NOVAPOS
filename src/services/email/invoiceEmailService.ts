import { apiFetch } from '@/lib/api';

/**
 * Mandarle el comprobante al cliente por correo.
 *
 * El backend arma el correo con los renglones de la factura y lo envía; acá solo
 * se elige a quién. Sin destinatario, usa el correo guardado en la factura.
 */
export const invoiceEmail = {
  async send(invoiceId: string, to?: string): Promise<{ id: string; to: string }> {
    return apiFetch<{ id: string; to: string }>(`/email/invoice/${invoiceId}`, {
      method: 'POST',
      body: JSON.stringify(to ? { to } : {}),
    });
  },
};

export default invoiceEmail;
