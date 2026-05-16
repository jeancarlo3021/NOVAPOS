import React from 'react';
import { User, Mail, Phone, Briefcase, Calendar, MapPin, Plus } from 'lucide-react';

export const EmployeeProfile = () => {
  const employees = [
    { id: 1, name: 'Marcos Solís', role: 'Mesero A', dept: 'Salón', status: 'Activo', initial: 'MS' },
    { id: 2, name: 'Elena Vega', role: 'Chef Ejecutivo', dept: 'Cocina', status: 'Activo', initial: 'EV' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-black text-gray-900">Expediente de Personal</h2>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2">
          <Plus size={16} /> Agregar Empleado
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {employees.map(emp => (
          <div key={emp.id} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center font-black text-xl">
                {emp.initial}
              </div>
              <div>
                <h3 className="font-black text-gray-900">{emp.name}</h3>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">{emp.role}</p>
              </div>
            </div>
            <div className="space-y-2 border-t border-gray-50 pt-4">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Briefcase size={14} /> <span>Departamento: {emp.dept}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Calendar size={14} /> <span>Ingreso: 12/05/2023</span>
              </div>
            </div>
            <button className="w-full mt-4 py-2 bg-gray-50 text-gray-600 rounded-xl text-[10px] font-black uppercase hover:bg-blue-50 hover:text-blue-600 transition-colors">
              Ver Expediente Completo
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};