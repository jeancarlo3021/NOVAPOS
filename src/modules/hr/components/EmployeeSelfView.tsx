'use client';

import React, { useState, useEffect } from 'react';
import {
  Clock, LogIn, LogOut, Calendar, DollarSign, AlertTriangle, Plus, Check, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { employeesService, attendanceService, leaveService } from '@/services/hr/hrService';
import type { Employee, AttendanceRecord, LeaveRequest, LeaveType } from '../types/HR.types';
import { LEAVE_TYPE_LABELS, LEAVE_STATUS_LABELS } from '../types/HR.types';

const fmt = (n: number) => `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;
const fmtTime = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }) : '—';
const dayDiff = (from: string, to: string): number => {
  if (!from || !to) return 0;
  const d = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
  return Math.max(1, Math.round(d) + 1);
};

/**
 * Vista del empleado: solo ve su propio marcaje, historial, salario y solicitudes
 */
export const EmployeeSelfView: React.FC = () => {
  const { user } = useAuth();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [todayRec, setTodayRec] = useState<AttendanceRecord | null>(null);
  const [recentAttendance, setRecentAttendance] = useState<AttendanceRecord[]>([]);
  const [myLeaves, setMyLeaves] = useState<LeaveRequest[]>([]);
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showLeaveForm, setShowLeaveForm] = useState(false);

  // Reloj en vivo
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const me = await employeesService.getMe();
      if (!me) {
        setEmployee(null);
        return;
      }
      setEmployee(me);

      const today = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

      const [todayList, recent, leaves] = await Promise.all([
        attendanceService.list({ employeeId: me.id, from: today, to: today }),
        attendanceService.list({ employeeId: me.id, from, to: today }),
        leaveService.list({ employeeId: me.id }),
      ]);

      setTodayRec(todayList[0] ?? null);
      setRecentAttendance(recent);
      setMyLeaves(leaves);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleClockIn = async () => {
    if (!employee) return;
    await attendanceService.clockIn(employee.id);
    setFeedback('✓ Entrada registrada');
    setTimeout(() => setFeedback(null), 2500);
    loadAll();
  };

  const handleClockOut = async () => {
    if (!employee) return;
    await attendanceService.clockOut(employee.id);
    setFeedback('✓ Salida registrada');
    setTimeout(() => setFeedback(null), 2500);
    loadAll();
  };

  const timeStr = now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-8 text-center">
        <AlertTriangle size={32} className="mx-auto text-amber-500 mb-3" />
        <h3 className="text-lg font-black text-amber-900">No tienes ficha de empleado</h3>
        <p className="text-amber-700 text-sm mt-1">
          Pide a tu gerente que cree tu expediente para poder marcar asistencia.
        </p>
      </div>
    );
  }

  const totalHoursMonth = recentAttendance.reduce((s, r) => s + (r.hours_worked ?? 0), 0);
  const hasClockedIn = !!todayRec?.clock_in;
  const hasClockedOut = !!todayRec?.clock_out;
  const pendingLeaves = myLeaves.filter(l => l.status === 'pending').length;
  const approvedLeaves = myLeaves.filter(l => l.status === 'approved').length;

  return (
    <div className="space-y-5">

      {/* Header personal */}
      <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-3xl p-6 text-white">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center font-black text-xl">
            {employee.full_name.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()}
          </div>
          <div>
            <h2 className="text-2xl font-black">{employee.full_name}</h2>
            <p className="text-blue-100 text-sm">{employee.position} · {employee.department}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Reloj marcador */}
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-3xl border-2 border-gray-100">
            <div className="text-center mb-5">
              <div className="w-14 h-14 bg-violet-100 text-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Clock size={24} />
              </div>
              <h2 className="text-4xl font-black text-gray-900 font-mono">{timeStr}</h2>
              <p className="text-gray-400 text-xs font-bold tracking-wider mt-1 capitalize">{dateStr}</p>
            </div>

            {todayRec && (
              <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500 font-semibold">Entrada:</span>
                  <span className="font-black text-gray-900">{fmtTime(todayRec.clock_in)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-semibold">Salida:</span>
                  <span className="font-black text-gray-900">{fmtTime(todayRec.clock_out)}</span>
                </div>
                {todayRec.hours_worked && (
                  <div className="flex justify-between pt-1 border-t border-gray-200">
                    <span className="text-gray-500 font-semibold">Total hoy:</span>
                    <span className="font-black text-emerald-600">{todayRec.hours_worked}h</span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <button
                onClick={handleClockIn}
                disabled={hasClockedIn}
                className="w-full py-4 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-black text-base flex items-center justify-center gap-2"
              >
                <LogIn size={18} /> Marcar Entrada
              </button>
              <button
                onClick={handleClockOut}
                disabled={!hasClockedIn || hasClockedOut}
                className="w-full py-4 border-2 border-red-200 text-red-600 hover:bg-red-50 disabled:border-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent rounded-xl font-black text-base flex items-center justify-center gap-2"
              >
                <LogOut size={18} /> Marcar Salida
              </button>
            </div>

            {feedback && (
              <div className="mt-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-bold px-3 py-2 rounded-lg text-center flex items-center justify-center gap-1.5">
                <Check size={14} /> {feedback}
              </div>
            )}
          </div>
        </div>

        {/* KPIs + acciones */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <MiniStat icon={Clock} label="Horas este mes" value={`${totalHoursMonth.toFixed(1)}h`} color="bg-violet-500" />
            <MiniStat icon={DollarSign} label="Salario base" value={fmt(employee.monthly_salary ?? 0)} color="bg-emerald-500" />
            <MiniStat icon={Calendar} label="Ausencias pendientes" value={String(pendingLeaves)} color="bg-amber-500" />
            <MiniStat icon={Check} label="Ausencias aprobadas" value={String(approvedLeaves)} color="bg-blue-500" />
          </div>

          {/* Mis solicitudes */}
          <div className="bg-white rounded-2xl border-2 border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-black text-gray-900 text-sm">Mis solicitudes</h3>
              <button onClick={() => setShowLeaveForm(true)} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold">
                <Plus size={12} /> Solicitar
              </button>
            </div>
            {myLeaves.length === 0 ? (
              <p className="text-center py-6 text-gray-400 text-sm">Sin solicitudes</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {myLeaves.slice(0, 5).map(l => (
                  <div key={l.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-bold text-gray-800">{LEAVE_TYPE_LABELS[l.type]}</p>
                      <p className="text-xs text-gray-500">{l.start_date} → {l.end_date} ({l.days}d)</p>
                    </div>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      l.status === 'pending'  ? 'bg-amber-100 text-amber-700'  :
                      l.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                                'bg-red-100 text-red-700'
                    }`}>
                      {LEAVE_STATUS_LABELS[l.status]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Asistencia reciente */}
          <div className="bg-white rounded-2xl border-2 border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="font-black text-gray-900 text-sm">Historial reciente (30 días)</h3>
            </div>
            {recentAttendance.length === 0 ? (
              <p className="text-center py-6 text-gray-400 text-sm">Sin registros</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-black text-gray-500 uppercase">Fecha</th>
                    <th className="text-center px-3 py-2 text-xs font-black text-gray-500 uppercase">Entrada</th>
                    <th className="text-center px-3 py-2 text-xs font-black text-gray-500 uppercase">Salida</th>
                    <th className="text-right px-4 py-2 text-xs font-black text-gray-500 uppercase">Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAttendance.slice(0, 10).map(r => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 font-mono text-gray-700">{r.date}</td>
                      <td className="px-3 py-2 text-center font-mono text-gray-600">{fmtTime(r.clock_in)}</td>
                      <td className="px-3 py-2 text-center font-mono text-gray-600">{fmtTime(r.clock_out)}</td>
                      <td className="px-4 py-2 text-right font-black text-emerald-600">{r.hours_worked ? `${r.hours_worked}h` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Modal nueva solicitud */}
      {showLeaveForm && employee && (
        <LeaveFormModal
          employeeId={employee.id}
          employeeName={employee.full_name}
          onClose={() => setShowLeaveForm(false)}
          onSuccess={() => { setShowLeaveForm(false); loadAll(); }}
        />
      )}
    </div>
  );
};

const MiniStat: React.FC<{ icon: any; label: string; value: string; color: string }> = ({ icon: Icon, label, value, color }) => (
  <div className="bg-white p-4 rounded-2xl border border-gray-100">
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${color}`}>
      <Icon size={16} className="text-white" />
    </div>
    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{label}</p>
    <p className="text-lg font-black text-gray-900 truncate">{value}</p>
  </div>
);

// ── Form de solicitud (sub-componente) ──────────────────────────────────────
const LeaveFormModal: React.FC<{
  employeeId: string;
  employeeName: string;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ employeeId, employeeName, onClose, onSuccess }) => {
  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState<LeaveType>('vacation');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) { setError('Indica el motivo'); return; }
    if (start > end) { setError('La fecha de inicio debe ser anterior'); return; }
    setLoading(true);
    try {
      await leaveService.create({
        employee_id: employeeId,
        employee_name: employeeName,
        type,
        start_date: start,
        end_date: end,
        days: dayDiff(start, end),
        reason: reason.trim(),
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-blue-600 px-5 py-4 flex items-center justify-between">
          <h3 className="text-white font-black text-lg">Solicitar ausencia</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo</label>
            <select value={type} onChange={e => setType(e.target.value as LeaveType)}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400">
              {(Object.keys(LEAVE_TYPE_LABELS) as LeaveType[]).map(t => (
                <option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Desde</label>
              <input type="date" value={start} onChange={e => setStart(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Hasta</label>
              <input type="date" value={end} onChange={e => setEnd(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          <div className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-2 rounded-lg text-center">
            Total: {dayDiff(start, end)} día(s)
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Motivo</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Describe el motivo..."
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 resize-none" />
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
        </div>
        <div className="bg-gray-50 border-t border-gray-200 px-4 py-3 grid grid-cols-2 gap-2">
          <button onClick={onClose} className="h-11 rounded-xl border-2 border-gray-200 bg-white text-gray-600 font-bold text-sm hover:bg-gray-100">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={loading} className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-black text-sm">
            {loading ? 'Enviando...' : 'Enviar solicitud'}
          </button>
        </div>
      </div>
    </div>
  );
};
