import React, { useState } from 'react';
import { ProductsList } from './products/ProductsList';
import { SuppliersList } from './suppliers/SuppliersList';
import { PurchasesList } from './purchases/purchasesList';
import { StockMovements } from './stock/StockMovements';
import { LowStockAlerts } from './stock/LowStockAlerts';
import { InventoryStats } from './stock/InventoryStats';

type TabType = 'dashboard' | 'products' | 'suppliers' | 'purchases' | 'stock' | 'alerts';

export const InventoryDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  const tabs = [
    { id: 'dashboard', label: 'Panel' },
    { id: 'products', label: 'Productos' },
    { id: 'suppliers', label: 'Proveedores' },
    { id: 'purchases', label: 'Compras' },
    { id: 'stock', label: 'Stock' },
    { id: 'alerts', label: 'Alertas' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Gestión de Inventario</h1>
            </div>
          </div>
        </div>
      </nav>

      <div className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
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
        {activeTab === 'products' && <ProductsList />}
        {activeTab === 'suppliers' && <SuppliersList />}
        {activeTab === 'purchases' && <PurchasesList />}
        {activeTab === 'stock' && <StockMovements />}
        {activeTab === 'alerts' && <LowStockAlerts />}
      </div>
    </div>
  );
};
