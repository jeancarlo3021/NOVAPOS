import React from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import type { PlanFeatures } from '@/context/AuthContext';

interface PlanGuardProps {
  feature: keyof PlanFeatures;
  children: React.ReactNode;
}

export const PlanGuard: React.FC<PlanGuardProps> = ({ feature, children }) => {
  const { planFeatures, planName } = useAuth();

  if (planFeatures[feature]) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6 p-8">
      <div className="w-20 h-20 rounded-3xl bg-gray-100 flex items-center justify-center">
        <Lock size={36} className="text-gray-400" />
      </div>
      <div className="text-center max-w-sm">
        <h2 className="text-2xl font-black text-gray-900 mb-2">Módulo no disponible</h2>
        <p className="text-gray-500 text-base">
          Tu plan actual <span className="font-semibold text-gray-700">({planName || 'Sin plan'})</span> no incluye
          acceso a este módulo.
        </p>
        <p className="text-gray-400 text-sm mt-2">
          Contacta al administrador para actualizar tu plan.
        </p>
      </div>
      <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl px-6 py-4 text-center">
        <p className="text-amber-700 font-bold text-sm">Actualiza tu plan para desbloquear esta función</p>
      </div>
    </div>
  );
};
