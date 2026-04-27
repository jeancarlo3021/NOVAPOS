import React from 'react';
import { BookOpen } from 'lucide-react';
import { ComingSoon } from '@/components/ComingSoon';

export const Recipes: React.FC = () => {
  return (
    <ComingSoon
      title="Recetas"
      description="Gestiona las recetas de tus productos, calcula costos automáticamente y lleva el control de ingredientes y rendimiento."
      icon={BookOpen}
      features={[
        { icon: '📖', text: 'Crea recetas con ingredientes y cantidades' },
        { icon: '💰', text: 'Cálculo automático de costo por porción' },
        { icon: '📦', text: 'Descuento automático de inventario al vender' },
        { icon: '⚖️', text: 'Control de rendimiento y merma' },
        { icon: '📊', text: 'Análisis de rentabilidad por receta' },
      ]}
    />
  );
};
