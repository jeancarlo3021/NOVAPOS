'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { DollarSign, Download, Users, TrendingUp, FileText } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { employeesService } from '@/services/hr/hrService';
import type { Employee } from '../types/HR.types';

const fmt = (n: number) => `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

// Cargas sociales aproximadas en CR (CCSS, INS, BPDC) sobre salario bruto
const CHARGES_PCT = {
  ccss_employer: 0.2667,    // ~26.67% patronal (CCSS, INS, BPDC, etc.)
  ccss_employee: 0.1067,    // ~10.67% obrero (se descuenta al empleado)
};

export const SalaryManager: React.FC = () => {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? '';
  const [employees, setEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    employeesService.list().then(list => setEmployees(list.filter(e => e.status === 'active'))).catch(() => {});
  }, [tenantId]);

  const totals = useMemo(() => {
    const base = employees.reduce((s, e) => s + (e.monthly_salary ?? 0), 0);
    const commission = employees.reduce((s, e) => s + ((e.monthly_salary ?? 0) * ((e.commission_pct ?? 0) / 100)), 0);
    const gross = base + commission;
    const employerCharges = gross * CHARGES_PCT.ccss_employer;
    const employeeCharges = gross * CHARGES_PCT.ccss_employee;
    const netToEmployees = gross - employeeCharges;
    const totalCost = gross + employerCharges;
    return { base, commission, gross, employerCharges, employeeCharges, netToEmployees, totalCost };
  }, [employees]);

  const exportCsv = () => {
    const rows = ['Empleado,Cargo,Base,Comisión %,Comisión,Bruto,Deducciones (10.67%),Neto'];
    employees.forEach(e => {
      const base = e.monthly_salary ?? 0;
      const commPct = e.commission_pct ?? 0;
      const comm = base * (commPct / 100);
      const gross = base + comm;
      const deductions = gross * CHARGES_PCT.ccss_employee;
      const net = gross - deductions;
      rows.push([
        `"${e.full_name}"`, `"${e.position}"`,
        base.toFixed(0), commPct.toString(),
        comm.toFixed(0), gross.toFixed(0),
        deductions.toFixed(0), net.toFixed(0),
      ].join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nomina-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon={Users} label="Empleados activos" value={String(employees.length)} color="bg-blue-500" />
        <KPI icon={DollarSign} label="Salarios base" value={fmt(totals.base)} color="bg-emerald-500" />
        <KPI icon={TrendingUp} label="Comisiones" value={fmt(totals.commission)} color="bg-violet-500" />
        <KPI icon={FileText} label="Costo total empresa" value={fmt(totals.totalCost)} color="bg-orange-500" sub="con cargas sociales" />
      </div>

      {/* Resumen */}
      <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest opacity-80">Nómina del mes</p>
            <h2 className="text-3xl font-black mt-1">{fmt(totals.gross)}</h2>
            <p className="text-white/80 text-xs">bruto · {employees.length} empleados</p>
          </div>
          <button onClick={exportCsv}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-md px-3 py-2 rounded-lg text-xs font-bold transition">
            <Download size={14} /> Exportar CSV
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-white/15 backdrop-blur-md p-3 rounded-xl">
            <p className="text-[10px] font-bold uppercase opacity-80">Deducciones obreras (10.67%)</p>
            <p className="text-lg font-black mt-0.5">{fmt(totals.employeeCharges)}</p>
          </div>
          <div className="bg-white/15 backdrop-blur-md p-3 rounded-xl">
            <p className="text-[10px] font-bold uppercase opacity-80">Neto a pagar</p>
            <p className="text-lg font-black mt-0.5">{fmt(totals.netToEmployees)}</p>
          </div>
          <div className="bg-white/15 backdrop-blur-md p-3 rounded-xl">
            <p className="text-[10px] font-bold uppercase opacity-80">Cargas patronales (26.67%)</p>
            <p className="text-lg font-black mt-0.5">{fmt(totals.employerCharges)}</p>
          </div>
        </div>
      </div>

      {/* Detalle por empleado */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-black text-gray-900">Detalle por empleado</h3>
        </div>
        {employees.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="font-semibold">Sin empleados activos</p>
            <p className="text-xs mt-1">Agrega empleados con su salario en la pestaña Empleados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-2.5 text-xs font-black text-gray-500 uppercase">Empleado</th>
                  <th className="text-right px-3 py-2.5 text-xs font-black text-gray-500 uppercase">Base</th>
                  <th className="text-right px-3 py-2.5 text-xs font-black text-gray-500 uppercase">Comisión</th>
                  <th className="text-right px-3 py-2.5 text-xs font-black text-gray-500 uppercase">Bruto</th>
                  <th className="text-right px-3 py-2.5 text-xs font-black text-gray-500 uppercase">Deducc.</th>
                  <th className="text-right px-5 py-2.5 text-xs font-black text-gray-500 uppercase">Neto</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(e => {
                  const base = e.monthly_salary ?? 0;
                  const comm = base * ((e.commission_pct ?? 0) / 100);
                  const gross = base + comm;
                  const deduc = gross * CHARGES_PCT.ccss_employee;
                  const net = gross - deduc;
                  return (
                    <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <p className="font-bold text-gray-900">{e.full_name}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">{e.position}</p>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-gray-700">{fmt(base)}</td>
                      <td className="px-3 py-3 text-right font-mono text-violet-600">
                        {comm > 0 ? `+${fmt(comm)}` : '—'}
                        {(e.commission_pct ?? 0) > 0 && (
                          <p className="text-[10px] text-gray-400">{e.commission_pct}%</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-gray-900">{fmt(gross)}</td>
                      <td className="px-3 py-3 text-right font-mono text-red-600">-{fmt(deduc)}</td>
                      <td className="px-5 py-3 text-right font-mono font-black text-emerald-600">{fmt(net)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center">
        💡 Cálculos basados en cargas sociales de Costa Rica (CCSS, INS, BPDC). Verifica con tu contador para exactitud.
      </p>
    </div>
  );
};

const KPI: React.FC<{ icon: any; label: string; value: string; color: string; sub?: string }> = ({ icon: Icon, label, value, color, sub }) => (
  <div className="bg-white rounded-2xl p-5 border border-gray-100 flex items-center gap-3">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
      <Icon size={20} className="text-white" />
    </div>
    <div className="min-w-0">
      <p className="text-gray-500 text-xs font-bold uppercase tracking-wide">{label}</p>
      <p className="text-gray-900 font-black text-lg leading-tight truncate">{value}</p>
      {sub && <p className="text-gray-400 text-[10px]">{sub}</p>}
    </div>
  </div>
);
