import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

export type DocumentType = 'ticket' | 'tiquete_electronico' | 'factura_electronica';

/**
 * ¿Se pueden emitir comprobantes ELECTRÓNICOS en este negocio?
 *
 * La condición depende del proveedor:
 *  · Facturemos → hace falta la ApiKey del emisor (por ambiente).
 *  · Alanube    → no usa ApiKey; el token vive en el servidor y la emisión usa la
 *    empresa principal de la cuenta. Basta con que la FE esté activa.
 *
 * Devuelve además el tipo de documento POR DEFECTO configurado, ya corregido: si
 * el default es electrónico pero la FE no está lista, cae a tiquete corriente.
 */
export function useFeReady() {
  const { planFeatures } = useAuth();
  const [feReady, setFeReady] = useState(false);
  const [defaultDocType, setDefaultDocType] = useState<DocumentType>('ticket');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!(planFeatures as any)?.electronic_invoice) {
      setFeReady(false); setDefaultDocType('ticket'); setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { apiFetch } = await import('@/lib/api');
        const raw = await apiFetch<any>('/settings/electronic-invoice');
        if (cancelled) return;
        const cfg = raw?.config ?? raw ?? {};
        const env = cfg.environment === 'sandbox' ? 'sandbox' : 'production';
        const provider = cfg.fe_provider === 'alanube' ? 'alanube' : 'facturemos';

        let ok: boolean;
        if (provider === 'alanube') {
          const companyId = env === 'sandbox' ? cfg.alanube_company_id_sandbox : cfg.alanube_company_id_production;
          ok = cfg.enabled !== false
            && (!!companyId || !!cfg.alanube_company_id || !!cfg.alanube_main_exists
              || !!cfg.alanube_registered_at || cfg.enabled === true);
        } else {
          const envKey = env === 'sandbox'
            ? (cfg.api_key_emisor_sandbox || cfg.api_key_emisor)
            : (cfg.api_key_emisor_production || cfg.api_key_emisor);
          ok = !!String(envKey ?? '').trim();
        }
        setFeReady(ok);

        const allowed: DocumentType[] = ['ticket', 'tiquete_electronico', 'factura_electronica'];
        const def = cfg.default_document_type as DocumentType | undefined;
        if (def && allowed.includes(def)) {
          setDefaultDocType(def !== 'ticket' && !ok ? 'ticket' : def);
        }
      } catch {
        if (!cancelled) { setFeReady(false); setDefaultDocType('ticket'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [planFeatures]);

  return { feReady, defaultDocType, loading };
}

export default useFeReady;
