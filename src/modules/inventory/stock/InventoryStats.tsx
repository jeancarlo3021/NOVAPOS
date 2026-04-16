import React, { useState } from 'react';
import { Package, AlertTriangle, TrendingUp, DollarSign, RefreshCw, RotateCw } from 'lucide-react';
import { inventoryProductsService } from '@/services/InventoryProductsService';
import { useSafeFetch } from '@/hooks/useSafeFetch';
import { useAuth } from '@/context/AuthContext';
import { 
  Card, 
  CardContent,
  Spinner,
  Alert,
  Button
} from '@/components/ui/uiComponents';

interface Stats {
  totalProducts: number;
  totalValue: number;
  totalCost: number;
  lowStockCount: number;
}

interface StatCardProps {
  icon: React.ComponentType<{ size: number; className: string }>;
  label: string;
  value: string | number;
  color: string;
  trend?: number;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, label, value, color, trend }) => (
  <Card className={`p-6 ${color} border-0 shadow-sm hover:shadow-md transition-shadow`}>
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <p className="text-sm font-medium opacity-75">{label}</p>
        <p className="text-3xl font-bold mt-3">{value}</p>
        {trend !== undefined && (
          <p className={`text-xs mt-2 font-semibold ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs mes anterior
          </p>
        )}
      </div>
      <div className="flex-shrink-0">
        <Icon size={40} className="opacity-20" />
      </div>
    </div>
  </Card>
);

export const InventoryStats: React.FC = () => {
  const { user } = useAuth();
  const [retryCount, setRetryCount] = useState(0);

  // Obtener estadísticas de inventario
  const {
    data: inventoryStats,
    loading: statsLoading,
    error: statsError,
    retry: retryStats
  } = useSafeFetch(
    () => inventoryProductsService.getInventoryStats(user!.tenant_id),
    { timeout: 10000, retries: 2, retryDelay: 1000 }
  );

  // Obtener productos con stock bajo
  const {
    data: lowStockProducts = [],
    loading: lowStockLoading,
    error: lowStockError,
    retry: retryLowStock
  } = useSafeFetch(
    () => inventoryProductsService.getLowStockProducts(user!.tenant_id),
    { timeout: 10000, retries: 2, retryDelay: 1000 }
  );

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    retryStats();
    retryLowStock();
  };

  const loading = statsLoading || lowStockLoading;
  const error = statsError || lowStockError;

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert type="error" message={`🚨 ${error}`} />
        <Button
          onClick={handleRetry}
          size="lg"
          className="mt-4 bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
        >
          <RotateCw size={16} />
          Reintentar
        </Button>
      </div>
    );
  }

  if (!inventoryStats) {
    return null;
  }

  const stats: Stats = {
    totalProducts: inventoryStats.totalProducts || 0,
    totalValue: inventoryStats.totalValue || 0,
    totalCost: inventoryStats.totalCost || 0,
    lowStockCount: lowStockProducts.length || 0,
  };

  const profit = stats.totalValue - stats.totalCost;
  const margin = stats.totalValue > 0 ? ((profit / stats.totalValue) * 100).toFixed(1) : '0';

  const statCards: StatCardProps[] = [
    {
      icon: Package,
      label: 'Productos Total',
      value: stats.totalProducts,
      color: 'bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600',
      trend: 2.5
    },
    {
      icon: AlertTriangle,
      label: 'Stock Bajo',
      value: stats.lowStockCount,
      color: 'bg-gradient-to-br from-red-50 to-red-100 text-red-600',
      trend: -1.2
    },
    {
      icon: DollarSign,
      label: 'Valor Total',
      value: `$${stats.totalValue.toFixed(2)}`,
      color: 'bg-gradient-to-br from-green-50 to-green-100 text-green-600',
      trend: 5.8
    },
    {
      icon: TrendingUp,
      label: 'Margen de Ganancia',
      value: `${margin}%`,
      color: 'bg-gradient-to-br from-purple-50 to-purple-100 text-purple-600',
      trend: 3.2
    }
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Estadísticas de Inventario</h2>
          <p className="text-gray-500 mt-1">Resumen general del estado de tu inventario</p>
        </div>
        <button
          onClick={handleRetry}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Actualizar"
        >
          <RefreshCw size={20} className="text-gray-600" />
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => (
          <StatCard key={index} {...card} />
        ))}
      </div>
    </div>
  );
};