import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Loader, X, AlertCircle, ChevronDown, Clock, WifiOff } from 'lucide-react';
import type { InventorySupplier } from '@/services/Inventory/inventorySuppliersService';
import { inventoryPurchasesService } from '@/services/Inventory/inventoryPurchasesService';
import { purchasesOfflineService } from '@/services/Inventory/purchasesOfflineService';
import { cacheSet, cacheGet, cacheKey } from '@/utils/offlineCache';
import { useAuth } from '@/context/AuthContext';
import { useTenantId } from '@/hooks/useTenant';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/types/Types_POS';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineItem {
  rowId: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface PurchaseFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const PurchaseForm: React.FC<PurchaseFormProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const { tenantId: resolvedTenantId } = useTenantId();
  const isMountedRef = useRef(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Form fields
  const [purchaseNumber, setPurchaseNumber] = useState('');
  const [supplierId, setSupplierId]         = useState('');
  const [purchaseDate, setPurchaseDate]     = useState(new Date().toISOString().slice(0, 10));
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes]                   = useState('');
  const [items, setItems]                   = useState<LineItem[]>([]);

  // Lookup data
  const [suppliers, setSuppliers]   = useState<InventorySupplier[]>([]);
  const [products, setProducts]     = useState<Product[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Add-item row
  const [newProductId, setNewProductId]   = useState('');
  const [newQuantity, setNewQuantity]     = useState(1);
  const [newUnitPrice, setNewUnitPrice]   = useState('');

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    const onOnline  = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Use resolvedTenantId (works for staff) with fallback to user.tenant_id
  const tenantId = resolvedTenantId ?? user?.tenant_id ?? null;

  useEffect(() => {
    if (!isOpen || !tenantId) return;
    loadData(tenantId);
    autoNumber(tenantId);
  }, [isOpen, tenantId]);

  const loadData = async (tid: string) => {
    setLoadingData(true);
    setError('');
    try {
      if (navigator.onLine) {
        const [suppRes, prodRes] = await Promise.all([
          supabase.from('suppliers').select('id, name, payment_terms').eq('tenant_id', tid).order('name'),
          supabase.from('products').select('id, name, sku, unit_price, cost_price').eq('tenant_id', tid).order('name'),
        ]);
        if (suppRes.error) throw suppRes.error;
        if (prodRes.error) throw prodRes.error;
        const supps = (suppRes.data ?? []) as unknown as InventorySupplier[];
        const prods = (prodRes.data ?? []) as unknown as Product[];
        setSuppliers(supps);
        setProducts(prods);
        // Cache for offline use — both IndexedDB and localStorage
        purchasesOfflineService.cacheSuppliers(tid, supps).catch(() => {});
        purchasesOfflineService.cacheProducts(tid, prods).catch(() => {});
        cacheSet(cacheKey(tid, 'suppliers_list'), supps);
        cacheSet(cacheKey(tid, 'products_list'), prods);
      } else {
        // Try IndexedDB first, then localStorage as fallback
        let [supps, prods] = await Promise.all([
          purchasesOfflineService.getCachedSuppliers(tid),
          purchasesOfflineService.getCachedProducts(tid),
        ]);
        if (supps.length === 0) supps = cacheGet<InventorySupplier[]>(cacheKey(tid, 'suppliers_list')) ?? [];
        if (prods.length === 0) prods = cacheGet<Product[]>(cacheKey(tid, 'products_list')) ?? [];
        setSuppliers(supps as InventorySupplier[]);
        setProducts(prods as Product[]);
        if (supps.length === 0 && prods.length === 0) {
          setError('Sin conexión y sin datos en caché. Conecta internet para crear una compra.');
        }
      }
    } catch (err) {
      // Network failed — try both caches
      try {
        let [supps, prods] = await Promise.all([
          purchasesOfflineService.getCachedSuppliers(tid),
          purchasesOfflineService.getCachedProducts(tid),
        ]);
        if (supps.length === 0) supps = cacheGet<InventorySupplier[]>(cacheKey(tid, 'suppliers_list')) ?? [];
        if (prods.length === 0) prods = cacheGet<Product[]>(cacheKey(tid, 'products_list')) ?? [];
        setSuppliers(supps as InventorySupplier[]);
        setProducts(prods as Product[]);
      } catch {
        setError((err as any)?.message ?? 'Error al cargar datos');
      }
    } finally {
      setLoadingData(false);
    }
  };

  const autoNumber = async (tid: string) => {
    try {
      if (navigator.onLine) {
        const num = await inventoryPurchasesService.generatePurchaseNumber(tid);
        if (isMountedRef.current) setPurchaseNumber(num);
      } else {
        const pending = await purchasesOfflineService.getPendingCreates(tid);
        if (isMountedRef.current) setPurchaseNumber(`PO-BORRADOR-${pending.length + 1}`);
      }
    } catch {
      const pending = await purchasesOfflineService.getPendingCreates(tid).catch(() => []);
      if (isMountedRef.current) setPurchaseNumber(`PO-BORRADOR-${pending.length + 1}`);
    }
  };

  const selectedSupplier = suppliers.find(s => s.id === supplierId) ?? null;

  // Pre-fill with cost_price (what we pay the supplier), not unit_price (what we sell)
  const handleProductSelect = (pid: string) => {
    setNewProductId(pid);
    const prod = products.find(p => p.id === pid);
    if (prod) setNewUnitPrice(String(prod.cost_price ?? ''));
  };

  const handleAddItem = () => {
    if (!newProductId) { setError('Selecciona un producto'); return; }
    if (newQuantity <= 0) { setError('La cantidad debe ser mayor a 0'); return; }
    const price = parseFloat(newUnitPrice);
    if (!price || price <= 0) { setError('El precio debe ser mayor a 0'); return; }
    const prod = products.find(p => p.id === newProductId)!;
    setItems(prev => [...prev, {
      rowId: `${Date.now()}-${Math.random()}`,
      product_id: prod.id,
      product_name: prod.name,
      quantity: newQuantity,
      unit_price: price,
      total: newQuantity * price,
    }]);
    setNewProductId('');
    setNewQuantity(1);
    setNewUnitPrice('');
    setError('');
  };

  const handleRemoveItem = (rowId: string) => setItems(prev => prev.filter(i => i.rowId !== rowId));

  const totalAmount = items.reduce((s, i) => s + i.total, 0);

  const handleSubmit = async () => {
    setError('');
    if (!tenantId)        { setError('Usuario no autenticado'); return; }
    if (!supplierId)      { setError('Selecciona un proveedor'); return; }
    if (items.length === 0) { setError('Agrega al menos un producto'); return; }

    // Ensure we have a purchase number (generate on-the-fly if autoNumber failed)
    let num = purchaseNumber.trim();
    if (!num) {
      num = await inventoryPurchasesService.generatePurchaseNumber(tenantId);
      setPurchaseNumber(num);
    }

    setSubmitting(true);
    try {
      if (!navigator.onLine) {
        // Queue for offline sync
        const supplier = suppliers.find(s => s.id === supplierId);
        await purchasesOfflineService.queueCreate({
          tenantId,
          purchaseData: {
            supplier_id:            supplierId,
            supplier_name:          supplier?.name ?? '—',
            purchase_number:        num,
            purchase_date:          purchaseDate,
            expected_delivery_date: expectedDelivery || null,
            total_amount:           totalAmount,
            notes:                  notes || null,
          },
          items: items.map(i => ({
            product_id:   i.product_id,
            product_name: i.product_name,
            quantity:     i.quantity,
            unit_price:   i.unit_price,
            subtotal:     i.total,
          })),
        });
      } else {
        const purchase = await inventoryPurchasesService.createPurchase(tenantId, {
          supplier_id:            supplierId,
          purchase_number:        num,
          purchase_date:          purchaseDate,
          expected_delivery_date: expectedDelivery || null,
          actual_delivery_date:   null,
          status:                 'pending',
          total_amount:           totalAmount,
          notes:                  notes || null,
        });
        if (purchase?.id) {
          await inventoryPurchasesService.addPurchaseItems(
            purchase.id,
            items.map(i => ({
              product_id: i.product_id,
              quantity:   i.quantity,
              unit_price: i.unit_price,
              subtotal:   i.total,
            }))
          );
        }
      }

      onSuccess();
      handleClose();
    } catch (err) {
      const msg = (err as any)?.message ?? String(err) ?? 'Error al guardar la compra';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setPurchaseNumber('');
    setSupplierId('');
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setExpectedDelivery('');
    setNotes('');
    setItems([]);
    setNewProductId('');
    setNewQuantity(1);
    setNewUnitPrice('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-lg bg-white/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-4xl max-h-[95vh] overflow-y-auto rounded-2xl shadow-2xl flex flex-col">

        {/* Header */}
        <div className="bg-linear-to-r from-blue-600 to-blue-700 px-6 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white">Nueva Compra</h2>
            {isOffline && (
              <span className="flex items-center gap-1 text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full">
                <WifiOff size={10} /> offline
              </span>
            )}
          </div>
          <button onClick={handleClose} disabled={submitting} className="text-white hover:bg-white/20 p-2 rounded-lg transition disabled:opacity-50">
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 flex-1">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex justify-between">
              <span>{error}</span>
              <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-3">✕</button>
            </div>
          )}

          {/* General info */}
          <div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Información General</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Purchase number — auto-generated, read-only */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Número de Compra
                  <span className="ml-2 text-xs font-normal text-gray-400">automático</span>
                </label>
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                  <span className="font-mono font-bold text-gray-700 flex-1">
                    {purchaseNumber || <span className="text-gray-400 font-normal">Generando...</span>}
                  </span>
                  <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">Auto</span>
                </div>
              </div>

              {/* Supplier dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Proveedor *</label>
                <div className="relative">
                  <select
                    value={supplierId}
                    onChange={e => setSupplierId(e.target.value)}
                    disabled={submitting || loadingData}
                    className="w-full px-4 py-2 pr-9 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 bg-white appearance-none"
                  >
                    <option value="">{loadingData ? 'Cargando...' : 'Seleccionar proveedor'}</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                {selectedSupplier?.payment_terms && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5">
                    <Clock size={11} />
                    <span>Plazo: <strong>{selectedSupplier.payment_terms}</strong></span>
                  </div>
                )}
              </div>

              {/* Dates */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Fecha de Compra</label>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={e => setPurchaseDate(e.target.value)}
                  disabled={submitting}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Entrega Esperada</label>
                <input
                  type="date"
                  value={expectedDelivery}
                  onChange={e => setExpectedDelivery(e.target.value)}
                  disabled={submitting}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>
            </div>
          </div>

          {/* Products */}
          <div className="border-t pt-5">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Productos</h3>

            {/* Add row */}
            <div className="grid grid-cols-12 gap-2 mb-3 items-end">
              <div className="col-span-5">
                <label className="block text-xs font-medium text-gray-600 mb-1">Producto *</label>
                <div className="relative">
                  <select
                    value={newProductId}
                    onChange={e => handleProductSelect(e.target.value)}
                    disabled={submitting || loadingData}
                    className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 bg-white appearance-none"
                  >
                    <option value="">{loadingData ? 'Cargando...' : 'Seleccionar producto'}</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad *</label>
                <input
                  type="number" min="1"
                  value={newQuantity}
                  onChange={e => setNewQuantity(parseInt(e.target.value) || 1)}
                  disabled={submitting}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Precio Unit. *</label>
                <input
                  type="number" step="0.01" min="0"
                  value={newUnitPrice}
                  onChange={e => setNewUnitPrice(e.target.value)}
                  placeholder="0.00"
                  disabled={submitting}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>
              <div className="col-span-2">
                <button
                  type="button"
                  onClick={handleAddItem}
                  disabled={submitting || !newProductId}
                  className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-lg transition"
                >
                  <Plus size={15} /> Agregar
                </button>
              </div>
            </div>

            {/* Items table */}
            {items.length > 0 ? (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Producto</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Cant.</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Precio Unit.</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Total</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map(item => (
                      <tr key={item.rowId} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{item.product_name}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{item.quantity}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">₡{item.unit_price.toLocaleString('es-CR')}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-900">₡{item.total.toLocaleString('es-CR')}</td>
                        <td className="px-4 py-2.5 text-center">
                          <button onClick={() => handleRemoveItem(item.rowId)} disabled={submitting} className="text-red-400 hover:text-red-600 disabled:opacity-40">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="border border-dashed border-yellow-300 bg-yellow-50 rounded-xl p-4 flex gap-2 items-center">
                <AlertCircle size={18} className="text-yellow-500 shrink-0" />
                <p className="text-sm text-yellow-800">Agrega al menos un producto para continuar</p>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notas</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notas adicionales..."
              disabled={submitting}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 resize-none"
            />
          </div>

          {/* Total */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 flex justify-between items-center">
            <span className="font-semibold text-gray-700">Total de la compra</span>
            <span className="text-2xl font-black text-blue-700">₡{totalAmount.toLocaleString('es-CR')}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 flex justify-end gap-3 shrink-0 bg-gray-50 rounded-b-2xl">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="px-5 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || items.length === 0 || !supplierId}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-400 text-white font-semibold rounded-lg transition"
          >
            {submitting
              ? <><Loader size={16} className="animate-spin" /> Guardando...</>
              : isOffline
                ? <><WifiOff size={16} /> Guardar (offline)</>
                : '💾 Guardar Compra'
            }
          </button>
        </div>
      </div>
    </div>
  );
};
