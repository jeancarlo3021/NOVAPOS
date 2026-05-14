'use client';

import React from 'react';
import {
  Users, Clock, Calendar, DollarSign, Award,
  FileText, TrendingUp, Shield, Smile, Lock,
} from 'lucide-react';

// ── Feature cards ─────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Users,
    title: 'Gestión de Empleados',
    desc: 'Expediente digital, información personal, roles y departamentos.',
    color: 'bg-blue-100 text-blue-600',
  },
  {
    icon: Clock,
    title: 'Control de Horarios',
    desc: 'Registro de entrada y salida, turnos y horas extra.',
    color: 'bg-violet-100 text-violet-600',
  },
  {
    icon: Calendar,
    title: 'Vacaciones y Ausencias',
    desc: 'Solicitudes de vacaciones, incapacidades y permisos.',
    color: 'bg-emerald-100 text-emerald-600',
  },
  {
    icon: DollarSign,
    title: 'Nómina',
    desc: 'Cálculo automático de salarios, deducciones y CCSS.',
    color: 'bg-amber-100 text-amber-600',
  },
  {
    icon: Award,
    title: 'Evaluación de Desempeño',
    desc: 'Metas, indicadores y revisiones periódicas por empleado.',
    color: 'bg-pink-100 text-pink-600',
  },
  {
    icon: FileText,
    title: 'Documentos Laborales',
    desc: 'Contratos, cartas de trabajo y documentación legal.',
    color: 'bg-cyan-100 text-cyan-600',
  },
  {
    icon: TrendingUp,
    title: 'Reportes de RRHH',
    desc: 'Rotación, ausentismo, costos de personal y tendencias.',
    color: 'bg-orange-100 text-orange-600',
  },
  {
    icon: Shield,
    title: 'Seguridad Laboral',
    desc: 'Gestión de riesgos, incidentes y normativa laboral.',
    color: 'bg-red-100 text-red-600',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export const HRDashboard: React.FC = () => {
  return (
    <div className="min-h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-5 shadow-sm">
        <div className="flex items-center gap-3 max-w-7xl mx-auto">
          <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center">
            <Users size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Recursos Humanos</h1>
            <p className="text-gray-400 text-sm">Gestión del capital humano de tu negocio</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12 space-y-12">

        {/* Coming soon banner */}
        <div className="relative bg-gradient-to-br from-violet-600 to-indigo-700 rounded-3xl overflow-hidden shadow-xl shadow-violet-200 px-10 py-12 text-white text-center">
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />

          <div className="relative z-10 flex flex-col items-center gap-5">
            <div className="w-20 h-20 bg-white/15 rounded-3xl flex items-center justify-center backdrop-blur-sm border border-white/20">
              <Lock size={36} className="text-white" />
            </div>

            <div>
              <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 text-sm font-bold mb-4">
                <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                Próximamente
              </div>
              <h2 className="text-4xl font-black mb-3">Módulo en Desarrollo</h2>
              <p className="text-violet-200 text-lg max-w-xl mx-auto leading-relaxed">
                Estamos construyendo un módulo completo de Recursos Humanos para que puedas gestionar
                todo tu equipo desde NovaPOS.
              </p>
            </div>

            <div className="flex items-center gap-2 text-violet-200 text-sm">
              <Smile size={16} />
              <span>¡Gracias por tu paciencia! Será increíble.</span>
            </div>
          </div>
        </div>

        {/* Features preview */}
        <div>
          <div className="text-center mb-8">
            <h3 className="text-2xl font-black text-gray-900 mb-2">¿Qué incluirá?</h3>
            <p className="text-gray-500">Un vistazo a las funcionalidades que estamos preparando</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
                >
                  {/* Lock overlay on hover */}
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                    <div className="flex flex-col items-center gap-1">
                      <Lock size={20} className="text-violet-400" />
                      <span className="text-xs font-bold text-violet-600">Próximamente</span>
                    </div>
                  </div>

                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${f.color}`}>
                    <Icon size={20} />
                  </div>
                  <h4 className="font-black text-gray-900 text-sm mb-1">{f.title}</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Roadmap */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <h3 className="text-xl font-black text-gray-900 mb-6 text-center">Hoja de Ruta</h3>
          <div className="relative">
            {/* Line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-100" />

            <div className="space-y-6">
              {[
                { phase: 'Fase 1', title: 'Empleados y Horarios',      status: 'next',    desc: 'Expediente digital, turnos y control de asistencia' },
                { phase: 'Fase 2', title: 'Vacaciones y Ausencias',    status: 'planned', desc: 'Solicitudes, aprobaciones y calendario del equipo' },
                { phase: 'Fase 3', title: 'Nómina y CCSS',             status: 'planned', desc: 'Cálculo automático de salarios y deducciones legales' },
                { phase: 'Fase 4', title: 'Desempeño y Reportes',      status: 'planned', desc: 'Evaluaciones, métricas y análisis de rotación' },
              ].map((step) => (
                <div key={step.phase} className="flex gap-5 relative">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 z-10 font-black text-xs border-2 ${
                    step.status === 'next'
                      ? 'bg-violet-600 border-violet-600 text-white'
                      : 'bg-white border-gray-200 text-gray-400'
                  }`}>
                    {step.status === 'next' ? '→' : step.phase.split(' ')[1]}
                  </div>
                  <div className="pb-2">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-black text-gray-900">{step.title}</span>
                      {step.status === 'next' && (
                        <span className="text-xs bg-violet-100 text-violet-700 font-bold px-2 py-0.5 rounded-full">Próximo</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
