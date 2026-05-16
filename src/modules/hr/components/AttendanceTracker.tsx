import React from 'react';
import { Clock, LogIn, LogOut, MapPin } from 'lucide-react';

export const AttendanceTracker = () => {
  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-xl text-center">
        <div className="w-20 h-20 bg-violet-100 text-violet-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
          <Clock size={40} />
        </div>
        <h2 className="text-4xl font-black text-gray-900 mb-2">10:15 AM</h2>
        <p className="text-gray-400 font-bold uppercase tracking-widest text-xs mb-10">Miércoles 13 de Mayo</p>
        
        <div className="space-y-4">
          <button className="w-full py-5 bg-violet-600 text-white rounded-[2rem] font-black text-lg shadow-lg shadow-violet-200 hover:bg-violet-700 transition-all flex items-center justify-center gap-3">
            <LogIn /> MARCAR ENTRADA
          </button>
          <button className="w-full py-5 bg-white border-2 border-gray-100 text-gray-400 rounded-[2rem] font-black text-lg hover:border-red-200 hover:text-red-500 transition-all flex items-center justify-center gap-3">
            <LogOut /> MARCAR SALIDA
          </button>
        </div>
      </div>

      <div className="bg-violet-50 p-6 rounded-[2rem] border border-violet-100">
        <div className="flex items-center gap-3 text-violet-700">
          <MapPin size={18} />
          <span className="text-xs font-bold uppercase tracking-tight">Ubicación: Sucursal Central</span>
        </div>
      </div>
    </div>
  );
};