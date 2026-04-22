import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Loader, X, AlertCircle } from 'lucide-react';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useFormState, useOfflineOperation } from '@/hooks/customHooks';
import { offlineSyncService } from '@/services/offlineSyncService';
import { Alert, StatusBadge, SyncingIndicator, Button, Input, Card, CardHeader, CardContent } from '@/components/ui/uiComponents';

interface Product {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface PurchaseFormData {
  purchaseNumber: string;
  supplier: string;
  purchaseDate: string;
  expectedDelivery: string;
  products: Product[];
  notes: string;
}

const INITIAL_STATE: PurchaseFormData = {
  purchaseNumber: '',
  supplier: '',
  purchaseDate: new Date().toISOString().split('T')[0],
  expectedDelivery: '',
  products: [],
  notes: ''
};

interface PurchaseFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const PurchaseForm: React.FC<PurchaseFormProps> = ({ isOpen, onClose, onSuccess }) => {
  const { isOnline, syncStatus: hookSyncStatus } = useOfflineSync();
  const isSyncing = hookSyncStatus.isSyncing;
  const { formData, handleChange, resetForm } = useFormState(INITIAL_STATE);
  const { saveOffline, isLoading } = useOfflineOperation();
  const [localMessage, setLocalMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [syncStatus, setSyncStatus] = useState({ pending: 0, lastSync: null as string | null });
  const [newProduct, setNewProduct] = useState({ name: '', quantity: 1, unitPrice: 0 });
  const [submitting, setSubmitting] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSyncStatus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOnline && syncStatus.pending > 0) {
      handleSync();
    }
  }, [isOnline]);

  const loadSyncStatus = async () => {
    try {
      const status = await offlineSyncService.getSyncStatus();
      if (isMountedRef.current) {
        setSyncStatus(status);
      }
    } catch (error) {
      console.error('Error loading sync status:', error);
    }
  };

  const handleSync = async () => {
    try {
      const result = await offlineSyncService.syncOperations();
      if (isMountedRef.current) {
        setLocalMessage({
          type: result.errors.length === 0 ? 'success' : 'info',
          text: `✅ ${result.synced} operación(es) sincronizada(s)`
        });
        await loadSyncStatus();
      }
    } catch (error) {
      if (isMountedRef.current) {
        setLocalMessage({ type: 'error', text: '❌ Error durante la sincronización' });
      }
    }
  };

  const handleAddProduct = () => {
    if (!newProduct.name.trim()) {
      setLocalMessage({ type: 'error', text: 'El nombre del producto es requerido' });
      return;
    }
    if (newProduct.quantity <= 0) {
      setLocalMessage({ type: 'error', text: 'La cantidad debe ser mayor a 0' });
      return;
    }
    if (newProduct.unitPrice <= 0) {
      setLocalMessage({ type: 'error', text: 'El precio unitario debe ser mayor a 0' });
      return;
    }

    const product: Product = {
      id: `${Date.now()}-${Math.random()}`,
      ...newProduct,
      total: newProduct.quantity * newProduct.unitPrice
    };

    formData.products.push(product);
    setNewProduct({ name: '', quantity: 1, unitPrice: 0 });
    setLocalMessage({ type: 'success', text: 'Producto agregado' });
    setTimeout(() => setLocalMessage(null), 2000);
  };

  const handleRemoveProduct = (id: string) => {
    formData.products = formData.products.filter(p => p.id !== id);
    setLocalMessage({ type: 'success', text: 'Producto removido' });
    setTimeout(() => setLocalMessage(null), 2000);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    handleChange({ target: { name, value } } as any);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSubmitting(true);

    try {
      if (!formData.purchaseNumber.trim()) {
        setLocalMessage({ type: 'error', text: 'El número de compra es requerido' });
        return;
      }
      if (!formData.supplier.trim()) {
        setLocalMessage({ type: 'error', text: 'El proveedor es requerido' });
        return;
      }
      if (formData.products.length === 0) {
        setLocalMessage({ type: 'error', text: 'Agrega al menos un producto' });
        return;
      }

      const totalAmount = formData.products.reduce((sum, p) => sum + p.total, 0);

      const success = await saveOffline('create', 'purchases', {
        ...formData,
        totalAmount
      });

      if (success && isMountedRef.current) {
        setLocalMessage({ type: 'success', text: 'Compra guardada exitosamente' });
        setTimeout(() => {
          resetForm();
          onSuccess();
          onClose();
        }, 1500);
        await loadSyncStatus();
      }
    } catch (error) {
      if (isMountedRef.current) {
        setLocalMessage({
          type: 'error',
          text: error instanceof Error ? error.message : 'Error al guardar la compra'
        });
      }
    } finally {
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const totalAmount = formData.products.reduce((sum, p) => sum + p.total, 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-lg bg-white/30 flex items-center justify-center z-50 p-8">
      <Card className="w-full max-w-4xl max-h-screen overflow-y-auto">
        <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white flex justify-between items-center">
          <h2 className="text-2xl font-bold">➕ Nueva Compra</h2>
          <button
            onClick={onClose}
            disabled={submitting || isLoading}
            className="text-white hover:bg-blue-800 p-2 rounded disabled:opacity-50"
          >
            <X size={24} />
          </button>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {localMessage && (
            <Alert
              type={localMessage.type}
              message={localMessage.text}
              onClose={() => setLocalMessage(null)}
            />
          )}

          {isSyncing && <SyncingIndicator isSyncing={isSyncing} />}

          <div className="flex items-center justify-between">
            <StatusBadge status={isOnline ? 'success' : 'warning'} label={isOnline ? `En línea${syncStatus.pending > 0 ? ` · ${syncStatus.pending} pendiente(s)` : ''}` : 'Sin conexión'} />
            {syncStatus.pending > 0 && (
              <Button onClick={handleSync} disabled={isSyncing} size="sm">
                {isSyncing ? <Loader className="w-4 h-4 animate-spin mr-2" /> : null}
                Sincronizar
              </Button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Información General */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Información General</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Número de Compra *
                  </label>
                  <Input
                    name="purchaseNumber"
                    placeholder="OC-001"
                    value={formData.purchaseNumber}
                    onChange={handleChange}
                    disabled={submitting}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Proveedor *
                  </label>
                  <Input
                    name="supplier"
                    placeholder="Nombre del proveedor"
                    value={formData.supplier}
                    onChange={handleChange}
                    disabled={submitting}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fecha de Compra
                  </label>
                  <Input
                    type="date"
                    name="purchaseDate"
                    value={formData.purchaseDate}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Entrega Esperada
                  </label>
                  <Input
                    type="date"
                    name="expectedDelivery"
                    value={formData.expectedDelivery}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                </div>
              </div>
            </div>

            {/* Productos */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-4">Productos</h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Producto *
                  </label>
                  <Input
                    placeholder="Nombre"
                    value={newProduct.name}
                    onChange={(e) =>
                      setNewProduct({ ...newProduct, name: e.target.value })
                    }
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Cantidad *
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={newProduct.quantity}
                    onChange={(e) =>
                      setNewProduct({
                        ...newProduct,
                        quantity: parseInt(e.target.value) || 1
                      })
                    }
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Precio Unit. *
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newProduct.unitPrice}
                    onChange={(e) =>
                      setNewProduct({
                        ...newProduct,
                        unitPrice: parseFloat(e.target.value) || 0
                      })
                    }
                    disabled={submitting}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    onClick={handleAddProduct}
                    disabled={submitting || !newProduct.name.trim()}
                    className="w-full"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar
                  </Button>
                </div>
              </div>

              {formData.products.length > 0 && (
                <div className="bg-gray-50 rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left">Producto</th>
                        <th className="px-4 py-2 text-right">Cantidad</th>
                        <th className="px-4 py-2 text-right">Precio Unit.</th>
                        <th className="px-4 py-2 text-right">Total</th>
                        <th className="px-4 py-2 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.products.map((p) => (
                        <tr key={p.id} className="border-b hover:bg-gray-100">
                          <td className="px-4 py-2">{p.name}</td>
                          <td className="px-4 py-2 text-right">{p.quantity}</td>
                          <td className="px-4 py-2 text-right">
                            ${p.unitPrice.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold">
                            ${p.total.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveProduct(p.id)}
                              disabled={submitting}
                              className="text-red-600 hover:text-red-900 disabled:opacity-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {formData.products.length === 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-2">
                  <AlertCircle className="text-yellow-600 flex-shrink-0" size={20} />
                  <p className="text-yellow-800">Agrega al menos un producto</p>
                </div>
              )}
            </div>

            {/* Notas */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notas
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleTextareaChange}
                placeholder="Notas adicionales sobre la compra..."
                disabled={submitting}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                rows={3}
              />
            </div>

            {/* Total */}
            <div className="bg-blue-50 p-4 rounded-lg flex justify-between items-center">
              <span className="font-semibold text-gray-900">Total:</span>
              <span className="text-3xl font-bold text-blue-600">
                ${totalAmount.toFixed(2)}
              </span>
            </div>
          </form>
        </CardContent>

        <div className="bg-gray-50 border-t border-gray-200 flex justify-end gap-3 p-6">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => handleSubmit()}
            disabled={submitting || isLoading || isSyncing}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {submitting ? (
              <>
                <Loader className="w-4 h-4 animate-spin mr-2" />
                Guardando...
              </>
            ) : (
              '💾 Guardar Compra'
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
};