import React from 'react';
import { NavLink, useLocation } from 'react-router-dom'
import { 
  LayoutDashboard, 
  ShoppingCart, 
  ChefHat, 
  Package, 
  FileText,
  LogOut,
  Settings, 
  Utensils, 
  X, 
  User2, 
  Users 
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext'

const navigation = [
  { name: 'Dashboard', to: '/', icon: LayoutDashboard },
  { name: 'Punto de Venta', to: '/pos', icon: ShoppingCart },
  { name: 'Recetas & Catálogo', to: '/catalog', icon: ChefHat },
  { name: 'Productos', to: '/inventory', icon: Package },
  { name: 'Usuarios', to: '/users', icon: Users },
  { name: 'Crear Usuario prueba', to: '/create-owner', icon: User2 },
  { name: 'Reportes', to: '/reports', icon: FileText },
  { name: 'Configuración', to: '/settings', icon: Settings },
];

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen }) => {
  const { user, logout, getRoleLabel } = useAuth();
  const location = useLocation();
  const isPOS = location.pathname === '/pos';

  const SidebarContent = () => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800">
        <div className="flex items-center gap-2 text-xl font-bold text-emerald-400">
          <Utensils className="w-6 h-6" />
          <span>NexoERP</span>
        </div>
        <button 
          onClick={() => setIsOpen(false)} 
          className="md:hidden text-gray-400 hover:text-white"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="px-3 space-y-1">
          {navigation.map((item) => (
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
                  {item.name}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* User Info */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-sm font-bold text-white">
            {user?.full_name?.charAt(0).toUpperCase() || 'U'}
          </div>

          {/* User Details */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.full_name || 'Usuario'}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {user?.role ? getRoleLabel(user.role) : 'Sin rol'}
            </p>
          </div>

          {/* Logout Button */}
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
      {/* Mobile Sidebar Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div 
            className="fixed inset-0 bg-gray-900/80" 
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 flex flex-col w-64 bg-slate-900 z-50 transition-transform transform">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Desktop Sidebar - Ocultar en POS */}
      {!isPOS && (
        <aside className="hidden md:flex flex-col w-64 bg-slate-900 transition-all duration-300 border-r border-slate-800">
          <SidebarContent />
        </aside>
      )}
    </>
  );
};

export default Sidebar;
