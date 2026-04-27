import React from 'react';
import { Users as UsersIcon } from 'lucide-react';
import { ComingSoon } from '@/components/ComingSoon';

export const Users: React.FC = () => {
  return (
    <ComingSoon
      title="Gestión de Usuarios"
      description="Pronto podrás crear y administrar los usuarios de tu equipo, asignar roles y controlar el acceso a cada módulo del sistema."
      icon={UsersIcon}
      features={[
        { icon: '👤', text: 'Crear usuarios con roles personalizados' },
        { icon: '🔐', text: 'Control de permisos por módulo' },
        { icon: '📋', text: 'Historial de actividad por usuario' },
        { icon: '🔑', text: 'Restablecimiento de contraseñas' },
        { icon: '👥', text: 'Gestión de equipos y turnos' },
      ]}
    />
  );
};
