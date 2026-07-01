import React from 'react';
import {
  BadgeInfo, CalendarClock, CreditCard, ShieldCheck, Users, Package,
  ReceiptText, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const fmtColones = (n?: number) =>
  n == null ? '—' : `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

const CYCLE_LABEL: Record<string, string> = {
  monthly: 'mensual', month: 'mensual', mensual: 'mensual',
  yearly: 'anual', annual: 'anual', year: 'anual', anual: 'anual',
  weekly: 'semanal', quarterly: 'trimestral',
};

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

export const InfoDashboard: React.FC = () => {
  const { tenant, planName } = useAuth();
  const sub = tenant?.subscription ?? null;
  const plan = sub?.plan ?? null;

  const endsAt = sub?.ends_at;
  const daysLeft = endsAt
    ? Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000)
    : null;

  // Color / estado según días restantes.
  const state = daysLeft == null
    ? { tone: 'gray',   label: 'Sin fecha de vencimiento', Icon: BadgeInfo }
    : daysLeft < 0
      ? { tone: 'red',    label: `Vencido hace ${Math.abs(daysLeft)} día(s)`, Icon: AlertTriangle }
      : daysLeft <= 7
        ? { tone: 'amber',  label: 'Por vencer', Icon: AlertTriangle }
        : { tone: 'emerald', label: 'Plan activo', Icon: CheckCircle2 };

  const toneCls: Record<string, { bg: string; border: string; text: string; chip: string }> = {
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', chip: 'bg-emerald-600' },
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   chip: 'bg-amber-500' },
    red:     { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     chip: 'bg-red-600' },
    gray:    { bg: 'bg-gray-50',    border: 'border-gray-200',    text: 'text-gray-600',    chip: 'bg-gray-500' },
  };
  const t = toneCls[state.tone];
  const cycle = CYCLE_LABEL[String(plan?.billing_cycle ?? '').toLowerCase()] ?? plan?.billing_cycle ?? '';

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
          <BadgeInfo size={22} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Información del plan</h1>
          <p className="text-sm text-gray-500">Estado de tu suscripción, valor y términos del servicio.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Días restantes */}
        <div className={`rounded-2xl border ${t.border} ${t.bg} p-5`}>
          <div className="flex items-center gap-2">
            <CalendarClock size={16} className={t.text} />
            <span className={`text-xs font-black uppercase tracking-wider ${t.text}`}>Vencimiento</span>
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span className={`text-5xl font-black ${t.text}`}>
              {daysLeft == null ? '∞' : Math.max(daysLeft, 0)}
            </span>
            {daysLeft != null && <span className={`mb-1.5 text-sm font-bold ${t.text}`}>día(s) restantes</span>}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <state.Icon size={14} className={t.text} />
            <span className={`text-sm font-bold ${t.text}`}>{state.label}</span>
          </div>
          <p className="mt-2 text-xs text-gray-500">Vence el <b>{fmtDate(endsAt)}</b></p>
        </div>

        {/* Plan y valor */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <CreditCard size={16} className="text-blue-600" />
            <span className="text-xs font-black uppercase tracking-wider text-blue-600">Plan contratado</span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-gray-900 capitalize">{plan?.name ?? planName ?? 'Demo'}</p>
            {plan?.description && <p className="text-sm text-gray-500 mt-0.5">{plan.description}</p>}
          </div>
          <div className="mt-4 flex items-end gap-1">
            <span className="text-3xl font-black text-gray-900">{fmtColones(plan?.price)}</span>
            {cycle && <span className="mb-1 text-sm font-semibold text-gray-500">/ {cycle}</span>}
          </div>
        </div>
      </div>

      {/* Límites del plan */}
      {(plan?.max_users != null || plan?.max_products != null || plan?.max_orders != null) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <LimitCard Icon={Users} label="Usuarios" value={plan?.max_users} />
          <LimitCard Icon={Package} label="Productos" value={plan?.max_products} />
          <LimitCard Icon={ReceiptText} label="Ventas / mes" value={plan?.max_orders} />
        </div>
      )}

      {/* Términos y condiciones */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={16} className="text-gray-700" />
          <h2 className="text-sm font-black uppercase tracking-wider text-gray-700">Términos y condiciones</h2>
        </div>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-600 leading-relaxed">
          <li><b>Suscripción y vigencia.</b> El servicio se presta bajo una suscripción {cycle || 'periódica'} y permanece activo mientras la cuenta esté al día con el pago.</li>
          <li><b>Renovación.</b> El plan debe renovarse antes de la fecha de vencimiento para mantener el acceso sin interrupciones. Se le notificará cuando falten pocos días.</li>
          <li><b>Suspensión por falta de pago.</b> Vencida la fecha, la cuenta entra en un período de gracia; superados los 15 días de mora el sistema queda en <b>solo lectura</b> hasta regularizar el pago.</li>
          <li><b>Valor del plan.</b> El precio indicado corresponde al plan contratado y puede ajustarse notificándolo con anticipación. Los pagos realizados no son reembolsables.</li>
          <li><b>Uso del servicio.</b> La cuenta es de uso exclusivo del negocio contratante. No debe compartir credenciales ni utilizar el sistema para fines ilícitos.</li>
          <li><b>Datos e información.</b> La información registrada es propiedad del negocio. Se realizan respaldos periódicos; usted es responsable de la exactitud de los datos que ingresa.</li>
          <li><b>Disponibilidad.</b> Se procura la máxima disponibilidad del servicio, pudiendo existir ventanas de mantenimiento programado que se comunicarán oportunamente.</li>
          <li><b>Facturación electrónica.</b> La emisión de comprobantes ante Hacienda depende de la correcta configuración fiscal del negocio y de la disponibilidad de los servicios del Ministerio de Hacienda.</li>
        </ol>
        <p className="mt-4 text-xs text-gray-400">
          Al usar el sistema usted acepta estos términos. Para dudas sobre su plan o facturación, contacte a su proveedor del servicio.
        </p>
      </div>
    </div>
  );
};

function LimitCard({ Icon, label, value }: { Icon: React.ElementType; label: string; value?: number | null }) {
  const unlimited = value == null || value === 0 || value < 0;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
        <Icon size={17} className="text-gray-600" />
      </div>
      <div>
        <p className="text-lg font-black text-gray-900">{unlimited ? 'Ilimitado' : value!.toLocaleString('es-CR')}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export default InfoDashboard;
