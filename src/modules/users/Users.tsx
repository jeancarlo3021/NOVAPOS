import React, { useState } from 'react';
import { Users as UsersIcon, Shield, BarChart3, Users2, Calendar, Lock } from 'lucide-react';
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Lock size={28} className="text-gray-400" />
          </div>
          <h1 className="text-xl font-black text-gray-900 mb-2">Módulo no disponible</h1>
          <p className="text-sm text-gray-500">
            La gestión de usuarios no está habilitada en tu plan actual. Contactá al administrador para activarlo.
          </p>
        </div>
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

  const activeTabConfig = tabs.find(t => t.id === activeTab);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header compacto estilo Eleventa */}
      <nav className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center shrink-0">
            <UsersIcon size={18} className="text-white" />
          </div>
          <h1 className="text-xl font-black text-gray-900 truncate">
            {activeTabConfig?.label ?? 'Usuarios'}
          </h1>
          <span className="hidden sm:inline text-xs text-gray-400 truncate">
            · {tabs.length} secci{tabs.length === 1 ? 'ón' : 'ones'} disponible{tabs.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Tabs como chips compactos */}
        <div className="border-t border-gray-100 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-1 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2.5 font-bold text-sm transition relative whitespace-nowrap ${
                  active
                    ? 'text-blue-600'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {tab.icon}
                {tab.label}
                {active && (
                  <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-blue-500 rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {activeTabConfig?.component}
        </div>
      </div>
    </div>
  );
};
