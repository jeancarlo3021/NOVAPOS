'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, CheckCircle, XCircle, Plus, X, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { employeesService, leaveService } from '@/services/hr/hrService';
import type { Employee, LeaveRequest, LeaveType, LeaveStatus } from '../types/HR.types';
import { LEAVE_TYPE_LABELS, LEAVE_STATUS_LABELS } from '../types/HR.types';

const TYPE_COLORS: Record<LeaveType, string> = {
  vacation: 'blue', sick: 'amber', personal: 'violet', maternity: 'pink', other: 'gray',
};

const STATUS_COLORS: Record<LeaveStatus, string> = {
  pending: 'amber', approved: 'emerald', rejected: 'red',
};

const dayDiff = (from: string, to: string): number => {
  if (!from || !to) return 0;
  const d = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
  return Math.max(1, Math.round(d) + 1);
};

export const LeaveRequestModal: React.FC = () => {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? '';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [filter, setFilter] = useState<LeaveStatus | 'all'>('all');
  const [showForm, setShowForm] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    employee_id: '', type: 'vacation' as LeaveType,
    start_date: today, end_date: today, reason: '',
  });
  const [error, setError] = useState('');

  const reload = async () => setRequests(await leaveService.list().catch(() => []));
  useEffect(() => {
    if (!tenantId) return;
    employeesService.list().then(setEmployees).catch(() => {});
    reload();
  }, [tenantId]);

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  const handleCreate = async () => {
    if (!form.employee_id) { setError('Selecciona un empleado'); return; }
    if (!form.start_date || !form.end_date) { setError('Selecciona fechas'); return; }
    if (form.start_date > form.end_date) { setError('La fecha de inicio debe ser anterior a la final'); return; }
    if (!form.reason.trim()) { setError('Indica el motivo'); return; }

    const emp = employees.find(e => e.id === form.employee_id);
    try {
      await leaveService.create({
        employee_id: form.employee_id,
        employee_name: emp?.full_name,
        type: form.type,
        start_date: form.start_date,
        end_date: form.end_date,
        days: dayDiff(form.start_date, form.end_date),
        reason: form.reason.trim(),
      });
      setShowForm(false);
      setForm({ employee_id: '', type: 'vacation', start_date: today, end_date: today, reason: '' });
      setError('');
      await reload();
    } catch (err: any) {
      setError(err.message || 'Error al crear');
    }
  };

  const handleAction = async (id: string, status: LeaveStatus) => {
    await leaveService.updateStatus(id, status, user?.email);
    reload();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta solicitud?')) return;
    await leaveService.remove(id);
    reload();
  };

  const counts = {
    all: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-black text-gray-900">Control de Ausencias</h2>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition">
          <Plus size={16} /> Nueva solicitud
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {([
          { id: 'all',       label: 'Todas',      color: 'gray'    },
          { id: 'pending',   label: 'Pendientes', color: 'amber'   },
          { id: 'approved',  label: 'Aprobadas',  color: 'emerald' },
          { id: 'rejected',  label: 'Rechazadas', color: 'red'     },
        ] as const).map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              filter === f.id
                ? `bg-${f.color}-500 text-white`
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
            }`}
          >
            {f.label} <span className="opacity-70">({counts[f.id as keyof typeof counts]})</span>
          </button>
        ))}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="bg-white p-10 rounded-2xl border border-gray-100 text-center text-gray-400">
          <Calendar size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="font-semibold text-sm">Sin solicitudes</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map(r => {
            const tColor = TYPE_COLORS[r.type];
            const sColor = STATUS_COLORS[r.status];
            return (
              <div key={r.id} className="bg-white p-4 rounded-2xl border-2 border-gray-100 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-${tColor}-100 text-${tColor}-600`}>
                  <Calendar size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h4 className="font-black text-gray-900">{r.employee_name ?? 'Empleado'}</h4>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full bg-${tColor}-50 text-${tColor}-700`}>
                      {LEAVE_TYPE_LABELS[r.type]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {r.start_date} → {r.end_date} <span className="font-bold text-gray-700">({r.days} día{r.days > 1 ? 's' : ''})</span>
                  </p>
                  {r.reason && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{r.reason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {r.status === 'pending' ? (
                    <>
                      <button onClick={() => handleAction(r.id, 'approved')}
                        title="Aprobar"
                        className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg">
                        <CheckCircle size={18} />
                      </button>
                      <button onClick={() => handleAction(r.id, 'rejected')}
                        title="Rechazar"
                        className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg">
                        <XCircle size={18} />
                      </button>
                    </>
                  ) : (
                    <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase bg-${sColor}-100 text-${sColor}-700`}>
                      {LEAVE_STATUS_LABELS[r.status]}
                    </span>
                  )}
                  <button onClick={() => handleDelete(r.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal nueva solicitud */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden">
            <div className="bg-blue-600 px-5 py-4 flex items-center justify-between">
              <h3 className="text-white font-black text-lg">Nueva solicitud</h3>
              <button onClick={() => setShowForm(false)} className="w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Empleado</label>
                <select value={form.employee_id} onChange={e => setForm({...form, employee_id: e.target.value})}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400">
                  <option value="">Seleccionar...</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Tipo</label>
                <select value={form.type} onChange={e => setForm({...form, type: e.target.value as LeaveType})}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400">
                  {(Object.keys(LEAVE_TYPE_LABELS) as LeaveType[]).map(t => (
                    <option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Desde</label>
                  <input type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Hasta</label>
                  <input type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
                </div>
              </div>
              <div className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-2 rounded-lg text-center">
                Total: {dayDiff(form.start_date, form.end_date)} día(s)
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Motivo</label>
                <textarea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})}
                  rows={3} placeholder="Detalle de la solicitud..."
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 resize-none" />
              </div>
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
            </div>
            <div className="bg-gray-50 border-t border-gray-200 px-4 py-3 grid grid-cols-2 gap-2">
              <button onClick={() => setShowForm(false)} className="h-11 rounded-xl border-2 border-gray-200 bg-white text-gray-600 font-bold text-sm hover:bg-gray-100">
                Cancelar
              </button>
              <button onClick={handleCreate} className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm">
                Crear solicitud
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
