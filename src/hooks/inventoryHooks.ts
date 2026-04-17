import { useState, useEffect } from 'react';
import { inventoryProductsService } from '@/services/Inventory/InventoryProductsService';
import type { Product } from '@/types/Types_POS';

export interface Stats {
  totalProducts: number;
  totalValue: number;
  totalCost: number;
  lowStockCount: number;
}

export const useInventoryStats = (tenantId: string | undefined) => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      setError(null);
      const inventoryStats = await inventoryProductsService.getInventoryStats(tenantId);
      const lowStockProducts = await inventoryProductsService.getLowStockProducts(tenantId);
      
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

  useEffect(() => {
    fetchStats();
  }, [tenantId]);

  return { stats, loading, error, refetch: fetchStats };
};

export const useLowStockProducts = (tenantId: string | undefined) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLowStockProducts = async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await inventoryProductsService.getLowStockProducts(tenantId);
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar alertas');
      console.error('Error fetching low stock products:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLowStockProducts();
  }, [tenantId]);

  return { products, loading, error, refetch: fetchLowStockProducts };
};

export const useStockMovements = (tenantId: string | undefined) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await inventoryProductsService.getAllProducts(tenantId);
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar productos');
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateStock = async (productId: string, quantity: number, operation: 'add' | 'subtract') => {
    try {
      const product = products.find((p: any) => p.id === productId);
      if (!product) throw new Error('Producto no encontrado');

      const newQuantity = operation === 'add'
        ? (product as any).stock_quantity + quantity
        : (product as any).stock_quantity - quantity;

      if (newQuantity < 0) {
        throw new Error('No puedes restar más stock del disponible');
      }

      await inventoryProductsService.updateStock(productId, newQuantity);
      await fetchProducts();
      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al actualizar stock';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [tenantId]);

  return { products, loading, error, updateStock, refetch: fetchProducts };
};