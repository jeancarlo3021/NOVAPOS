import React, { useState } from 'react';
import { Plus, Search, RotateCw, FileSpreadsheet, Tag, Printer, X } from 'lucide-react';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useTenantId } from '@/hooks/useTenant';
import { useAuth } from '@/context/AuthContext';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { inventoryProductsService } from '@/services/Inventory/InventoryProductsService';
import { useInventoryProducts } from '@/hooks/useInventoryProducts';
import { ProductForm } from './ProductsForm';
import { ProductCard } from './ProductCard';
import { BulkProductImportModal } from './BulkProductImportModal';
import { BulkPrintLabelsModal } from '@/modules/labels/BulkPrintLabelsModal';
import { Alert, LoadingState, Badge, Button, Card, CardContent } from '@/components/ui/uiComponents';

export const ProductsList: React.FC = () => {
  const { tenantId } = useTenantId();
  const { planFeatures, isReadOnly } = useAuth();
  const { canDo } = useRolePermissions();
  const canCreate = canDo('inventory', 'create');
  const canEdit   = canDo('inventory', 'edit');
  const canDelete = canDo('inventory', 'delete');
  const { isOnline } = useOfflineSync();
  const hasStockAlerts = planFeatures.inventory && !(planFeatures as any).inventory_products_only;
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Impresión masiva de etiquetas
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPrintLabels, setShowPrintLabels] = useState(false);
  const canLabels = !!planFeatures?.labels;

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };

  const {
    products,
    loading,
    refreshing,
    error,
    fromCache,
    refresh: retry,
  } = useInventoryProducts(tenantId);

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este producto?')) return;

    setDeleteError(null);

    try {
      await inventoryProductsService.deleteProduct(id);
      await retry();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al eliminar';
      setDeleteError(errorMsg);
      setTimeout(() => setDeleteError(null), 5000);
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Productos con stock infinito (tracks_stock=false) NO entran a las alertas:
  // su stock_quantity siempre es 0/N/A y no debería marcarse como "crítico".
  const trackedProducts = filteredProducts.filter(p => (p as any).tracks_stock !== false);
  const lowStockProducts = trackedProducts.filter(
    p => p.stock_quantity < (p.min_stock_level ?? 0)
  );
  const criticalStockProducts = trackedProducts.filter(
    p => p.stock_quantity < ((p.min_stock_level ?? 0) * 0.5)
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Productos</h1>
          <p className="text-gray-600">Administra tu inventario de productos</p>
        </div>
        <div className="flex gap-2">
          {canLabels && !selectMode && (
            <Button
              onClick={() => setSelectMode(true)}
              size="lg"
              variant="secondary"
              className="bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 border border-fuchsia-200"
              disabled={loading}
            >
              <Tag className="w-5 h-5 mr-2" /> Etiquetas
            </Button>
          )}
          {!isReadOnly && canCreate && (
            <>
              <Button
                onClick={() => setShowBulk(true)}
                size="lg"
                variant="secondary"
                className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                disabled={loading}
              >
                <FileSpreadsheet className="w-5 h-5 mr-2" /> Importar Excel
              </Button>
              <Button
                onClick={() => { setEditingId(null); setShowForm(true); }}
                size="lg"
                className="bg-blue-600 hover:bg-blue-700"
                disabled={loading}
              >
                <Plus className="w-5 h-5 mr-2" /> Nuevo Producto
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Estado de conexión */}
      <Badge variant={isOnline ? 'success' : 'warning'}>
        {isOnline ? 'En línea' : 'Sin conexión'}
      </Badge>

      {/* Barra de selección para etiquetas */}
      {selectMode && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 bg-fuchsia-600 text-white rounded-xl px-4 py-3 shadow-lg">
          <span className="font-bold text-sm">{selectedIds.size} seleccionado{selectedIds.size === 1 ? '' : 's'}</span>
          <button onClick={() => setSelectedIds(new Set(filteredProducts.map(p => p.id)))}
            className="text-xs font-bold bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5">Seleccionar todos ({filteredProducts.length})</button>
          <button onClick={() => setSelectedIds(new Set())}
            className="text-xs font-bold bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5">Limpiar</button>
          <div className="flex-1" />
          <button onClick={() => setShowPrintLabels(true)} disabled={selectedIds.size === 0}
            className="flex items-center gap-1.5 text-sm font-bold bg-white text-fuchsia-700 rounded-lg px-4 py-1.5 disabled:opacity-50">
            <Printer size={15} /> Imprimir etiquetas
          </button>
          <button onClick={exitSelectMode} className="p-1.5 rounded-lg hover:bg-white/20"><X size={18} /></button>
        </div>
      )}

      {/* Modal de Formulario */}
      {showForm && (
        <ProductForm
          productId={editingId}
          onSuccess={() => {
            setShowForm(false);
            setEditingId(null);
            retry();
          }}
          onCancel={() => { setShowForm(false); setEditingId(null); }}
        />
      )}

      {/* Modal de importación masiva */}
      {showBulk && tenantId && (
        <BulkProductImportModal
          tenantId={tenantId}
          onClose={() => setShowBulk(false)}
          onDone={(count) => {
            setShowBulk(false);
            if (count > 0) retry();
          }}
        />
      )}

      {/* Modal de impresión masiva de etiquetas */}
      {showPrintLabels && tenantId && (
        <BulkPrintLabelsModal
          tenantId={tenantId}
          products={products
            .filter(p => selectedIds.has(p.id))
            .map(p => ({
              name: p.name,
              price: p.unit_price,
              sku: p.sku || '',
              sku2: (p as any).sku2 || '',
            }))}
          onClose={() => setShowPrintLabels(false)}
        />
      )}

      {/* Alertas */}
      {deleteError && (
        <Alert type="error" message={`❌ ${deleteError}`} />
      )}

      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex justify-between items-center">
          <span className="text-red-800">🚨 {error}</span>
          <Button
            onClick={retry}
            size="sm"
            className="bg-red-600 hover:bg-red-700 flex items-center gap-2"
          >
            <RotateCw size={16} /> Reintentar
          </Button>
        </div>
      )}

      {hasStockAlerts && criticalStockProducts.length > 0 && (
        <Alert type="error" message={`🚨 ${criticalStockProducts.length} producto(s) con stock CRÍTICO`} />
      )}
      {hasStockAlerts && lowStockProducts.length > 0 && criticalStockProducts.length === 0 && (
        <Alert type="warning" message={`⚠️ ${lowStockProducts.length} producto(s) con stock bajo`} />
      )}

      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3 top-3 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Buscar por nombre o SKU..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          disabled={loading}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
        />
      </div>

      {/* Contenido Principal */}
      {loading ? (
        <LoadingState message="Cargando productos..." />
      ) : filteredProducts.length > 0 ? (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-600 flex items-center gap-2">
              Mostrando {filteredProducts.length} de {products.length} productos
              {refreshing && (
                <span className="inline-flex items-center gap-1 text-xs text-blue-500 font-medium">
                  <RotateCw size={11} className="animate-spin" /> Actualizando…
                </span>
              )}
              {fromCache && !refreshing && (
                <span className="text-xs text-gray-400 italic">desde caché</span>
              )}
            </p>
            <Button
              onClick={retry}
              size="sm"
              variant="secondary"
              className="flex items-center gap-2"
              disabled={refreshing}
            >
              <RotateCw size={16} className={refreshing ? 'animate-spin' : ''} /> Actualizar
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onEdit={(selectMode || isReadOnly || !canEdit) ? undefined : () => { setEditingId(product.id); setShowForm(true); }}
                onDelete={(selectMode || isReadOnly || !canDelete) ? undefined : () => handleDelete(product.id)}
                onUpdated={() => retry()}
                selectable={selectMode}
                selected={selectedIds.has(product.id)}
                onToggleSelect={() => toggleSelect(product.id)}
              />
            ))}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-500 text-lg">
              {searchTerm ? 'No hay productos que coincidan con tu búsqueda' : 'No hay productos registrados'}
            </p>
            {!searchTerm && !isReadOnly && canCreate && (
              <Button
                onClick={() => { setEditingId(null); setShowForm(true); }}
                className="mt-4 bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-5 h-5 mr-2" /> Crear Primer Producto
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};