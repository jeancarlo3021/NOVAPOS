import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FileText,
  LogOut,
  Settings,
  X,
  User2,
  Users,
  BookOpen,
  TrendingDown,
  ClipboardList,
  UserCog,
  Wallet,
  Tag,
  LayoutGrid,
  Receipt,
  Building,
  Truck,
  PackageCheck,
  Navigation,
  HandCoins,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BadgeInfo,
  Inbox
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import type { PlanFeatures } from '@/context/AuthContext';
import { useAssistedMode } from '@/hooks/useAssistedMode';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { CashRegisterIcon } from '@/components/icons/CashRegisterIcon';

interface NavItem {
  name: string;
  to: string;
  icon: React.ElementType;
  feature: keyof PlanFeatures | 'always' | 'owner_only' | 'admin_only';
  /** Módulo de role_permissions que gobierna este ítem. Si se define, el ítem
   *  solo aparece si el rol del usuario tiene can_access en ese módulo. */
  module?: string;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

// ── Navegación agrupada ──────────────────────────────────────────────────
// Cada grupo se puede colapsar para reducir ruido visual. Por defecto solo
// "Principal" abierto. Los demás se recuerdan en localStorage por usuario.
const NAV_GROUPS: NavGroup[] = [
  {
    id: 'main',
    label: 'Principal',
    defaultOpen: true,
    items: [
      { name: 'Dashboard',      to: '/',             icon: LayoutDashboard, feature: 'always' },
      { name: 'Punto de Venta', to: '/pos',          icon: ShoppingCart,    feature: 'pos',          module: 'pos'          },
      { name: 'POS Electrónico', to: '/fe-pos',      icon: Receipt,         feature: 'fe_pos' },
      { name: 'FE Facturas',    to: '/fe-facturas',  icon: FileText,        feature: 'electronic_invoice' },
      { name: 'FE Recepción',   to: '/fe-recepcion', icon: Inbox, feature: 'electronic_invoice', },
      { name: 'Distribución',   to: '/distribution', icon: Truck,           feature: 'distribution', module: 'distribution' },
      { name: 'Repartidor',     to: '/driver',       icon: PackageCheck,    feature: 'distribution', module: 'distribution' },
      { name: 'Rastreo',        to: '/distribution/tracking-settings', icon: Navigation, feature: 'owner_only' },
      { name: 'Inventario',     to: '/inventory',    icon: Package,         feature: 'always',       module: 'inventory'    },
    ],
  },
  {
    id: 'operations',
    label: 'Operaciones',
    items: [
      { name: 'Clientes',          to: '/customers',  icon: User2,         feature: 'always',     module: 'customers'  },
      { name: 'Recetas',           to: '/recipes',    icon: BookOpen,      feature: 'recipes',    module: 'recipes'    },
      { name: 'Promociones',       to: '/promotions', icon: Tag,           feature: 'promotions', module: 'promotions' },
      { name: 'Mapa de Mesas',     to: '/tables',     icon: LayoutGrid,    feature: 'tables',     module: 'restaurant' },
      { name: 'Restaurante',       to: '/billing',    icon: Receipt,       feature: 'restaurant', module: 'restaurant' },
    ],
  },
  {
    id: 'finances',
    label: 'Compras y finanzas',
    items: [
      { name: 'Órdenes de Compra', to: '/purchases',         icon: ClipboardList, feature: 'purchases',        module: 'purchases'        },
      { name: 'Cuentas por Pagar', to: '/accounts-payable',  icon: Wallet,        feature: 'accounts_payable', module: 'accounts_payable' },
      { name: 'Cuentas por Cobrar', to: '/accounts-receivable', icon: HandCoins,  feature: 'accounts_receivable', module: 'accounts_payable' },
      { name: 'Gastos',            to: '/expenses',          icon: TrendingDown,  feature: 'expenses',         module: 'expenses'         },
      { name: 'Reportes',          to: '/reports',           icon: FileText,      feature: 'reports',          module: 'reports'          },
      { name: 'D-150 Retenciones', to: '/d150',              icon: FileText,      feature: 'owner_only'        },
      { name: 'Reportes Sucursales', to: '/branch-reports',  icon: Building,      feature: 'multi_branch',     module: 'reports'          },
    ],
  },
  {
    id: 'multi-branch',
    label: 'Sucursales',
    items: [
      { name: 'Sucursales y Bodegas', to: '/branches',  icon: Building, feature: 'multi_branch',            module: 'inventory' },
      { name: 'Transferencias',       to: '/transfers', icon: Truck,    feature: 'multi_branch_transfers',  module: 'inventory' },
    ],
  },
  {
    id: 'team',
    label: 'Equipo',
    items: [
      { name: 'Recursos Humanos', to: '/hr',    icon: UserCog, feature: 'hr',    module: 'hr'    },
      { name: 'Usuarios',         to: '/users', icon: Users,   feature: 'users', module: 'users' },
    ],
  },
  {
    id: 'system',
    label: 'Sistema',
    items: [
      { name: 'Configuración', to: '/settings',     icon: Settings, feature: 'settings'   },
      { name: 'Panel Admin',   to: '/create-owner', icon: User2,    feature: 'admin_only' },
    ],
  },
];

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  isCompact: boolean;
  setIsCompact: (isCompact: boolean) => void;
}

const ASSISTED_PATHS = new Set(['/pos', '/inventory', '/reports', '/']);

const GROUPS_STORAGE_KEY = 'novapos_sidebar_groups_open';

function loadOpenGroups(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(GROUPS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  // Default: solo "main" abierto
  const defaults: Record<string, boolean> = {};
  for (const g of NAV_GROUPS) defaults[g.id] = !!g.defaultOpen;
  return defaults;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen, isCompact, setIsCompact }) => {
  const { user, logout, planFeatures } = useAuth();
  const { assisted } = useAssistedMode();
  const { canAccess } = useRolePermissions();
  const [showMore, setShowMore] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(loadOpenGroups);
  const location = useLocation();
  const isPOS = location.pathname === '/pos';

  useEffect(() => {
    try { localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(openGroups)); } catch { /* ignore */ }
  }, [openGroups]);

  const toggleGroup = (id: string) =>
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));

  const isSystemAdmin = () => planFeatures?.admin_dashboard === true;

  const isAllowed = (item: NavItem) => {
    const { feature, module } = item;
    // Admin / owner gates primero
    if (feature === 'admin_only') return isSystemAdmin();
    if (feature === 'owner_only') return user?.role === 'owner';
    // 1. El plan debe incluir la feature (salvo 'always')
    if (feature !== 'always') {
      const planHas = (planFeatures[feature as keyof PlanFeatures] ?? false) === true;
      if (!planHas) return false;
    }
    // 2. El rol del usuario debe tener acceso al módulo (si está declarado)
    if (module) return canAccess(module);
    return true;
  };

  // Si el POS está desactivado, Distribución y Repartidor van de primero.
  const posOff = planFeatures?.pos === false;
  const isDist = (it: NavItem) => it.to === '/distribution' || it.to === '/driver';
  const navGroups: NavGroup[] = posOff
    ? NAV_GROUPS.map(g => g.id === 'main'
        ? { ...g, items: [...g.items].sort((a, b) => Number(isDist(b)) - Number(isDist(a))) }
        : g)
    : NAV_GROUPS;

  // Aplana todas las rutas visibles según permisos (para asistido y compacto).
  const allVisibleFlat: NavItem[] = navGroups.flatMap(g => g.items).filter(item => isAllowed(item));

  // Filtro adicional para modo asistido
  const assistedItems = (assisted && !showMore)
    ? allVisibleFlat.filter(item => ASSISTED_PATHS.has(item.to))
    : allVisibleFlat;

  // Si la ruta actual pertenece a un grupo colapsado, lo abrimos automáticamente.
  useEffect(() => {
    for (const g of NAV_GROUPS) {
      if (g.items.some(i => i.to === location.pathname) && !openGroups[g.id]) {
        setOpenGroups(prev => ({ ...prev, [g.id]: true }));
        break;
      }
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderNavItem = (item: NavItem) => (
    <NavLink
      key={item.name}
      to={item.to}
      onClick={() => setIsOpen(false)}
      className={({ isActive }) =>
        `flex items-center rounded-lg transition-colors ${
          assisted
            ? `px-4 py-4 text-lg font-bold ${isActive
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-800 text-gray-200 hover:bg-slate-700'}`
            : `px-3 py-2 text-sm font-medium ${isActive
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'text-gray-300 hover:bg-slate-800 hover:text-white'}`
        }`
      }
      title={isCompact ? item.name : undefined}
    >
      {({ isActive }) => (
        <>
          <item.icon
            className={`shrink-0 ${assisted ? 'w-7 h-7' : 'w-5 h-5'} ${
              isActive ? (assisted ? 'text-white' : 'text-emerald-400') : (assisted ? 'text-gray-300' : 'text-gray-400')
            } ${!isCompact && 'mr-3'}`}
          />
          {!isCompact && <span className="flex-1 truncate">{item.name}</span>}
        </>
      )}
    </NavLink>
  );

  const SidebarContent = () => (
    <>
      {/* Header */}
      <div className={`flex items-center justify-between h-14 px-3 border-b border-slate-800 transition-all ${isCompact ? 'px-2' : ''}`}>
        {!isCompact ? (
          <div className="flex items-center gap-2 text-lg font-bold text-emerald-400">
            <CashRegisterIcon size={22} />
            <span>ColònClick</span>
          </div>
        ) : (
          <CashRegisterIcon size={22} className="text-emerald-400 mx-auto" />
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsCompact(!isCompact)}
            className="hidden md:block p-1.5 text-gray-400 hover:text-white hover:bg-slate-800 rounded transition"
            title={isCompact ? 'Expandir' : 'Compactar'}
          >
            {isCompact ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
          <button onClick={() => setIsOpen(false)} className="md:hidden text-gray-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-3">
        {/* Modo asistido o compacto: lista plana (sin grupos) */}
        {(assisted || isCompact) ? (
          <nav className={`${assisted ? 'space-y-3' : 'space-y-1'} ${isCompact ? 'px-2' : 'px-3'}`}>
            {assistedItems.map(renderNavItem)}

            {assisted && !isCompact && allVisibleFlat.length > assistedItems.length && (
              <button
                onClick={() => setShowMore(true)}
                className="w-full flex items-center px-4 py-4 text-lg font-bold rounded-lg bg-slate-800 text-gray-300 hover:bg-slate-700"
              >
                <ChevronRight className="w-7 h-7 shrink-0 mr-3 text-gray-400" />
                <span className="flex-1 text-left">Más opciones…</span>
              </button>
            )}
            {assisted && !isCompact && showMore && (
              <button
                onClick={() => setShowMore(false)}
                className="w-full flex items-center px-4 py-3 text-sm font-bold rounded-lg bg-slate-700/50 text-gray-300 hover:bg-slate-700"
              >
                <ChevronLeft className="w-5 h-5 shrink-0 mr-3 text-gray-400" />
                <span className="flex-1 text-left">Ocultar avanzadas</span>
              </button>
            )}
          </nav>
        ) : (
          /* Modo normal: grupos colapsables */
          <nav className="px-2 space-y-1">
            {navGroups.map((group) => {
              const visibleItems = group.items.filter(item => isAllowed(item));
              if (visibleItems.length === 0) return null;
              const isOpenG = !!openGroups[group.id];
              const hasActive = visibleItems.some(i => i.to === location.pathname);

              return (
                <div key={group.id}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] uppercase tracking-wider font-bold transition ${
                      hasActive ? 'text-emerald-400' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <ChevronDown
                      className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpenG ? '' : '-rotate-90'}`}
                    />
                    <span className="flex-1 text-left">{group.label}</span>
                    {!isOpenG && hasActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    )}
                  </button>
                  {isOpenG && (
                    <div className="mt-0.5 mb-1 space-y-0.5 pl-1">
                      {visibleItems.map(renderNavItem)}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        )}

        {/* Mi Plan — SIEMPRE visible, de último y fuera de grupos colapsables. */}
        <nav className={`mt-2 pt-2 border-t border-slate-800/60 ${isCompact ? 'px-2' : (assisted ? 'px-3' : 'px-2')}`}>
          {renderNavItem({ name: 'Mi Plan', to: '/info', icon: BadgeInfo, feature: 'always' })}
        </nav>
      </div>

      {/* User Info — minimalista */}
      <div className={`border-t border-slate-800 transition-all ${isCompact ? 'p-2' : 'p-2.5'}`}>
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold text-white shrink-0"
            title={user?.full_name || 'Usuario'}
          >
            {user?.full_name?.charAt(0).toUpperCase() || 'U'}
          </div>
          {!isCompact && (
            <span className="flex-1 min-w-0 text-sm font-semibold text-gray-200 truncate">
              {user?.full_name || 'Usuario'}
            </span>
          )}
          <button
            onClick={logout}
            className="p-2 text-gray-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors shrink-0"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
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
        <aside className={`hidden md:flex flex-col transition-all duration-300 bg-slate-900 border-r border-slate-800 ${
          isCompact ? 'w-16' : 'w-56'
        }`}>
          <SidebarContent />
        </aside>
      )}
    </>
  );
};

export default Sidebar;
