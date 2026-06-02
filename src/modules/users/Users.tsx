import React, { useState } from 'react';
import { Users as UsersIcon, Shield, BarChart3, Users2, Calendar } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { UsersList } from './views/UsersList';
import { RoleSettings } from './views/RoleSettings';
import { ActivityLog } from './views/ActivityLog';
import { TeamsView } from './views/TeamsView';
import { ShiftsCalendar } from './views/ShiftsCalendar';

type TabType = 'users' | 'roles' | 'activity' | 'teams' | 'shifts';

interface Tab {
  id: TabType;
  label: string;
  icon: React.ReactNode;
  component: React.ReactNode;
}

export const Users: React.FC = () => {
  const { planFeatures } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const pf = planFeatures as any;
  // undefined = activo (compat planes viejos)
  const flagOn = (v: unknown) => v === undefined ? true : !!v;

  // Check if users module is enabled in plan
  if (!planFeatures?.users) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <UsersIcon size={64} className="text-gray-400 mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Módulo No Disponible</h1>
        <p className="text-gray-600 max-w-md text-center">
          La gestión de usuarios no está habilitada en tu plan actual. Contacta al administrador para activar esta funcionalidad.
        </p>
      </div>
    );
  }

  const allTabs: Tab[] = [
    { id: 'users',    label: 'Usuarios',  icon: <UsersIcon size={18} />, component: <UsersList /> },
    { id: 'roles',    label: 'Roles',     icon: <Shield size={18} />,    component: <RoleSettings /> },
    { id: 'activity', label: 'Actividad', icon: <BarChart3 size={18} />, component: <ActivityLog /> },
    { id: 'teams',    label: 'Equipos',   icon: <Users2 size={18} />,    component: <TeamsView /> },
    { id: 'shifts',   label: 'Turnos',    icon: <Calendar size={18} />,  component: <ShiftsCalendar /> },
  ];

  // Filtrado por flags granulares del plan (undefined = visible).
  const tabs = allTabs.filter(t => {
    if (t.id === 'roles'    && !flagOn(pf.users_roles))    return false;
    if (t.id === 'activity' && !flagOn(pf.users_activity)) return false;
    if (t.id === 'teams'    && !flagOn(pf.users_teams))    return false;
    if (t.id === 'shifts'   && !flagOn(pf.users_shifts))   return false;
    return true;
  });

  // Si la pestaña activa quedó deshabilitada, salta a la primera disponible.
  if (tabs.length > 0 && !tabs.some(t => t.id === activeTab)) {
    setTimeout(() => setActiveTab(tabs[0].id), 0);
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-8 py-6 shadow-md">
        <div className="flex items-center gap-3 mb-2">
          <UsersIcon size={32} />
          <h1 className="text-3xl font-bold">Gestión de Usuarios</h1>
        </div>
        <p className="text-blue-100 text-sm">Administra usuarios, permisos, actividad, equipos y turnos</p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 bg-white">
        <div className="px-8 flex overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-4 font-medium text-sm transition-colors relative
                ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-6">
          {tabs.find((t) => t.id === activeTab)?.component}
        </div>
      </div>
    </div>
  );
};
