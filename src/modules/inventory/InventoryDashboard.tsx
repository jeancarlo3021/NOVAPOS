import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { ProductsList } from './products/ProductsList';
import { SuppliersList } from './suppliers/SuppliersList';
import { PurchasesList } from './purchases/purchasesList';
import { StockMovements } from './stock/StockMovements';
import { LowStockAlerts } from './stock/LowStockAlerts';
import { InventoryStats } from './stock/InventoryStats';
import { CategoriesManagement } from './categories/CategoriesManagement';
import { UnitTypesManagement } from './categories/UnitTypesManagement';
import { useAuth } from '@/context/AuthContext';

type TabType = 'dashboard' | 'products' | 'suppliers' | 'purchases' | 'stock' | 'alerts' | 'categories' | 'unitTypes';

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
    { id: 'dashboard', label: 'Panel',requiredFeature: 'inventory' },
    { id: 'products', label: 'Productos', requiredFeature: 'inventory' },
    { id: 'suppliers', label: 'Proveedores', requiredFeature: 'inventory' },
    { id: 'purchases', label: 'Compras', requiredFeature: 'inventory' },
    { id: 'stock', label: 'Stock', requiredFeature: 'inventory' },
    { id: 'alerts', label: 'Alertas', requiredFeature: 'inventory' },
    { id: 'categories', label: 'Categorías', requiredFeature: 'inventory' },
    { id: 'unitTypes', label: 'Tipo de unidades', requiredFeature: 'inventory' },
  ];

  // ✅ Verificar si el usuario tiene acceso a inventario
  const hasInventoryAccess = (planFeatures as any).inventory === true;
  
  // ✅ Verificar si solo tiene acceso a productos
  const hasProductsOnlyAccess = (planFeatures as any).inventory_products_only === true;

  // ✅ Filtrar pestañas según permisos
  const getAvailableTabs = (): TabConfig[] => {
    return tabs.filter(tab => {

      // Si no tiene inventario, no muestra nada de inventario
      if (!hasInventoryAccess) return false;

      // Si solo tiene productos, solo muestra productos
      if (hasProductsOnlyAccess) {
        return tab.id === 'products';
      }

      // Si tiene acceso completo a inventario, muestra todo
      return true;
    });
  };

  const availableTabs = getAvailableTabs();

  // ✅ Si la pestaña activa no está disponible, cambiar a dashboard
  if (!availableTabs.find(t => t.id === activeTab)) {
    setActiveTab('dashboard');
  }

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

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Gestión de Inventario</h1>
              <span className="ml-4 px-3 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">
                {planName}
              </span>
            </div>
          </div>
        </div>
      </nav>

      <div className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 overflow-x-auto">
            {availableTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        {activeTab === 'dashboard' && <InventoryStats />}
        
        {activeTab === 'products' && (
          hasInventoryAccess ? <ProductsList /> : <LockedTab tabLabel="Productos" />
        )}
        
        {activeTab === 'suppliers' && (
          hasInventoryAccess && !hasProductsOnlyAccess ? (
            <SuppliersList />
          ) : (
            <LockedTab tabLabel="Proveedores" />
          )
        )}
        
        {activeTab === 'purchases' && (
          hasInventoryAccess && !hasProductsOnlyAccess ? (
            <PurchasesList />
          ) : (
            <LockedTab tabLabel="Compras" />
          )
        )}
        
        {activeTab === 'stock' && (
          hasInventoryAccess && !hasProductsOnlyAccess ? (
            <StockMovements />
          ) : (
            <LockedTab tabLabel="Stock" />
          )
        )}
        
        {activeTab === 'alerts' && (
          hasInventoryAccess && !hasProductsOnlyAccess ? (
            <LowStockAlerts />
          ) : (
            <LockedTab tabLabel="Alertas" />
          )
        )}
        
        {activeTab === 'categories' && (
          hasInventoryAccess && !hasProductsOnlyAccess ? (
            <CategoriesManagement />
          ) : (
            <LockedTab tabLabel="Categorías" />
          )
        )}
        
        {activeTab === 'unitTypes' && (
          hasInventoryAccess && !hasProductsOnlyAccess ? (
            <UnitTypesManagement />
          ) : (
            <LockedTab tabLabel="Tipo de unidades" />
          )
        )}
      </div>
    </div>
  );
};