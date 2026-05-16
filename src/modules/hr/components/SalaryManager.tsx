import React from 'react';
import { DollarSign, TrendingUp, Download, PieChart } from 'lucide-react';

export const SalaryManager = () => {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-[2rem] p-8 text-white shadow-xl shadow-amber-100">
        <p className="text-xs font-black uppercase tracking-widest opacity-80 mb-2">Total Planilla Proyectada</p>
        <h2 className="text-4xl font-black mb-6">$8,420.50</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/20 backdrop-blur-md p-4 rounded-2xl">
            <p className="text-[10px] font-bold uppercase">Salarios Base</p>
            <p className="text-lg font-black">$6,200</p>
          </div>
          <div className="bg-white/20 backdrop-blur-md p-4 rounded-2xl border border-white/30">
            <p className="text-[10px] font-bold uppercase">Comisiones (10%)</p>
            <p className="text-lg font-black">$2,220.50</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-50 flex justify-between items-center">
          <h3 className="font-black text-gray-900">Detalle por Empleado</h3>
          <button className="text-amber-600 p-2 hover:bg-amber-50 rounded-lg"><Download size={18}/></button>
        </div>
        <div className="p-6 space-y-4">
          {[
            { name: 'Marcos Solís', base: 800, comm: 340, total: 1140 },
            { name: 'Lucía Méndez', base: 800, comm: 290, total: 1090 },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-2xl transition-colors border border-transparent hover:border-gray-100">
              <span className="font-bold text-gray-800">{item.name}</span>
              <div className="text-right">
                <p className="text-sm font-black text-gray-900">${item.total}</p>
                <p className="text-[10px] text-gray-400">Base: ${item.base} + Com: ${item.comm}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};