import React, { useState, useEffect } from 'react';
import { Package, AlertTriangle, TrendingUp, DollarSign } from 'lucide-react';
import { inventoryProductsService } from '@/services/InventoryProductsService';
import { useAuth } from '@/context/AuthContext';

interface Stats {
  totalProducts: number;
  totalValue: number;
  totalCost: number;
  lowStockCount: number;
}

export const InventoryStats: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.tenant_id) {
      fetchStats();
    }
  }, [user?.tenant_id]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const inventoryStats = await inventoryProductsService.getInventoryStats(user!.tenant_id);
      const lowStockProducts = await inventoryProductsService.getLowStockProducts(user!.tenant_id);
      
      setStats({
        totalProducts: inventoryStats.totalProducts,
        totalValue: inventoryStats.totalValue,
        totalCost: inventoryStats.totalCost,
        lowStockCount: lowStockProducts.length,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar estadísticas');
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">{error}</p>
        <button
          onClick={fetchStats}
          className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const profit = stats.totalValue - stats.totalCost;
  const margin = stats.totalValue > 0 ? ((profit / stats.totalValue) * 100).toFixed(1) : '0';

  const statCards = [
    {
      icon: Package,
      label: 'Productos Total',
      value: stats.totalProducts,
      color: 'bg-blue-50 text-blue-600'
    },
    {
      icon: AlertTriangle,
      label: 'Stock Bajo',
      value: stats.lowStockCount,
      color: 'bg-red-50 text-red-600'
    },
    {
      icon: DollarSign,
      label: 'Valor Total',
      value: `$${stats.totalValue.toFixed(2)}`,
      color: 'bg-green-50 text-green-600'
    },
    {
      icon: TrendingUp,
      label: 'Margen',
      value: `${margin}%`,
      color: 'bg-purple-50 text-purple-600'
    }
  ];

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Estadísticas de Inventario</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div key={index} className={`rounded-lg p-6 ${card.color}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold opacity-75">{card.label}</p>
                  <p className="text-3xl font-bold mt-2">{card.value}</p>
                </div>
                <Icon size={32} className="opacity-20" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};