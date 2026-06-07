import React, { useState, useEffect } from 'react';
import {
  Lock, ChevronLeft, Package, Boxes, AlertTriangle, FolderTree,
  Ruler, Truck, BarChart3,
} from 'lucide-react';
import { ProductsList } from './products/ProductsList';
import { SuppliersList } from './suppliers/SuppliersList';
import { StockMovements } from './stock/StockMovements';
import { LowStockAlerts } from './stock/LowStockAlerts';
import { InventoryStats } from './stock/InventoryStats';
import { CategoriesManagement } from './categories/CategoriesManagement';
import { UnitTypesManagement } from './categories/UnitTypesManagement';
import { useAuth } from '@/context/AuthContext';

type TabType = 'dashboard' | 'products' | 'suppliers' | 'stock' | 'alerts' | 'categories' | 'unitTypes';

interface TabConfig {
  id: TabType;
  label: string;
  requiredFeature?: keyof import('@/context/AuthContext').PlanFeatures;
  requiresProductsOnly?: boolean; // Para inventario con solo productos
}

export const InventoryDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const { planFeatures, planName } = useAuth();

  const tabs: TabConfig[] = [
    { id: 'dashboard', label: 'Panel', requiredFeature: 'inventory' },
    { id: 'products', label: 'Productos', requiredFeature: 'inventory' },
    { id: 'suppliers', label: 'Proveedores', requiredFeature: 'inventory' },
    { id: 'stock', label: 'Stock', requiredFeature: 'inventory' },
    { id: 'alerts', label: 'Alertas', requiredFeature: 'inventory' },
    { id: 'categories', label: 'Categorías', requiredFeature: 'inventory' },
    { id: 'unitTypes', label: 'Tipo de unidades', requiredFeature: 'inventory' },
  ];

  const pf = planFeatures as any;
  const hasInventoryAccess = pf.inventory === true;
  const hasProductsOnlyAccess = pf.inventory_products_only === true;

  // Flag por tab — undefined = activo por defecto (compat con planes viejos).
  const flagOn = (v: unknown) => v === undefined ? true : !!v;

  const getAvailableTabs = (): TabConfig[] => {
    return tabs.filter(tab => {
      if (!hasInventoryAccess) return false;

      // Tabs con su propio flag granular.
      if (tab.id === 'suppliers'  && !flagOn(pf.inventory_suppliers))         return false;
      if (tab.id === 'categories' && !flagOn(pf.inventory_categories))        return false;
      if (tab.id === 'unitTypes'  && !flagOn(pf.inventory_unit_types))        return false;
      if (tab.id === 'stock'      && !flagOn(pf.inventory_stock_view))        return false;
      if (tab.id === 'alerts'     && !flagOn(pf.inventory_low_stock_alerts))  return false;

      // Plan solo-productos sigue ocultando stock + alertas. El "dashboard"
      // (panel principal con tiles gigantes) SIEMPRE se incluye para que sea
      // la landing del módulo — los tiles que no apliquen no se renderizan.
      if (hasProductsOnlyAccess && !['dashboard', 'products', 'suppliers', 'categories', 'unitTypes'].includes(tab.id)) {
        return false;
      }

      return true;
    });
  };

  const availableTabs = getAvailableTabs();

  // Reset to first available tab when the current one isn't accessible
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.find(t => t.id === activeTab)) {
      setActiveTab(availableTabs[0].id);
    }
  }, [activeTab, availableTabs.length]);

  // ✅ Componente para mostrar acceso denegado
  const LockedTab = ({ tabLabel }: { tabLabel: string }) => (
    <div className="flex flex-col items-center justify-center h-96 gap-4 p-8">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
        <Lock size={32} className="text-gray-400" />
      </div>
      <div className="text-center">
        <h3 className="text-xl font-bold text-gray-900 mb-2">Acceso Restringido</h3>
        <p className="text-gray-600 mb-4">
          La pestaña "{tabLabel}" no está disponible en tu plan <span className="font-semibold">({planName})</span>
        </p>
        {hasProductsOnlyAccess && (
          <p className="text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-lg inline-block">
            Tu plan de inventario solo permite ver productos
          </p>
        )}
        {!hasInventoryAccess && (
          <p className="text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-lg inline-block">
            Actualiza tu plan para acceder al módulo de inventario
          </p>
        )}
      </div>
    </div>
  );

  // ── Tiles gigantes estilo Eleventa para la vista "Panel" ────────────────
  // Cada tile es un botón enorme con icono + color, que cambia a la pestaña
  // correspondiente sin necesidad de la barra superior.
  interface Tile {
    id: TabType;
    label: string;
    description: string;
    icon: React.ElementType;
    bg: string;       // gradient classes
    iconBg: string;
    iconColor: string;
    show: boolean;
  }

  const tiles: Tile[] = [
    {
      id: 'products',
      label: 'Productos',
      description: 'Crear, editar y buscar productos del inventario.',
      icon: Package,
      bg: 'from-blue-500 to-blue-600',
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
      show: hasInventoryAccess,
    },
    {
      id: 'stock',
      label: 'Stock y movimientos',
      description: 'Entradas, salidas y ajustes de existencias.',
      icon: Boxes,
      bg: 'from-emerald-500 to-emerald-600',
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
      show: hasInventoryAccess && !hasProductsOnlyAccess && flagOn(pf.inventory_stock_view),
    },
    {
      id: 'alerts',
      label: 'Alertas de stock bajo',
      description: 'Productos por debajo del mínimo configurado.',
      icon: AlertTriangle,
      bg: 'from-amber-500 to-orange-500',
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
      show: hasInventoryAccess && !hasProductsOnlyAccess && flagOn(pf.inventory_low_stock_alerts),
    },
    {
      id: 'categories',
      label: 'Categorías',
      description: 'Agrupar productos para filtros del POS.',
      icon: FolderTree,
      bg: 'from-violet-500 to-purple-600',
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
      show: hasInventoryAccess && flagOn(pf.inventory_categories),
    },
    {
      id: 'unitTypes',
      label: 'Tipos de unidad',
      description: 'Kilos, litros, unidades, libras…',
      icon: Ruler,
      bg: 'from-cyan-500 to-sky-600',
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
      show: hasInventoryAccess && flagOn(pf.inventory_unit_types),
    },
    {
      id: 'suppliers',
      label: 'Proveedores',
      description: 'Contactos y datos de proveedores.',
      icon: Truck,
      bg: 'from-rose-500 to-pink-600',
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
      show: hasInventoryAccess && flagOn(pf.inventory_suppliers),
    },
  ];

  const visibleTiles = tiles.filter(t => t.show);

  const activeTabConfig = tabs.find(t => t.id === activeTab);
  const onLandingPanel = activeTab === 'dashboard';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-3">
          {!onLandingPanel && (
            <button
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition"
            >
              <ChevronLeft size={18} />
              <span className="hidden sm:inline">Volver al panel</span>
            </button>
          )}
          <h1 className="text-xl font-black text-gray-900 truncate">
            {onLandingPanel ? 'Inventario' : activeTabConfig?.label ?? 'Inventario'}
          </h1>
        </div>
      </nav>

      {/* Contenido */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {onLandingPanel ? (
          <>
            {/* Tiles gigantes — Eleventa-style */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mb-8">
              {visibleTiles.map((tile) => {
                const Icon = tile.icon;
                return (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => setActiveTab(tile.id)}
                    className={`relative overflow-hidden rounded-3xl p-6 sm:p-7 text-left bg-linear-to-br ${tile.bg} text-white shadow-lg hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 active:scale-[0.98] transition-all duration-150 min-h-45 sm:min-h-50 flex flex-col justify-between`}
                  >
                    {/* Decoración suave */}
                    <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                    <div className="absolute -bottom-10 -left-10 w-24 h-24 rounded-full bg-white/5 blur-xl pointer-events-none" />

                    <div className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl ${tile.iconBg} flex items-center justify-center backdrop-blur-sm`}>
                      <Icon size={36} strokeWidth={2.2} className={tile.iconColor} />
                    </div>

                    <div className="relative">
                      <h3 className="text-2xl sm:text-3xl font-black leading-tight mb-1.5">{tile.label}</h3>
                      <p className="text-sm sm:text-base text-white/85 font-medium leading-snug">
                        {tile.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Stats abajo del grid (solo si plan no es products-only) */}
            {hasInventoryAccess && !hasProductsOnlyAccess && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2 sm:p-4">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 mb-2">
                  <BarChart3 size={18} className="text-gray-400" />
                  <h2 className="text-base font-bold text-gray-700">Resumen del inventario</h2>
                </div>
                <InventoryStats />
              </div>
            )}

            {visibleTiles.length === 0 && (
              <LockedTab tabLabel="Inventario" />
            )}
          </>
        ) : (
          <>
            {activeTab === 'products' && (
              hasInventoryAccess ? <ProductsList /> : <LockedTab tabLabel="Productos" />
            )}
            {activeTab === 'suppliers' && (
              hasInventoryAccess ? <SuppliersList /> : <LockedTab tabLabel="Proveedores" />
            )}
            {activeTab === 'categories' && (
              hasInventoryAccess ? <CategoriesManagement /> : <LockedTab tabLabel="Categorías" />
            )}
            {activeTab === 'unitTypes' && (
              hasInventoryAccess ? <UnitTypesManagement /> : <LockedTab tabLabel="Tipo de unidades" />
            )}
            {activeTab === 'stock' && (
              hasInventoryAccess && !hasProductsOnlyAccess
                ? <StockMovements />
                : <LockedTab tabLabel="Stock" />
            )}
            {activeTab === 'alerts' && (
              hasInventoryAccess && !hasProductsOnlyAccess
                ? <LowStockAlerts />
                : <LockedTab tabLabel="Alertas" />
            )}
          </>
        )}
      </div>
    </div>
  );
};