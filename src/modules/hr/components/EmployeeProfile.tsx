'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Mail, Phone, Briefcase, Calendar, X, Search, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { employeesService } from '@/services/hr/hrService';
import { formatCedula, cleanCedula } from '@/utils/cedula';
import { apiFetch } from '@/lib/api';
import type { Employee, EmployeeStatus, SalaryType, CommissionBase } from '../types/HR.types';
import {
  DEPARTMENTS, STATUS_LABELS, STATUS_COLORS, SALARY_TYPE_LABELS, CONTRACT_TYPES,
} from '../types/HR.types';

interface FormData {
  full_name: string; identification: string; email: string; phone: string;
  position: string; department: string;
  hourly_rate: string; monthly_salary: string; commission_pct: string;
  hire_date: string; status: EmployeeStatus;
  health_cert_expires_at: string; notes: string;
  // ── Campos de la migración 115 ──
  user_id: string;
  salary_type: SalaryType;
  commission_base: CommissionBase;
  payment_method: string; bank_account: string;
  birth_date: string;
  emergency_contact: string; emergency_phone: string;
  contract_type: string; contract_end_date: string;
  vacation_days_per_year: string;
}

const EMPTY: FormData = {
  full_name: '', identification: '', email: '', phone: '',
  position: '', department: 'Salón',
  hourly_rate: '', monthly_salary: '', commission_pct: '',
  hire_date: new Date().toISOString().slice(0, 10),
  status: 'active', health_cert_expires_at: '', notes: '',
  user_id: '', salary_type: 'monthly', commission_base: 'sales',
  payment_method: 'transfer', bank_account: '', birth_date: '',
  emergency_contact: '', emergency_phone: '',
  contract_type: 'Indefinido', contract_end_date: '',
  vacation_days_per_year: '12',
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
  /**
   * Usuarios del sistema, para VINCULAR al empleado.
   *
   * Es el enganche con el resto: vinculado, el empleado puede marcar entrada y
   * salida desde su propia cuenta, ver su información, y —lo más importante— la
   * planilla puede saber cuánto vendió para calcularle la comisión. Sin vínculo,
   * el expediente es solo una ficha de papel.
   */
  const [usuarios, setUsuarios] = useState<Array<{ id: string; email: string; full_name?: string }>>([]);
  useEffect(() => {
    void apiFetch<any[]>('/users')
      .then(us => setUsuarios((us ?? []).map(u => ({
        id: String(u.id), email: String(u.email ?? ''), full_name: u.full_name ?? undefined,
      }))))
      .catch(() => { /* sin permiso de usuarios: el selector no aparece */ });
  }, []);

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
      user_id: e.user_id ?? '',
      salary_type: (e.salary_type ?? 'monthly') as SalaryType,
      commission_base: (e.commission_base ?? 'sales') as CommissionBase,
      payment_method: e.payment_method ?? 'transfer',
      bank_account: e.bank_account ?? '',
      birth_date: e.birth_date ?? '',
      emergency_contact: e.emergency_contact ?? '',
      emergency_phone: e.emergency_phone ?? '',
      contract_type: e.contract_type ?? 'Indefinido',
      contract_end_date: e.contract_end_date ?? '',
      vacation_days_per_year: e.vacation_days_per_year?.toString() ?? '12',
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
      health_cert_expires_at: form.health_cert_expires_at || null,
      notes: form.notes.trim() || undefined,
      user_id: form.user_id || null,
      salary_type: form.salary_type,
      commission_base: form.commission_base,
      payment_method: form.payment_method || null,
      bank_account: form.bank_account.trim() || null,
      birth_date: form.birth_date || null,
      emergency_contact: form.emergency_contact.trim() || null,
      emergency_phone: form.emergency_phone.trim() || null,
      contract_type: form.contract_type || null,
      contract_end_date: form.contract_end_date || null,
      vacation_days_per_year: form.vacation_days_per_year
        ? parseFloat(form.vacation_days_per_year) : null,
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
              {/* ── Usuario del sistema ───────────────────────────────────── */}
              {usuarios.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Usuario del sistema
                  </label>
                  <select value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400">
                    <option value="">— Sin vincular —</option>
                    {usuarios.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name ? `${u.full_name} · ` : ''}{u.email}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Vinculado, el empleado marca entrada y salida desde su cuenta y la planilla puede
                    calcularle la comisión con <b>las ventas que él facturó</b>. Sin vínculo, la
                    comisión por ventas queda en cero.
                  </p>
                </div>
              )}

              {/* ── Cómo se le paga ───────────────────────────────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Tipo de salario</label>
                  <select value={form.salary_type}
                    onChange={e => setForm({ ...form, salary_type: e.target.value as SalaryType })}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400">
                    {(Object.keys(SALARY_TYPE_LABELS) as SalaryType[]).map(t => (
                      <option key={t} value={t}>{SALARY_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">La comisión se calcula sobre</label>
                  <select value={form.commission_base}
                    onChange={e => setForm({ ...form, commission_base: e.target.value as CommissionBase })}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400">
                    <option value="sales">Las ventas que hizo</option>
                    <option value="salary">Su propio salario</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Salario mensual ₡" type="number" value={form.monthly_salary} onChange={v => setForm({...form, monthly_salary: v})} />
                <Field label="Salario hora ₡" type="number" value={form.hourly_rate} onChange={v => setForm({...form, hourly_rate: v})} />
                <Field label="Comisión %" type="number" value={form.commission_pct} onChange={v => setForm({...form, commission_pct: v})} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Forma de pago</label>
                  <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400">
                    <option value="transfer">Transferencia</option>
                    <option value="sinpe">SINPE Móvil</option>
                    <option value="cash">Efectivo</option>
                    <option value="check">Cheque</option>
                  </select>
                </div>
                <Field label="Cuenta / IBAN / SINPE" value={form.bank_account}
                  onChange={v => setForm({ ...form, bank_account: v })} />
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
              {/* ── Contrato y vacaciones ─────────────────────────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Tipo de contrato</label>
                  <select value={form.contract_type} onChange={e => setForm({ ...form, contract_type: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400">
                    {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <Field label="Vence el contrato" type="date" value={form.contract_end_date}
                  onChange={v => setForm({ ...form, contract_end_date: v })} />
                <Field label="Días de vacaciones al año" type="number" value={form.vacation_days_per_year}
                  onChange={v => setForm({ ...form, vacation_days_per_year: v })} />
              </div>

              {/* ── Datos personales y emergencia ─────────────────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Fecha de nacimiento" type="date" value={form.birth_date}
                  onChange={v => setForm({ ...form, birth_date: v })} />
                <Field label="Contacto de emergencia" value={form.emergency_contact}
                  onChange={v => setForm({ ...form, emergency_contact: v })} />
                <Field label="Teléfono de emergencia" type="tel" value={form.emergency_phone}
                  onChange={v => setForm({ ...form, emergency_phone: v })} />
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
