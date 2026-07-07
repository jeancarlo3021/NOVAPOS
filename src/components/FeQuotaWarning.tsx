import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, X, FileWarning } from 'lucide-react';
import { haciendaService } from '@/services/hacienda/haciendaService';
import { useTenantId } from '@/hooks/useTenant';
import { useAuth } from '@/context/AuthContext';

/**
 * Aviso de cuota de comprobantes electrónicos (bolsa prepagada). Muestra una
 * pantalla cuando quedan pocos comprobantes (50, 20, 10) y cuando se agotan (0),
 * una sola vez por umbral y por bolsa vigente (se reinicia al renovar/pagar).
 *
 * Se monta en POS, Distribución y Repartidor. Escucha el evento
 * `fe:quota-changed` para re-chequear tras cada emisión.
 */
const THRESHOLDS = [50, 20, 10, 0];

type Quota = Awaited<ReturnType<typeof haciendaService.quota>>;

export function FeQuotaWarning() {
  const { planFeatures } = useAuth();
  const { tenantId } = useTenantId();
  const [quota, setQuota] = useState<Quota | null>(null);
  const [band, setBand] = useState<number | null>(null);

  const keyFor = useCallback((q: Quota) =>
    `fe_quota_warned_${tenantId ?? ''}_${q.quota_start ?? ''}`, [tenantId]);

  const check = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const q = await haciendaService.quota();
      if (!q || q.included <= 0 || q.available == null) return; // ilimitado o sin FE
      const avail = q.available;
      // Umbral vigente = el más bajo que ya se cruzó.
      const b = THRESHOLDS.filter(t => avail <= t).sort((a, z) => a - z)[0];
      if (b === undefined) return;                 // todavía quedan > 50
      let seen: number[] = [];
      try { seen = JSON.parse(localStorage.getItem(keyFor(q)) || '[]'); } catch { /* */ }
      if (seen.includes(b)) return;                // ya se avisó este umbral en esta bolsa
      setQuota(q); setBand(b);
    } catch { /* si falla la consulta, no molestamos */ }
  }, [keyFor]);

  useEffect(() => {
    if (!planFeatures?.electronic_invoice) return;
    check();
    const h = () => check();
    window.addEventListener('fe:quota-changed', h);
    return () => window.removeEventListener('fe:quota-changed', h);
  }, [check, planFeatures?.electronic_invoice]);

  const dismiss = () => {
    if (quota && band != null) {
      const k = keyFor(quota);
      let seen: number[] = [];
      try { seen = JSON.parse(localStorage.getItem(k) || '[]'); } catch { /* */ }
      if (!seen.includes(band)) { seen.push(band); localStorage.setItem(k, JSON.stringify(seen)); }
    }
    setBand(null); setQuota(null);
  };

  if (band == null || !quota) return null;
  const avail = quota.available ?? 0;
  const agotado = avail <= 0;

  return (
    <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={dismiss}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className={`px-6 py-6 text-center text-white ${agotado ? 'bg-red-600' : 'bg-amber-500'}`}>
          {agotado ? <FileWarning size={44} className="mx-auto" /> : <AlertTriangle size={44} className="mx-auto" />}
          <p className="font-black text-2xl mt-2">
            {agotado ? 'Comprobantes agotados' : `Quedan ${avail} comprobantes`}
          </p>
          <p className="text-white/90 text-sm mt-1">Facturación electrónica</p>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-center text-sm text-gray-600">
            {agotado
              ? 'Se acabaron los comprobantes electrónicos de tu paquete. Contactá para renovarlo y seguir facturando.'
              : `Te quedan pocos comprobantes (${avail} de ${quota.included}). Cuando se agoten hay que renovar el paquete.`}
          </p>
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 flex justify-between text-sm">
            <span className="text-gray-500 font-semibold">Usados</span>
            <span className="font-black text-gray-800">{quota.used} / {quota.included}</span>
          </div>
          <button onClick={dismiss}
            className={`w-full py-3 rounded-xl text-white font-bold text-sm ${agotado ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'}`}>
            <span className="inline-flex items-center justify-center gap-1.5"><X size={15} /> Entendido</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default FeQuotaWarning;
