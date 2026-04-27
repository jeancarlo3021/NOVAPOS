import React from 'react';
import { Clock, Sparkles } from 'lucide-react';

interface Feature {
  icon: string;
  text: string;
}

interface ComingSoonProps {
  title: string;
  description?: string;
  features?: Feature[];
  icon?: React.ElementType;
}

export const ComingSoon: React.FC<ComingSoonProps> = ({
  title,
  description,
  features = [],
  icon: Icon,
}) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-8">
      {/* Glow background */}
      <div className="relative flex flex-col items-center text-center max-w-lg w-full">

        {/* Floating badge */}
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-bold px-4 py-1.5 rounded-full mb-8 shadow-sm">
          <Sparkles size={14} className="text-emerald-500" />
          Próximamente
        </div>

        {/* Icon */}
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center shadow-2xl">
            {Icon
              ? <Icon size={42} className="text-emerald-400" />
              : <Clock size={42} className="text-emerald-400" />
            }
          </div>
          {/* Pulse ring */}
          <div className="absolute inset-0 rounded-3xl border-2 border-emerald-400 opacity-30 animate-ping" />
        </div>

        {/* Title */}
        <h1 className="text-3xl font-black text-gray-900 mb-3">{title}</h1>

        {/* Description */}
        <p className="text-gray-500 text-base leading-relaxed mb-8">
          {description ?? 'Estamos trabajando en este módulo. Estará disponible muy pronto con todas las funcionalidades que necesitas.'}
        </p>

        {/* Features list */}
        {features.length > 0 && (
          <div className="w-full bg-white border border-gray-100 rounded-2xl p-5 shadow-sm mb-6">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Lo que viene</p>
            <ul className="space-y-3">
              {features.map((f, i) => (
                <li key={i} className="flex items-center gap-3 text-sm text-gray-700">
                  <span className="text-lg leading-none">{f.icon}</span>
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Progress bar decoration */}
        <div className="w-full max-w-xs">
          <div className="flex justify-between text-xs text-gray-400 mb-1.5">
            <span>En desarrollo</span>
            <span>Completado pronto</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full animate-pulse"
              style={{ width: '65%' }}
            />
          </div>
        </div>

      </div>
    </div>
  );
};
