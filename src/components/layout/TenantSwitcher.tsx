import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Building2, Check, ChevronDown, Crown, AlertTriangle, Clock } from 'lucide-react';
import type { Tenant } from '@/context/AuthContext';

const fmtDate = (s?: string) =>
  s ? new Date(s.includes('T') ? s : s + 'T00:00:00').toLocaleDateString('es-CR', { dateStyle: 'medium' }) : '—';

function daysUntil(s?: string | null): number | null {
  if (!s) return null;
  const d = s.includes('T') ? new Date(s) : new Date(s + 'T00:00:00');
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

interface StatusBadgeProps { tenant: Tenant }
const StatusBadge: React.FC<StatusBadgeProps> = ({ tenant }) => {
  const status = tenant.status ?? 'active';
  const days = daysUntil(tenant.subscription?.ends_at);

  if (status === 'suspended' || status === 'inactive' || status === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-700">
        <AlertTriangle size={9} /> Suspendida
      </span>
    );
  }
  if (days !== null && days < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-700">
        <Clock size={9} /> Vencida
      </span>
    );
  }
  if (days !== null && days <= 7) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-700">
        <Clock size={9} /> Vence en {days}d
      </span>
    );
  }
  if (tenant.is_demo) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-700">
        Demo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700">
      <span className="w-1 h-1 rounded-full bg-emerald-500" /> Activa
    </span>
  );
};

export const TenantSwitcher: React.FC = () => {
  const { tenant, tenants, switchTenant, user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al clic fuera
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Si solo hay 1 negocio, mostramos un chip pasivo con info — no dropdown.
  if (tenants.length <= 1) {
    if (!tenant) return null;
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm">
        <Building2 size={14} className="text-gray-500 shrink-0" />
        <span className="font-bold text-gray-800 truncate max-w-32">{tenant.name}</span>
        <StatusBadge tenant={tenant} />
      </div>
    );
  }

  const handlePick = async (t: Tenant) => {
    if (t.id === tenant?.id) { setOpen(false); return; }
    setOpen(false);
    try { await switchTenant(t.id); } catch { /* err shown via AuthContext.error */ }
  };

  return (
    <div ref={ref} className="relative">
      {/* Botón principal */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 text-sm transition"
      >
        <Building2 size={14} className="text-gray-500 shrink-0" />
        <span className="font-bold text-gray-800 truncate max-w-32">
          {tenant?.name ?? 'Seleccionar negocio'}
        </span>
        {tenant && <StatusBadge tenant={tenant} />}
        <ChevronDown size={13} className={`text-gray-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Mis negocios</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {tenants.length} {tenants.length === 1 ? 'negocio' : 'negocios'} · cambiá entre ellos
            </p>
          </div>

          {/* Lista */}
          <div className="max-h-96 overflow-y-auto py-1">
            {tenants.map(t => {
              const active   = t.id === tenant?.id;
              const isOwner  = t.owner_id === user?.id;
              const sub      = t.subscription;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handlePick(t)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition ${
                    active ? 'bg-emerald-50' : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Avatar / icono */}
                  <div className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center font-black text-sm text-white ${
                    active
                      ? 'bg-emerald-500'
                      : t.is_demo
                      ? 'bg-blue-500'
                      : 'bg-gray-500'
                  }`}>
                    {(t.name?.[0] ?? '?').toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`font-black text-sm truncate ${active ? 'text-emerald-700' : 'text-gray-900'}`}>
                        {t.name}
                      </span>
                      {isOwner && (
                        <Crown size={11} className="text-amber-500 shrink-0" />
                      )}
                      <StatusBadge tenant={t} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
                      {sub?.plan?.name && (
                        <span className="truncate">{sub.plan.name}</span>
                      )}
                      {sub?.ends_at && (
                        <>
                          {sub?.plan?.name && <span className="text-gray-300">·</span>}
                          <span>Vence: {fmtDate(sub.ends_at)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Check si está activo */}
                  {active && (
                    <div className="shrink-0 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400 text-center">
            <Crown size={9} className="inline text-amber-500 mr-1" />
            indica que sos el dueño
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantSwitcher;
