import { useEffect, useState } from 'react';
import { Building2, Users, FileText, Warehouse, Plus, RefreshCw, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { tenantGroupsService, type BranchStats } from '@/services/admin/tenantGroupsService';

const fmt = (n: number) => new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n);

export const GroupBranchesPanel: React.FC = () => {
  const navigate = useNavigate();
  const { switchTenant, tenant: currentTenant } = useAuth();
  const [stats, setStats] = useState<BranchStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);  // 'all' | tenant_id
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const data = await tenantGroupsService.myBranchesStats();
      setStats(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreateWarehouse = async (tenantId?: string) => {
    setCreating(tenantId ?? 'all');
    setError('');
    try {
      const r = await tenantGroupsService.createCentralWarehouse(tenantId);
      await load();
      if (r.created === 0) setError('No se creó nada — ya existe una bodega central');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setCreating(null);
    }
  };

  // Si el user no tiene ninguna sucursal owned, ocultar (no es owner).
  if (!loading && stats.length === 0) return null;

  // Totales del grupo
  const totalUsers    = stats.reduce((acc, s) => acc + s.users_count, 0);
  const totalInvoices = stats.reduce((acc, s) => acc + s.invoices_month, 0);
  const totalSales    = stats.reduce((acc, s) => acc + s.invoices_total, 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Building2 size={20} className="text-emerald-600" />
          <h2 className="text-lg font-black text-gray-900">Mis Sucursales</h2>
          <span className="text-xs text-gray-400 font-bold">({stats.length})</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleCreateWarehouse()}
            disabled={creating === 'all'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold transition disabled:opacity-50"
          >
            {creating === 'all'
              ? <RefreshCw size={13} className="animate-spin" />
              : <Plus size={13} />}
            Bodega central en todas
          </button>
          <button onClick={load} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Totales del grupo */}
      {stats.length > 1 && (
        <div className="grid grid-cols-3 gap-3 bg-linear-to-br from-emerald-50 to-cyan-50 rounded-xl p-3 border border-emerald-100">
          <div>
            <p className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">Total usuarios</p>
            <p className="text-2xl font-black text-emerald-900 tabular-nums">{totalUsers}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">Facturas mes</p>
            <p className="text-2xl font-black text-emerald-900 tabular-nums">{totalInvoices}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">Ventas mes</p>
            <p className="text-2xl font-black text-emerald-900 tabular-nums">{fmt(totalSales)}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading && stats.length === 0 ? (
          [1,2,3].map(i => (
            <div key={i} className="h-32 rounded-xl bg-gray-50 animate-pulse" />
          ))
        ) : (
          stats.map(s => {
            const isCurrent = s.tenant_id === currentTenant?.id;
            return (
              <div key={s.tenant_id}
                className={`p-4 rounded-xl border-2 transition ${
                  isCurrent ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-100 hover:border-gray-300'
                }`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <h3 className="font-black text-gray-900 truncate">{s.tenant_name}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {isCurrent && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-200 text-emerald-800 rounded">ACTUAL</span>
                      )}
                      {s.is_demo && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">DEMO</span>
                      )}
                      {s.status !== 'active' && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-100 text-red-700 rounded">{s.status.toUpperCase()}</span>
                      )}
                    </div>
                  </div>
                  {!isCurrent && (
                    <button
                      onClick={async () => { await switchTenant(s.tenant_id); navigate('/'); }}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                      title="Cambiar a esta sucursal"
                    >
                      Entrar <ArrowRight size={12} />
                    </button>
                  )}
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-gray-500">
                      <Users size={12} /> Usuarios
                    </span>
                    <span className="font-bold text-gray-900">{s.users_count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-gray-500">
                      <FileText size={12} /> Facturas (mes)
                    </span>
                    <span className="font-bold text-gray-900">
                      {s.invoices_month}
                      {s.invoices_total > 0 && (
                        <span className="text-gray-400 ml-1">· {fmt(s.invoices_total)}</span>
                      )}
                    </span>
                  </div>
                  {/* Desglose por tipo de documento — control de cobro Hacienda */}
                  <div className="flex items-center justify-end gap-1.5 -mt-1">
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-700"
                      title="Tiquetes corrientes">{s.doc_ticket ?? 0}</span>
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700"
                      title="Tiquetes electrónicos">{s.doc_tiquete_electronico ?? 0}</span>
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-700"
                      title="Facturas electrónicas">{s.doc_factura_electronica ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-gray-500">
                      <Warehouse size={12} /> Bodegas
                    </span>
                    <span className="font-bold text-gray-900 flex items-center gap-1.5">
                      {s.warehouses_count}
                      {s.warehouses_count === 0 && (
                        <button
                          onClick={() => handleCreateWarehouse(s.tenant_id)}
                          disabled={creating === s.tenant_id}
                          className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
                          title="Crear bodega central"
                        >
                          {creating === s.tenant_id ? '...' : '+ Crear'}
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default GroupBranchesPanel;
