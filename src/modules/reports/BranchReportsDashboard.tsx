import { useEffect, useState } from 'react';
import { Building2, Check, Loader2, LayoutGrid } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { tenantGroupsService, type MyTenant } from '@/services/admin/tenantGroupsService';
import ReportsDashboard from './ReportsDashboard';
import { ConsolidatedBranchReport } from './ConsolidatedBranchReport';

/**
 * Reportes Sucursales — igual que Reportes, pero con un selector de sucursal
 * arriba. Al elegir una sucursal del grupo, cambia el contexto (switchTenant)
 * y los reportes se muestran para esa sucursal. Reutiliza todo el
 * ReportsDashboard sin duplicar lógica.
 */
export function BranchReportsDashboard() {
  const { tenant, switchTenant } = useAuth();
  const [branches, setBranches] = useState<MyTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  // 'general' = vista consolidada de todas; tenantId = reportes de esa sucursal.
  const [mode, setMode] = useState<'general' | 'one'>('general');

  useEffect(() => {
    tenantGroupsService.myTenants()
      .then(list => setBranches(Array.isArray(list) ? list : []))
      .catch(() => setBranches([]))
      .finally(() => setLoading(false));
  }, []);

  const handlePick = async (tenantId: string) => {
    setMode('one');
    if (tenantId === tenant?.id) return;
    setSwitching(tenantId);
    try { await switchTenant(tenantId); }
    catch { /* error se muestra via AuthContext */ }
    finally { setSwitching(null); }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Selector de sucursal */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <Building2 size={18} className="text-emerald-600" />
          <h2 className="font-black text-gray-900">Reportes por Sucursal</h2>
          <span className="text-xs text-gray-400">
            {tenant ? `Viendo: ${tenant.name}` : ''}
          </span>
        </div>

        {loading ? (
          <div className="text-sm text-gray-400 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Cargando sucursales…
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {/* Chip General (consolidado de todas) */}
            {branches.length > 1 && (
              <button onClick={() => setMode('general')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-black whitespace-nowrap transition border-2 ${
                  mode === 'general'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
                }`}>
                <LayoutGrid size={13} /> General (todas)
              </button>
            )}
            {branches.map(b => {
              const active = mode === 'one' && b.tenant_id === tenant?.id;
              return (
                <button key={b.tenant_id}
                  onClick={() => handlePick(b.tenant_id)}
                  disabled={!!switching}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition border-2 ${
                    active
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-emerald-300'
                  } disabled:opacity-50`}>
                  {switching === b.tenant_id
                    ? <Loader2 size={13} className="animate-spin" />
                    : active ? <Check size={13} /> : <Building2 size={13} />}
                  {b.tenant_name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Cuerpo: consolidado o reportes de una sucursal */}
      <div className="flex-1 overflow-auto">
        {mode === 'general' && branches.length > 1 ? (
          <ConsolidatedBranchReport />
        ) : (
          <ReportsDashboard key={tenant?.id ?? 'none'} />
        )}
      </div>
    </div>
  );
}

export default BranchReportsDashboard;
