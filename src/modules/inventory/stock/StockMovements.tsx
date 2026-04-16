import React, { useState, useRef } from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';
import { inventoryProductsService, InventoryProduct } from '@/services/InventoryProductsService';
import { useSafeFetch } from '@/hooks/useSafeFetch';
import { useAuth } from '@/context/AuthContext';
import { 
  Card, 
  CardHeader, 
  CardContent,
  Spinner,
  Alert,
  Button,
  Badge,
  Divider
} from '@/components/ui/uiComponents';

export const StockMovements: React.FC = () => {
  const { user } = useAuth();
  const isMountedRef = useRef(true);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [operation, setOperation] = useState<'add' | 'subtract'>('add');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Obtener productos con useSafeFetch
  const {
    data: products = [],
    loading,
    error,
    retry
  } = useSafeFetch(
    () => inventoryProductsService.getAllProducts(user!.tenant_id),
    { timeout: 10000, retries: 2, retryDelay: 1000 }
  );

  const handleUpdateStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !quantity) return;

    setUpdating(true);
    setUpdateError(null);
    setSuccessMessage(null);

    try {
      const product = products.find((p) => p.id === selectedProductId);
      if (!product) {
        setUpdateError('Producto no encontrado');
        return;
      }

      const quantityNum = parseInt(quantity);
      if (isNaN(quantityNum) || quantityNum <= 0) {
        setUpdateError('La cantidad debe ser un número mayor a 0');
        return;
      }

      const newQuantity = operation === 'add' 
        ? product.stock_quantity + quantityNum
        : product.stock_quantity - quantityNum;

      if (newQuantity < 0) {
        setUpdateError(`No puedes restar más stock del disponible. Stock actual: ${product.stock_quantity}`);
        return;
      }

      // Actualizar stock
      await inventoryProductsService.updateProduct(selectedProductId, {
        stock_quantity: newQuantity
      });

      if (isMountedRef.current) {
        setSuccessMessage(
          `✓ Stock actualizado: ${product.name} ${operation === 'add' ? '+' : '-'}${quantityNum}`
        );
        setQuantity('');
        setSelectedProductId(null);
        setTimeout(() => setSuccessMessage(null), 3000);
        
        // Recargar productos
        await retry();
      }
    } catch (err) {
      if (isMountedRef.current) {
        setUpdateError(err instanceof Error ? err.message : 'Error al actualizar stock');
      }
    } finally {
      if (isMountedRef.current) {
        setUpdating(false);
      }
    }
  };

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex justify-center">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Movimientos de Stock</h2>
        <p className="text-gray-500 mt-1">Agregar o restar stock de tus productos</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-red-800">🚨 {error}</span>
          </div>
          <Button
            onClick={retry}
            size="sm"
            className="bg-red-600 hover:bg-red-700 flex items-center gap-2"
          >
            <RotateCw size={16} />
            Reintentar
          </Button>
        </div>
      )}

      {updateError && (
        <Alert type="error" message={updateError} />
      )}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 font-medium">{successMessage}</p>
        </div>
      )}

      <Card className="border-0 shadow-md">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 border-b">
          <h3 className="font-bold text-lg text-gray-900">Actualizar Stock</h3>
        </CardHeader>

        <CardContent className="p-6">
          <form onSubmit={handleUpdateStock} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Producto */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Producto *
                </label>
                <select
                  value={selectedProductId || ''}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  disabled={updating}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                  required
                >
                  <option value="">Seleccionar producto...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Stock: {p.stock_quantity})
                    </option>
                  ))}
                </select>
              </div>

              {/* Operación */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Operación *
                </label>
                <select
                  value={operation}
                  onChange={(e) => setOperation(e.target.value as 'add' | 'subtract')}
                  disabled={updating}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                >
                  <option value="add">➕ Agregar Stock</option>
                  <option value="subtract">➖ Restar Stock</option>
                </select>
              </div>
            </div>

            {/* Cantidad */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Cantidad *
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={updating}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                placeholder="Ingresa la cantidad"
                min="1"
                required
              />
            </div>

            {/* Preview */}
            {selectedProduct && quantity && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">{selectedProduct.name}</span>
                  {' '}pasará de{' '}
                  <span className="font-bold text-blue-600">{selectedProduct.stock_quantity}</span>
                  {' '}a{' '}
                  <span className="font-bold text-green-600">
                    {operation === 'add'
                      ? selectedProduct.stock_quantity + parseInt(quantity)
                      : selectedProduct.stock_quantity - parseInt(quantity)}
                  </span>
                  {' '}unidades
                </p>
              </div>
            )}

            <Button
              type="submit"
              disabled={updating || !selectedProductId || !quantity}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {updating ? '⏳ Actualizando...' : `${operation === 'add' ? '➕' : '➖'} Actualizar Stock`}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Grid de productos */}
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-4">Stock Actual de Productos</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => {
            const isLowStock = product.stock_quantity <= product.min_stock_level;
            const isCritical = product.stock_quantity === 0;

            return (
              <Card
                key={product.id}
                className={`border-2 transition-all hover:shadow-md ${
                  isCritical
                    ? 'border-red-300 bg-red-50'
                    : isLowStock
                    ? 'border-orange-300 bg-orange-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-bold text-gray-900">{product.name}</h4>
                      <p className="text-xs text-gray-500">SKU: {product.sku}</p>
                    </div>
                    {isCritical && (
                      <Badge variant="destructive" className="text-xs">
                        CRÍTICO
                      </Badge>
                    )}
                    {isLowStock && !isCritical && (
                      <Badge variant="warning" className="text-xs">
                        BAJO
                      </Badge>
                    )}
                  </div>

                  <Divider className="my-3" />

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Stock Actual:</span>
                      <span
                        className={`text-2xl font-bold ${
                          isCritical
                            ? 'text-red-600'
                            : isLowStock
                            ? 'text-orange-600'
                            : 'text-green-600'
                        }`}
                      >
                        {product.stock_quantity}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Mínimo:</span>
                      <span className="font-semibold text-gray-900">{product.min_stock_level}</span>
                    </div>
                  </div>

                  <div className="mt-4 w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        isCritical
                          ? 'bg-red-500'
                          : isLowStock
                          ? 'bg-orange-500'
                          : 'bg-green-500'
                      }`}
                      style={{
                        width: `${Math.min(
                          (product.stock_quantity / product.min_stock_level) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};