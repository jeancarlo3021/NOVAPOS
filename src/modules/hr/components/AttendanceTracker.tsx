'use client';

import React, { useState, useEffect } from 'react';
import { Clock, LogIn, LogOut, User, Check, Calendar } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { employeesService, attendanceService } from '@/services/hr/hrService';
import type { Employee, AttendanceRecord } from '../types/HR.types';

export const AttendanceTracker: React.FC = () => {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? '';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [now, setNow] = useState(new Date());
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    employeesService.list().then(list => setEmployees(list.filter(e => e.status === 'active'))).catch(() => {});
    reload();
  }, [tenantId]);

  // Reloj en vivo
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  const reload = async () => {
    const today = new Date().toISOString().slice(0, 10);
    setRecords(await attendanceService.list({ from: today, to: today }).catch(() => []));
  };

  const todayRecord = records.find(r => r.employee_id === selectedId);
  const hasClockedIn = !!todayRecord?.clock_in;
  const hasClockedOut = !!todayRecord?.clock_out;

  const handleClockIn = async () => {
    if (!selectedId) return;
    await attendanceService.clockIn(selectedId);
    setFeedback('✓ Entrada registrada');
    setTimeout(() => setFeedback(null), 2500);
    reload();
  };

  const handleClockOut = async () => {
    if (!selectedId) return;
    await attendanceService.clockOut(selectedId);
    setFeedback('✓ Salida registrada');
    setTimeout(() => setFeedback(null), 2500);
    reload();
  };

  const timeStr = now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });

  const getEmpName = (id: string) => employees.find(e => e.id === id)?.full_name ?? '—';
  const fmtTime = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

      {/* Reloj marcador */}
      <div className="lg:col-span-1">
        <div className="bg-white p-7 rounded-3xl border-2 border-gray-100 shadow-sm sticky top-4">
          <div className="text-center mb-5">
            <div className="w-16 h-16 bg-violet-100 text-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Clock size={28} />
            </div>
            <h2 className="text-4xl font-black text-gray-900 font-mono">{timeStr}</h2>
            <p className="text-gray-400 text-xs font-bold tracking-wider mt-1 capitalize">{dateStr}</p>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Empleado
            </label>
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-violet-400"
            >
              <option value="">Seleccionar...</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.full_name} · {e.position}</option>
              ))}
            </select>
          </div>

          {selectedId && (
            <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500 font-semibold">Entrada:</span>
                <span className="font-black text-gray-900">{fmtTime(todayRecord?.clock_in)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 font-semibold">Salida:</span>
                <span className="font-black text-gray-900">{fmtTime(todayRecord?.clock_out)}</span>
              </div>
              {todayRecord?.hours_worked && (
                <div className="flex justify-between pt-1 border-t border-gray-200">
                  <span className="text-gray-500 font-semibold">Total hoy:</span>
                  <span className="font-black text-emerald-600">{todayRecord.hours_worked}h</span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <button
              onClick={handleClockIn}
              disabled={!selectedId || hasClockedIn}
              className="w-full py-4 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-black text-base shadow-sm flex items-center justify-center gap-2 transition"
            >
              <LogIn size={18} /> Marcar Entrada
            </button>
            <button
              onClick={handleClockOut}
              disabled={!selectedId || !hasClockedIn || hasClockedOut}
              className="w-full py-4 border-2 border-red-200 text-red-600 hover:bg-red-50 disabled:border-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent rounded-xl font-black text-base flex items-center justify-center gap-2 transition"
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

      {/* Tabla de asistencia hoy */}
      <div className="lg:col-span-2">
        <div className="bg-white rounded-2xl border-2 border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-black text-gray-900 flex items-center gap-2">
              <Calendar size={16} /> Asistencia de hoy
            </h3>
            <span className="text-xs text-gray-400 font-bold">{records.length} registros</span>
          </div>
          {records.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Clock size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="font-semibold text-sm">Sin marcajes hoy</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-2.5 text-xs font-black text-gray-500 uppercase">Empleado</th>
                  <th className="text-center px-3 py-2.5 text-xs font-black text-gray-500 uppercase">Entrada</th>
                  <th className="text-center px-3 py-2.5 text-xs font-black text-gray-500 uppercase">Salida</th>
                  <th className="text-right px-5 py-2.5 text-xs font-black text-gray-500 uppercase">Horas</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-5 py-3 font-semibold text-gray-800 flex items-center gap-2">
                      <User size={14} className="text-gray-400" />
                      {getEmpName(r.employee_id)}
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-gray-600">{fmtTime(r.clock_in)}</td>
                    <td className="px-3 py-3 text-center font-mono text-gray-600">{fmtTime(r.clock_out)}</td>
                    <td className="px-5 py-3 text-right font-black text-emerald-600">{r.hours_worked ? `${r.hours_worked}h` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
