'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Users, LogIn, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { activityService } from '@/services/users/activityService';
import { usersService } from '@/services/users/usersService';
import type { ActivityLog } from '@/types/Types_Users';
import type { User } from '@/types/Types_Users';

interface Props { tenantId: string | null; from: string; to: string; }

// Nombre legible de cada acción registrada.
const ACTION_LABEL: Record<string, string> = {
  login:                'Inicio de sesión',
  logout:               'Cierre de sesión',
  user_created:         'Usuario creado',
  user_deleted:         'Usuario eliminado',
  user_password_reset:  'Contraseña restablecida',
  invoice_created:      'Factura creada',
  invoice_voided:       'Factura anulada',
  purchase_created:     'Compra creada',
  expense_created:      'Gasto registrado',
  product_created:      'Producto creado',
  product_updated:      'Producto actualizado',
  promotion_created:    'Promoción creada',
  promotion_updated:    'Promoción actualizada',
  cash_open:            'Apertura de caja',
  cash_close:           'Cierre de caja',
};
const actionLabel = (a: string) => ACTION_LABEL[a] ?? a.replace(/_/g, ' ');

const fmtDateTime = (s: string) => new Date(s).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
const fmtDetails = (d?: Record<string, any>) => {
  if (!d) return '';
  return Object.entries(d)
    .filter(([k]) => !/^(error|success|result|status|ok)$/i.test(k))
    .slice(0, 4)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
    .join(' · ');
};

// Resultado del evento: se deduce de los details (error/success/result/status).
// El registro de actividad se hace al COMPLETAR la acción, así que por defecto
// es "Exitoso" salvo que los detalles marquen lo contrario.
function resultOf(a: ActivityLog): { label: string; ok: boolean } {
  const d = a.details ?? {};
  const err = (d as any).error ?? (d as any).err;
  const success = (d as any).success;
  const status = String((d as any).status ?? (d as any).result ?? '').toLowerCase();
  if (err || success === false || /error|fail|rechaz|denied|fallo/.test(status)) {
    return { label: typeof err === 'string' ? `Error: ${err}` : 'Error', ok: false };
  }
  return { label: 'Exitoso', ok: true };
}

export const UserActivityReport: React.FC<Props> = ({ tenantId, from, to }) => {
  const [rows, setRows] = useState<ActivityLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = () => {
    if (!tenantId) return;
    setLoading(true); setErr('');
    const filters: any = { limit: 1000 };
    if (from) filters.from = from;
    if (to) filters.to = `${to}T23:59:59`;
    if (userId) filters.user_id = userId;
    activityService.getActivityLogs(tenantId, filters)
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(e => setErr(e instanceof Error ? e.message : 'Error al cargar la bitácora'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [tenantId, from, to, userId]);

  useEffect(() => {
    if (tenantId) usersService.getAllUsers(tenantId).then(setUsers).catch(() => {});
  }, [tenantId]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [rows],
  );
  const stats = useMemo(() => {
    const activeUsers = new Set(rows.filter(r => r.user_id).map(r => r.user_id)).size;
    const logins = rows.filter(r => r.action === 'login').length;
    const errors = rows.filter(r => !resultOf(r).ok).length;
    return { total: rows.length, activeUsers, logins, errors };
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <Activity size={24} className="text-blue-600" /> Bitácora de usuarios
        </h2>
        <div className="flex items-center gap-2">
          <select value={userId} onChange={e => setUserId(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-bold bg-white">
            <option value="">Todos los usuarios</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </div>
      <p className="text-sm text-gray-500 -mt-2">Qué hizo cada usuario y con qué resultado, en el rango seleccionado.</p>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4"><p className="text-xs font-bold text-gray-400 flex items-center gap-1"><Activity size={13} /> Acciones</p><p className="text-2xl font-black text-gray-900">{stats.total}</p></div>
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-4"><p className="text-xs font-bold text-blue-600 flex items-center gap-1"><Users size={13} /> Usuarios activos</p><p className="text-2xl font-black text-blue-700">{stats.activeUsers}</p></div>
        <div className="bg-violet-50 rounded-xl border border-violet-100 p-4"><p className="text-xs font-bold text-violet-600 flex items-center gap-1"><LogIn size={13} /> Inicios de sesión</p><p className="text-2xl font-black text-violet-700">{stats.logins}</p></div>
        <div className="bg-red-50 rounded-xl border border-red-100 p-4"><p className="text-xs font-bold text-red-600 flex items-center gap-1"><AlertTriangle size={13} /> Con error</p><p className="text-2xl font-black text-red-700">{stats.errors}</p></div>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">{err}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-14 text-gray-400 gap-2"><Loader2 size={18} className="animate-spin" /> Cargando bitácora…</div>
      ) : sorted.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl text-center py-14 text-gray-400">
          <Activity size={36} className="mx-auto text-gray-300 mb-2" />
          <p className="font-semibold">Sin actividad en el rango.</p>
          <p className="text-xs mt-1">Si es la primera vez, verificá que la tabla <code>user_activity_log</code> exista en Supabase.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100"><h3 className="font-black text-gray-800 text-sm">Eventos ({sorted.length})</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs font-black uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Fecha / hora</th>
                  <th className="text-left px-4 py-3">Usuario</th>
                  <th className="text-left px-4 py-3">Acción</th>
                  <th className="text-left px-4 py-3">Detalle</th>
                  <th className="text-left px-4 py-3">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(a => {
                  const res = resultOf(a);
                  return (
                    <tr key={a.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap font-mono">{fmtDateTime(a.created_at)}</td>
                      <td className="px-4 py-2.5 font-bold text-gray-800">{a.user_name ?? 'Sistema'}</td>
                      <td className="px-4 py-2.5 text-gray-700">
                        {actionLabel(a.action)}
                        {a.entity_type && <span className="ml-1.5 text-[10px] text-gray-400 font-mono uppercase">{a.entity_type}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs max-w-xs truncate">{fmtDetails(a.details)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full ${res.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {res.ok ? '✅ ' : '❌ '}{res.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserActivityReport;
