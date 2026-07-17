'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Mail, Phone, Briefcase, Calendar, X, Search, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { employeesService } from '@/services/hr/hrService';
import { formatCedula, cleanCedula } from '@/utils/cedula';
import type { Employee, EmployeeStatus } from '../types/HR.types';
import { DEPARTMENTS, STATUS_LABELS, STATUS_COLORS } from '../types/HR.types';

interface FormData {
  full_name: string; identification: string; email: string; phone: string;
  position: string; department: string;
  hourly_rate: string; monthly_salary: string; commission_pct: string;
  hire_date: string; status: EmployeeStatus;
  health_cert_expires_at: string; notes: string;
}

const EMPTY: FormData = {
  full_name: '', identification: '', email: '', phone: '',
  position: '', department: 'Salón',
  hourly_rate: '', monthly_salary: '', commission_pct: '',
  hire_date: new Date().toISOString().slice(0, 10),
  status: 'active', health_cert_expires_at: '', notes: '',
};

export const EmployeeProfile: React.FC = () => {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? '';
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [error, setError] = useState('');

  const reload = async () => setEmployees(await employeesService.list().catch(() => []));
  useEffect(() => { if (tenantId) reload(); }, [tenantId]);

  const filtered = employees.filter(e =>
    e.full_name.toLowerCase().includes(search.toLowerCase()) ||
    e.position.toLowerCase().includes(search.toLowerCase()) ||
    e.department.toLowerCase().includes(search.toLowerCase())
  );

  const startCreate = () => { setForm(EMPTY); setEditingId(null); setShowForm(true); setError(''); };
  const startEdit = (e: Employee) => {
    setForm({
      full_name: e.full_name, identification: e.identification ?? '',
      email: e.email ?? '', phone: e.phone ?? '',
      position: e.position, department: e.department,
      hourly_rate: e.hourly_rate?.toString() ?? '',
      monthly_salary: e.monthly_salary?.toString() ?? '',
      commission_pct: e.commission_pct?.toString() ?? '',
      hire_date: e.hire_date, status: e.status,
      health_cert_expires_at: e.health_cert_expires_at ?? '',
      notes: e.notes ?? '',
    });
    setEditingId(e.id); setShowForm(true); setError('');
  };

  const handleSubmit = async () => {
    if (!form.full_name.trim() || !form.position.trim()) {
      setError('Nombre y cargo son requeridos');
      return;
    }
    const payload = {
      full_name: form.full_name.trim(),
      identification: form.identification.trim() || undefined,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      position: form.position.trim(),
      department: form.department,
      hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : undefined,
      monthly_salary: form.monthly_salary ? parseFloat(form.monthly_salary) : undefined,
      commission_pct: form.commission_pct ? parseFloat(form.commission_pct) : undefined,
      hire_date: form.hire_date,
      status: form.status,
      health_cert_expires_at: form.health_cert_expires_at || undefined,
      notes: form.notes.trim() || undefined,
    };
    try {
      if (editingId) await employeesService.update(editingId, payload);
      else await employeesService.create(payload as any);
      setShowForm(false);
      await reload();
    } catch (err: any) {
      setError(err.message || 'Error al guardar');
    }
  };

  const handleDelete = async (e: Employee) => {
    if (!confirm(`¿Eliminar a ${e.full_name}?`)) return;
    await employeesService.remove(e.id);
    await reload();
  };

  const initials = (name: string) => name.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();

  const certWarning = (e: Employee): boolean => {
    if (!e.health_cert_expires_at) return false;
    return new Date(e.health_cert_expires_at).getTime() - Date.now() < 30 * 86_400_000;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-black text-gray-900">Empleados ({employees.length})</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
              className="pl-9 pr-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
          </div>
          <button onClick={startCreate} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition">
            <Plus size={16} /> Agregar
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white p-10 rounded-2xl border border-gray-100 text-center text-gray-400">
          <p className="font-semibold">No hay empleados</p>
          <p className="text-xs mt-1">Agrega tu primer empleado para empezar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(emp => {
            const color = STATUS_COLORS[emp.status];
            const warn = certWarning(emp);
            return (
              <div key={emp.id} className="bg-white p-5 rounded-2xl border-2 border-gray-100 hover:border-blue-200 transition group">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center font-black text-base shrink-0">
                    {initials(emp.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-gray-900 truncate">{emp.full_name}</h3>
                    <p className="text-xs text-gray-500 font-semibold truncate">{emp.position}</p>
                    <span className={`inline-block mt-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-${color}-100 text-${color}-700`}>
                      {STATUS_LABELS[emp.status]}
                    </span>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-gray-500 border-t border-gray-100 pt-3">
                  <div className="flex items-center gap-2"><Briefcase size={12} /> {emp.department}</div>
                  {emp.phone && <div className="flex items-center gap-2"><Phone size={12} /> {emp.phone}</div>}
                  {emp.email && <div className="flex items-center gap-2 truncate"><Mail size={12} /> {emp.email}</div>}
                  <div className="flex items-center gap-2"><Calendar size={12} /> Ingreso: {emp.hire_date}</div>
                  {warn && (
                    <div className="flex items-center gap-2 text-red-600 font-bold mt-1.5">
                      <AlertTriangle size={12} /> Carnet vence pronto
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={() => startEdit(emp)} className="flex-1 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 flex items-center justify-center gap-1">
                    <Edit2 size={12} /> Editar
                  </button>
                  <button onClick={() => handleDelete(emp)} className="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-bold rounded-lg hover:bg-red-100">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="bg-blue-600 px-5 py-4 flex items-center justify-between">
              <h3 className="text-white font-black text-lg">{editingId ? 'Editar empleado' : 'Nuevo empleado'}</h3>
              <button onClick={() => setShowForm(false)} className="w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Nombre completo *" value={form.full_name} onChange={v => setForm({...form, full_name: v})} />
                <Field label="Cédula" value={formatCedula(form.identification ?? '', '01')} onChange={v => setForm({...form, identification: cleanCedula(v, '01')})} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Email" type="email" value={form.email} onChange={v => setForm({...form, email: v})} />
                <Field label="Teléfono" type="tel" value={form.phone} onChange={v => setForm({...form, phone: v})} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Cargo / Posición *" value={form.position} onChange={v => setForm({...form, position: v})} />
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Departamento</label>
                  <select value={form.department} onChange={e => setForm({...form, department: e.target.value})}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400">
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Salario mensual ₡" type="number" value={form.monthly_salary} onChange={v => setForm({...form, monthly_salary: v})} />
                <Field label="Salario hora ₡" type="number" value={form.hourly_rate} onChange={v => setForm({...form, hourly_rate: v})} />
                <Field label="Comisión %" type="number" value={form.commission_pct} onChange={v => setForm({...form, commission_pct: v})} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Fecha de ingreso" type="date" value={form.hire_date} onChange={v => setForm({...form, hire_date: v})} />
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Estado</label>
                  <select value={form.status} onChange={e => setForm({...form, status: e.target.value as EmployeeStatus})}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400">
                    {(Object.keys(STATUS_LABELS) as EmployeeStatus[]).map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <Field label="Vencimiento carnet sanidad" type="date" value={form.health_cert_expires_at} onChange={v => setForm({...form, health_cert_expires_at: v})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Notas</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 resize-none" />
              </div>
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
            </div>
            <div className="bg-gray-50 border-t border-gray-200 px-4 py-3 grid grid-cols-2 gap-2">
              <button onClick={() => setShowForm(false)} className="h-11 rounded-xl border-2 border-gray-200 bg-white text-gray-600 font-bold text-sm hover:bg-gray-100">
                Cancelar
              </button>
              <button onClick={handleSubmit} className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm">
                {editingId ? 'Guardar cambios' : 'Crear empleado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; type?: string }> = ({ label, value, onChange, type = 'text' }) => (
  <div>
    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
  </div>
);
