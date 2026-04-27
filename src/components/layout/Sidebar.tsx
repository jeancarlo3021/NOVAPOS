import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FileText,
  LogOut,
  Settings,
  Utensils,
  X,
  User2,
  Users,
  BookOpen,
  TrendingDown,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import type { PlanFeatures } from '@/context/AuthContext';

interface NavItem {
  name: string;
  to: string;
  icon: React.ElementType;
  feature: keyof PlanFeatures | 'always' | 'owner_only' | 'admin_only';
}

const navigation: NavItem[] = [
  { name: 'Dashboard',           to: '/',              icon: LayoutDashboard, feature: 'always'      },
  { name: 'Punto de Venta',      to: '/pos',           icon: ShoppingCart,    feature: 'pos'         },
  { name: 'Inventario',          to: '/inventory',     icon: Package,         feature: 'always'      },
  { name: 'Recetas',             to: '/recipes',       icon: BookOpen,        feature: 'inventory'   }, // ✅ Nueva sección de recetas
  { name: 'Gastos',              to: '/expenses',      icon: TrendingDown,    feature: 'expenses'    },
  { name: 'Reportes',            to: '/reports',       icon: FileText,        feature: 'reports'     },
  { name: 'Usuarios',            to: '/users',         icon: Users,           feature: 'users'       },
  { name: 'Configuración',       to: '/settings',      icon: Settings,        feature: 'settings'    },
  { name: 'Panel Admin',         to: '/create-owner',  icon: User2,           feature: 'admin_only'  }, // ✅ Solo para el plan Admin
];

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen }) => {
  const { user, logout, getRoleLabel, planFeatures } = useAuth();
  const location = useLocation();
  const isPOS = location.pathname === '/pos';

  // Función para verificar si el usuario tiene el plan Admin basado en los datos proporcionados
  const isSystemAdmin = () => {
    // Verificamos si el plan del usuario tiene la característica 'admin_dashboard' 
    // que es única del plan Admin según tu CSV.
    return planFeatures?.admin_dashboard === true;
  };

  const isAllowed = (feature: NavItem['feature']) => {
    if (feature === 'always') return true;
    
    // Lógica específica para admin_only
    if (feature === 'admin_only') {
      return isSystemAdmin();
    }

    if (feature === 'owner_only') return user?.role === 'owner';
    
    // Verificación por características del plan
    return planFeatures[feature as keyof PlanFeatures] ?? false;
  };

  const visibleNavigation = navigation.filter((item) => isAllowed(item.feature));

  const SidebarContent = () => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800">
        <div className="flex items-center gap-2 text-xl font-bold text-emerald-400">
          <Utensils className="w-6 h-6" />
          <span>NovaPOS</span>
        </div>
        <button onClick={() => setIsOpen(false)} className="md:hidden text-gray-400 hover:text-white">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="px-3 space-y-1">
          {visibleNavigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.to}
              onClick={() => setIsOpen(false)}
              className={({ isActive }) =>
                `flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-gray-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={`w-5 h-5 mr-3 ${
                      isActive ? 'text-emerald-400' : 'text-gray-400'
                    }`}
                  />
                  <span className="flex-1">{item.name}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* User Info */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-sm font-bold text-white">
            {user?.full_name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.full_name || 'Usuario'}</p>
            <p className="text-xs text-gray-400 truncate">
              {user?.role ? getRoleLabel(user.role) : 'Sin rol'}
            </p>
          </div>
          <button
            onClick={logout}
            className="p-2 text-gray-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="fixed inset-0 bg-gray-900/80" onClick={() => setIsOpen(false)} />
          <div className="fixed inset-y-0 left-0 flex flex-col w-64 bg-slate-900 z-50">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      {!isPOS && (
        <aside className="hidden md:flex flex-col w-64 bg-slate-900 border-r border-slate-800">
          <SidebarContent />
        </aside>
      )}
    </>
  );
};

export default Sidebar;