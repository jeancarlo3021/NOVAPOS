import React, { useState } from 'react';
import {
  Users, Clock, Calendar, DollarSign, 
  Shield, Lock, Plus, Search, ChevronRight,
  Briefcase, FileText, PieChart, Bell, ArrowLeft,
  UserCircle, ShieldCheck, Send, Info, Utensils,
  AlertTriangle, BookOpen, CheckSquare, Star, Award
} from 'lucide-react';

// Importaciones de tus componentes locales
import { EmployeeProfile } from './components/EmployeeProfile';
import { SalaryManager } from './components/SalaryManager';
import { LeaveRequestModal } from './components/LeaveRequestModal';
import { AttendanceTracker } from './components/AttendanceTracker';

// --- 1. GESTIÓN DE PROPINAS (TRONCO) ---
const TipsManager = () => {
  const totalTips = 450000; // Ejemplo en colones
  const staff = [
    { name: 'Marcos S.', role: 'Mesero', hours: 40, share: 0 },
    { name: 'Elena V.', role: 'Cocina', hours: 44, share: 0 },
    { name: 'Ricardo M.', role: 'Barra', hours: 38, share: 0 },
  ];
  const totalHours = staff.reduce((acc, curr) => acc + curr.hours, 0);

  return (
    <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm animate-in fade-in">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
          <DollarSign className="text-amber-500" /> Reparto de Propinas (Tronco)
        </h3>
        <div className="text-right">
          <p className="text-[10px] font-black text-gray-400 uppercase">Total Acumulado Semana</p>
          <p className="text-2xl font-black text-emerald-600">₡{totalTips.toLocaleString()}</p>
        </div>
      </div>
      <div className="space-y-3">
        {staff.map((s, i) => (
          <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
            <div>
              <p className="text-sm font-black text-gray-800">{s.name}</p>
              <p className="text-[10px] text-gray-400 font-bold">{s.hours} horas trabajadas</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-black text-slate-900">₡{Math.round((totalTips / totalHours) * s.hours).toLocaleString()}</p>
              <p className="text-[10px] text-emerald-500 font-bold">Proporcional</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- 2. ALERTAS DE SANIDAD (CARNETS) ---
const HealthAlerts = () => (
  <div className="bg-red-50 border border-red-100 p-6 rounded-[2rem] mb-8 flex items-start gap-4 animate-pulse">
    <div className="w-12 h-12 bg-red-500 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-red-200">
      <AlertTriangle size={24} />
    </div>
    <div>
      <h4 className="text-red-900 font-black text-sm uppercase tracking-tight">Alerta de Sanidad</h4>
      <p className="text-red-700 text-xs font-medium mt-1">
        El carnet de manipulación de <b>Marcos Solís</b> vence en 12 días. El sistema bloqueará su asignación en el Roster si no se actualiza.
      </p>
      <button className="mt-3 text-[10px] font-black text-red-600 underline uppercase">Subir nuevo documento</button>
    </div>
  </div>
);

// --- 3. PERFORMANCE CHECKLIST ---
const PerformanceRanking = () => (
  <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
    <h3 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-2">
      <Award className="text-violet-500" /> Top Performance (Turnos Premium)
    </h3>
    <div className="space-y-4">
      {[
        { name: 'Elena Vega', score: 98, status: 'Uniforme OK, Estación Limpia' },
        { name: 'Ricardo M.', score: 92, status: 'Puntualidad Perfecta' },
      ].map((p, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="w-10 h-10 bg-violet-100 text-violet-600 rounded-full flex items-center justify-center font-black text-xs">{i+1}</div>
          <div className="flex-1">
            <div className="flex justify-between items-center">
              <p className="text-sm font-black text-gray-800">{p.name}</p>
              <span className="text-xs font-black text-violet-600">{p.score}%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1">
              <div className="h-full bg-violet-500 rounded-full" style={{ width: `${p.score}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const HRDashboard: React.FC = () => {
  const [viewMode, setViewMode] = useState<'manager' | 'employee'>('manager');
  const [selectedModule, setSelectedModule] = useState<string | null>(null);

  const HR_MODULES = [
    { id: 'roster', icon: Calendar, title: 'Roster y Disponibilidad', desc: 'Turnos rotativos y posiciones.', color: 'bg-blue-100 text-blue-600', role: 'always' },
    { id: 'sanidad', icon: Shield, title: 'Carnets de Sanidad', desc: 'Control de vencimientos críticos.', color: 'bg-red-100 text-red-600', role: 'manager' },
    { id: 'attendance', icon: Clock, title: 'Asistencia y Propinas', desc: 'Reloj marcador y reparto.', color: 'bg-emerald-100 text-emerald-600', role: 'always' },
    { id: 'onboarding', icon: BookOpen, title: 'Manual de Marca', desc: 'Protocolos y entrenamiento.', color: 'bg-violet-100 text-violet-600', role: 'always' },
    { id: 'performance', icon: CheckSquare, title: 'Checklist de Turno', desc: 'Evaluación de desempeño.', color: 'bg-amber-100 text-amber-600', role: 'manager' },
    { id: 'payroll', icon: DollarSign, title: 'Nómina y Caja', desc: 'Salarios y leyes CCSS.', color: 'bg-slate-100 text-slate-600', role: 'manager' }
  ];

  const filteredModules = HR_MODULES.filter(m => viewMode === 'manager' || m.role === 'always');

  const renderModuleContent = () => {
    switch (selectedModule) {
      case 'attendance': return <TipsManager />;
      case 'payroll': return <SalaryManager />;
      case 'performance': return <PerformanceRanking />;
      case 'onboarding': return (
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="bg-white p-6 rounded-3xl border border-gray-100 flex items-center justify-between group cursor-pointer hover:border-violet-500 transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-violet-50 text-violet-600 rounded-2xl flex items-center justify-center"><FileText /></div>
              <div><p className="font-black text-gray-900">Manual de Servicio v2.0</p><p className="text-xs text-gray-400">Protocolos de atención</p></div>
            </div>
            <ChevronRight className="text-gray-300 group-hover:text-violet-500" />
          </div>
        </div>
      );
      default: return <div className="text-center p-20 text-gray-400 font-bold">Módulo en desarrollo...</div>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header Blanco */}
      <div className="bg-white border-b border-gray-100 px-8 py-6 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            {selectedModule ? (
              <button onClick={() => setSelectedModule(null)} className="w-12 h-12 bg-gray-100 hover:bg-gray-200 rounded-2xl flex items-center justify-center transition-colors text-gray-600">
                <ArrowLeft size={24} />
              </button>
            ) : (
              <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-100">
                <Utensils size={24} className="text-white" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                {selectedModule ? HR_MODULES.find(m => m.id === selectedModule)?.title : "HR Restaurante"}
              </h1>
              <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">NovaPOS Management</p>
            </div>
          </div>

          {!selectedModule && (
            <div className="hidden md:flex bg-gray-100 p-1 rounded-2xl border border-gray-200">
              <button onClick={() => setViewMode('employee')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all ${viewMode === 'employee' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                <UserCircle size={16} /> VISTA EMPLEADO
              </button>
              <button onClick={() => setViewMode('manager')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all ${viewMode === 'manager' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                <ShieldCheck size={16} /> VISTA MANAGER
              </button>
            </div>
          )}
          
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center font-bold text-xs">AD</div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-10">
        {viewMode === 'manager' && !selectedModule && <HealthAlerts />}

        {selectedModule ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {renderModuleContent()}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
              {[
                { label: 'Personal Hoy', value: '12/14', color: 'text-blue-600' },
                { label: 'Propinas Sem.', value: '₡450k', color: 'text-emerald-600' },
                { label: 'Alertas Salud', value: '1', color: 'text-red-600' },
                { label: 'Rating Equipo', value: '4.8', color: 'text-violet-600' },
              ].map((stat, i) => (
                <div key={i} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{stat.label}</p>
                  <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredModules.map((m) => {
                const Icon = m.icon;
                return (
                  <div key={m.id} onClick={() => setSelectedModule(m.id)} className="group relative bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm transition-all duration-300 cursor-pointer hover:shadow-xl hover:-translate-y-1 hover:border-emerald-200">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${m.color} shadow-inner`}>
                      <Icon size={28} />
                    </div>
                    <h3 className="text-lg font-black text-gray-900 mb-2">{m.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed mb-6">{m.desc}</p>
                    <div className="flex items-center text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                      Entrar <ChevronRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default HRDashboard;