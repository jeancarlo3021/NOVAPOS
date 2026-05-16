import React from 'react';
import { Calendar, CheckCircle, XCircle, Clock } from 'lucide-react';

export const LeaveRequestModal = () => {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-black text-gray-900">Control de Ausencias</h2>
      
      <div className="grid grid-cols-1 gap-4">
        {[
          { name: 'Roberto Gómez', type: 'Vacaciones', date: '20 May - 25 May', status: 'Pendiente', color: 'bg-amber-100 text-amber-600' },
          { name: 'Sonia Rivas', type: 'Incapacidad', date: '13 May - 15 May', status: 'Aprobado', color: 'bg-emerald-100 text-emerald-600' },
        ].map((req, i) => (
          <div key={i} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${req.color}`}>
                <Calendar size={20} />
              </div>
              <div>
                <h4 className="font-black text-gray-900">{req.name}</h4>
                <p className="text-xs text-gray-500 font-medium">{req.type} • {req.date}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {req.status === 'Pendiente' ? (
                <>
                  <button className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100"><CheckCircle size={20}/></button>
                  <button className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100"><XCircle size={20}/></button>
                </>
              ) : (
                <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase ${req.color}`}>
                  {req.status}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};