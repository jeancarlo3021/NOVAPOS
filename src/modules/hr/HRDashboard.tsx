'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users, Clock, Calendar, DollarSign, ArrowLeft,
  AlertTriangle, ChevronRight, Briefcase, UserCircle, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { EmployeeProfile } from './components/EmployeeProfile';
import { SalaryManager } from './components/SalaryManager';
import { LeaveRequestModal } from './components/LeaveRequestModal';
import { AttendanceTracker } from './components/AttendanceTracker';
import { EmployeeSelfView } from './components/EmployeeSelfView';
import { hrStats } from '@/services/hr/hrService';
import type { Employee, EmployeeStatus } from './types/HR.types';

type ModuleId = 'employees' | 'attendance' | 'leave' | 'payroll';
type ViewMode = 'manager' | 'employee';

interface ModuleDef {
  id: ModuleId;
  icon: React.ElementType;
  title: string;
  desc: string;
  color: string;
}

const MODULES: ModuleDef[] = [
  { id: 'employees',  icon: Users,      title: 'Empleados',  desc: 'Expedientes y datos personales',     color: 'bg-blue-100 text-blue-600'    },
  { id: 'attendance', icon: Clock,      title: 'Asistencia', desc: 'Reloj marcador y horas trabajadas', color: 'bg-violet-100 text-violet-600' },
  { id: 'leave',      icon: Calendar,   title: 'Ausencias',  desc: 'Vacaciones, incapacidades y permisos', color: 'bg-emerald-100 text-emerald-600' },
  { id: 'payroll',    icon: DollarSign, title: 'Nómina',     desc: 'Salarios, comisiones y deducciones', color: 'bg-amber-100 text-amber-600'  },
];

const fmt = (n: number) => `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

// Roles que se consideran gerentes (acceso completo)
const MANAGER_ROLES = ['owner', 'admin', 'manager', 'supervisor'];

interface DashboardStats {
  counts: Record<EmployeeStatus, number>;
  total: number;
  expiringCerts: Employee[];
  presentToday: number;
  pendingLeave: number;
  payroll: { base: number; commission: number; total: number };
}

export const HRDashboard: React.FC = () => {
  const { user } = useAuth();
  const isManager = MANAGER_ROLES.includes(user?.role ?? '');

  // Por defecto el gerente ve la vista manager, los demás solo employee
  const [viewMode, setViewMode] = useState<ViewMode>(isManager ? 'manager' : 'employee');
  const [selectedModule, setSelectedModule] = useState<ModuleId | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    if (!user?.tenant_id || viewMode !== 'manager' || selectedModule) return;
    setLoading(true);
    try {
      const data = await hrStats.dashboard();
      setStats(data);
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [user?.tenant_id, viewMode, selectedModule]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const renderModule = () => {
    switch (selectedModule) {
      case 'employees':  return <EmployeeProfile />;
      case 'attendance': return <AttendanceTracker />;
      case 'leave':      return <LeaveRequestModal />;
      case 'payroll':    return <SalaryManager />;
      default: return null;
    }
  };

  const currentTitle = MODULES.find(m => m.id === selectedModule)?.title ?? 'Recursos Humanos';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-5 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {selectedModule ? (
              <button onClick={() => setSelectedModule(null)}
                className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center text-gray-600 transition">
                <ArrowLeft size={20} />
              </button>
            ) : (
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
                <Briefcase size={20} className="text-white" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-black text-gray-900">{currentTitle}</h1>
              <p className="text-gray-400 text-xs">
                {viewMode === 'employee' ? 'Vista personal' : 'Gestión del personal'}
              </p>
            </div>
          </div>

          {/* Toggle vista — solo si es gerente */}
          {isManager && !selectedModule && (
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('employee')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition ${
                  viewMode === 'employee' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <UserCircle size={14} /> Vista Empleado
              </button>
              <button
                onClick={() => setViewMode('manager')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition ${
                  viewMode === 'manager' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <ShieldCheck size={14} /> Vista Gerente
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* ── Vista de EMPLEADO ── */}
        {viewMode === 'employee' && !selectedModule && (
          <EmployeeSelfView />
        )}

        {/* ── Vista de GERENTE ── */}
        {viewMode === 'manager' && selectedModule && (
          <div>{renderModule()}</div>
        )}

        {viewMode === 'manager' && !selectedModule && (
          <>
            {/* Alertas de carnets */}
            {stats && stats.expiringCerts.length > 0 && (
              <div className="bg-red-50 border-2 border-red-200 p-4 rounded-2xl mb-6 flex items-start gap-3">
                <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center text-white shrink-0">
                  <AlertTriangle size={18} />
                </div>
                <div className="flex-1">
                  <h4 className="text-red-900 font-black text-sm">Carnets de sanidad por vencer</h4>
                  <p className="text-red-700 text-xs mt-0.5">
                    {stats.expiringCerts.length} empleado{stats.expiringCerts.length > 1 ? 's' : ''} con carnet venciendo en los próximos 30 días:
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {stats.expiringCerts.map(e => (
                      <span key={e.id} className="text-[10px] font-bold px-2 py-0.5 bg-white border border-red-200 text-red-700 rounded-md">
                        {e.full_name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* KPIs */}
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100 animate-pulse">
                    <div className="w-10 h-10 bg-gray-100 rounded-xl mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-2/3 mb-1" />
                    <div className="h-6 bg-gray-100 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : stats ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <StatCard label="Personal activo" value={`${stats.counts.active}/${stats.total}`} color="text-blue-600 bg-blue-100" icon={Users} />
                <StatCard label="Presentes hoy"   value={String(stats.presentToday)}              color="text-violet-600 bg-violet-100" icon={Clock} />
                <StatCard label="Solicitudes pendientes" value={String(stats.pendingLeave)}        color="text-amber-600 bg-amber-100" icon={Calendar} />
                <StatCard label="Nómina proyectada" value={fmt(stats.payroll.total)}                color="text-emerald-600 bg-emerald-100" icon={DollarSign} />
              </div>
            ) : null}

            {/* Módulos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {MODULES.map(m => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedModule(m.id)}
                    className="group bg-white rounded-2xl p-6 border-2 border-gray-100 hover:border-emerald-300 hover:shadow-md text-left transition-all"
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${m.color}`}>
                      <Icon size={22} />
                    </div>
                    <h3 className="text-base font-black text-gray-900 mb-1">{m.title}</h3>
                    <p className="text-xs text-gray-500 mb-3">{m.desc}</p>
                    <div className="flex items-center text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                      Abrir <ChevronRight size={12} className="ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; color: string; icon: React.ElementType }> = ({ label, value, color, icon: Icon }) => (
  <div className="bg-white p-5 rounded-2xl border border-gray-100">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${color}`}>
      <Icon size={18} />
    </div>
    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">{label}</p>
    <p className="text-2xl font-black text-gray-900 leading-tight truncate">{value}</p>
  </div>
);

export default HRDashboard;
