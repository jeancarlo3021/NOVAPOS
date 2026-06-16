'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ShoppingCart, Plus, Search, RefreshCw, Truck,
  CheckCircle2, Clock, XCircle, DollarSign, Eye,
  ChevronDown, Calendar, Filter, Package, ClipboardCheck,
  Loader, Printer,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTenantId } from '@/hooks/useTenant';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { inventoryPurchasesService } from '@/services/Inventory/inventoryPurchasesService';
import { inventorySuppliersService } from '@/services/Inventory/inventorySuppliersService';
import { getAllProducts } from '@/services/Inventory/InventoryProductsService';
import { purchasesOfflineService } from '@/services/Inventory/purchasesOfflineService';
import { PurchaseForm } from '@/modules/inventory/purchases/PurchaseForm';
import { PurchaseDetailModal } from '@/modules/inventory/purchases/PurchaseDetailModal';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { OfflineBanner } from './components/OfflineBanner';
import { KPICard } from './components/KPICard';
import { StatusBadge } from './components/StatusBadge';
import { ReceiveReviewModal } from './components/ReceiveReviewModal';
import { Status, fmt, fmtDate } from './components/types';

// ── Main dashboard ────────────────────────────────────────────────────────────

export const PurchasesDashboard: React.FC = () => {
  const { user, planFeatures } = useAuth();
  const { tenantId }           = useTenantId();
  const { canDo } = useRolePermissions();
  const canCreate = canDo('purchases', 'create');

  const canUpdateStock = planFeatures.inventory === true && !(planFeatures as any).inventory_products_only;

  const [purchases, setPurchases]           = useState<any[]>([]);
  const [suppliers, setSuppliers]           = useState<any[]>([]);
  const [loading, setLoading]               = useState(true);
  const [fromCache, setFromCache]           = useState(false);
  const [isOnline, setIsOnline]             = useState(navigator.onLine);
  const [pendingCount, setPendingCount]     = useState(0);
  const [syncing, setSyncing]               = useState(false);
  const [syncResult, setSyncResult]         = useState<{ synced: number; errors: Array<{ op: string; message: string }> } | null>(null);
  const [showForm, setShowForm]             = useState(false);
  const [search, setSearch]                 = useState('');
  const [filterStatus, setFilterStatus]     = useState<Status | ''>('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [actionLoading, setActionLoading]   = useState<string | null>(null);
  const [printingId, setPrintingId]         = useState<string | null>(null);
  const [detailPurchase, setDetailPurchase] = useState<any | null>(null);
  const [reviewPurchase, setReviewPurchase] = useState<any | null>(null);
  const [error, setError]                   = useState('');
  const syncRef = useRef(false);

  const loadPurchases = useCallback(async (tid: string, silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      if (navigator.onLine) {
        const data = await inventoryPurchasesService.getAllPurchases(tid);
        await purchasesOfflineService.cachePurchases(tid, data);
        setPurchases(data);
        setFromCache(false);
      } else {
        const merged = await purchasesOfflineService.getMergedPurchases(tid);
        setPurchases(merged);
        setFromCache(true);
      }
    } catch {
      const merged = await purchasesOfflineService.getMergedPurchases(tid);
      setPurchases(merged);
      setFromCache(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadSuppliers = useCallback(async (tid: string) => {
    try {
      if (navigator.onLine) {
        const data = await inventorySuppliersService.getAllSuppliers(tid);
        await purchasesOfflineService.cacheSuppliers(tid, data);
        setSuppliers(data);
      } else {
        setSuppliers(await purchasesOfflineService.getCachedSuppliers(tid));
      }
    } catch {
      setSuppliers(await purchasesOfflineService.getCachedSuppliers(tid));
    }
  }, []);

  const refreshPendingCount = useCallback(async (tid: string) => {
    const count = await purchasesOfflineService.getPendingCount(tid);
    setPendingCount(count);
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    loadPurchases(tenantId);
    loadSuppliers(tenantId);
    refreshPendingCount(tenantId);
  }, [tenantId]);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      if (!tenantId || syncRef.current) return;
      const count = await purchasesOfflineService.getPendingCount(tenantId);
      if (count > 0) handleSync();
      else loadPurchases(tenantId, true);
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [tenantId]);

  const handleSync = useCallback(async () => {
    if (!tenantId || syncRef.current) return;
    syncRef.current = true;
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await purchasesOfflineService.syncAll(tenantId);
      setSyncResult(result);
      await loadPurchases(tenantId);
      await refreshPendingCount(tenantId);
    } finally {
      setSyncing(false);
      syncRef.current = false;
    }
  }, [tenantId, loadPurchases, refreshPendingCount]);

  const retry = useCallback(() => {
    if (tenantId) loadPurchases(tenantId);
  }, [tenantId, loadPurchases]);

  const filtered = purchases.filter(p => {
    const supplierName: string = (p.supplier as any)?.name ?? '';
    const matchSearch   = !search.trim() || p.purchase_number?.toLowerCase().includes(search.toLowerCase()) || supplierName.toLowerCase().includes(search.toLowerCase());
    const matchStatus   = !filterStatus   || p.status === filterStatus;
    const matchSupplier = !filterSupplier || p.supplier_id === filterSupplier;
    return matchSearch && matchStatus && matchSupplier;
  });

  const realPurchases = purchases.filter((p: any) => !p.__local);
  const totalAmount   = realPurchases.reduce((s, p) => s + (p.total_amount ?? 0), 0);
  const totalPending  = purchases.filter(p => p.status === 'pending').length;
  const totalReceived = purchases.filter(p => p.status === 'received').length;

  const handlePrintRow = useCallback(async (p: any) => {
    if ((p as any).__local) { setError('No se puede imprimir una orden que aún no fue sincronizada'); return; }
    const tid = tenantId ?? user?.tenant_id ?? '';
    setPrintingId(p.id);
    setError('');
    try {
      // 1. Si no hay items cargados, recargar el purchase completo
      let fullPurchase = p;
      const hasItems = Array.isArray(p.purchase_items) || Array.isArray(p.items);
      if (!hasItems && p.id && !(p as any).__local) {
        try {
          fullPurchase = await inventoryPurchasesService.getPurchaseById(p.id);
        } catch {}
      }

      // 2. Obtener items del campo correcto (purchase_items o items)
      const rawItems = Array.isArray(fullPurchase.purchase_items)
        ? fullPurchase.purchase_items
        : Array.isArray(fullPurchase.items)
        ? fullPurchase.items
        : [];

      // 3. Cargar productos para mapear ID → nombre
      const productMap = new Map<string, string>();
      try {
        const products = await getAllProducts(tid ?? null);
        products.forEach((prod: any) => {
          if (prod?.id && prod?.name) productMap.set(prod.id, prod.name);
        });
      } catch {}

      await posPrinterService.printPurchaseOrder({
        purchase_number:        fullPurchase.purchase_number,
        purchase_date:          fullPurchase.purchase_date,
        expected_delivery_date: fullPurchase.expected_delivery_date,
        supplier_name:          (fullPurchase.supplier as any)?.name
                                ?? (fullPurchase.suppliers as any)?.name
                                ?? '—',
        supplier_phone:         (fullPurchase.supplier as any)?.phone
                                ?? (fullPurchase.suppliers as any)?.phone
                                ?? null,
        items: rawItems.map((it: any) => ({
          product_name:
            it.product_name
            ?? it.product?.name
            ?? productMap.get(it.product_id)
            ?? 'Producto sin nombre',
          quantity:     Number(it.quantity ?? it.received_quantity ?? 0),
          unit_price:   Number(it.unit_price ?? 0),
          subtotal:     Number(it.subtotal ?? (Number(it.quantity ?? 0) * Number(it.unit_price ?? 0))),
        })),
        total_amount: fullPurchase.total_amount ?? 0,
        notes: fullPurchase.notes,
      }, tid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al imprimir');
    } finally {
      setPrintingId(null);
    }
  }, [tenantId, user]);

  const handleCancel = useCallback(async (p: any) => {
    if (!confirm('¿Cancelar esta orden de compra?')) return;
    setActionLoading(p.id);
    setError('');
    try {
      if ((p as any).__local) {
        // Remove from pending_creates
        await purchasesOfflineService.removePendingCreate((p as any).__localId);
      } else if (!navigator.onLine) {
        await purchasesOfflineService.queueCancel(p.id, tenantId!);
      } else {
        await inventoryPurchasesService.updatePurchaseStatus(p.id, 'cancelled');
      }
      if (tenantId) {
        await loadPurchases(tenantId);
        await refreshPendingCount(tenantId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cancelar');
    } finally {
      setActionLoading(null);
    }
  }, [tenantId, loadPurchases, refreshPendingCount]);

  return (
    <div className="space-y-0 max-w-7xl mx-auto">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-5 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <ShoppingCart size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900">Órdenes de Compra</h1>
              <p className="text-gray-400 text-sm">
                {purchases.length} orden{purchases.length !== 1 ? 'es' : ''}
                {fromCache && <span className="ml-2 text-orange-500 text-xs">· desde caché</span>}
              </p>
            </div>
          </div>
          {canCreate && (
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-sm">
              <Plus size={18} /> Nueva Orden
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* Offline banner */}
        {(!isOnline || pendingCount > 0) && (
          <OfflineBanner
            pendingCount={pendingCount}
            syncing={syncing}
            onSync={handleSync}
            syncResult={syncResult}
          />
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex justify-between">
            {error}
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard icon={ShoppingCart} label="Total órdenes" value={String(purchases.length)}  color="bg-blue-500" />
          <KPICard icon={Clock}        label="Pendientes"    value={String(totalPending)}       color="bg-amber-500" />
          <KPICard icon={CheckCircle2} label="Recibidas"     value={String(totalReceived)}      color="bg-emerald-500" />
          <KPICard icon={DollarSign}   label="Monto total"   value={fmt(totalAmount)}           color="bg-violet-500" />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por número o proveedor..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="relative">
              <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as Status | '')}
                className="pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">Todos los estados</option>
                <option value="pending">Pendiente</option>
                <option value="received">Recibida</option>
                <option value="cancelled">Cancelada</option>
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <Truck size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
                className="pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">Todos los proveedores</option>
                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <button onClick={retry} disabled={loading}
              className="p-2 border border-gray-200 rounded-xl hover:border-blue-300 text-gray-500 hover:text-blue-600 transition">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 gap-2 text-sm">
              <RefreshCw size={18} className="animate-spin" /> Cargando órdenes...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
                <Package size={28} className="text-gray-300" />
              </div>
              <p className="text-gray-500 font-semibold">
                {search || filterStatus || filterSupplier ? 'Sin resultados' : 'No hay órdenes de compra'}
              </p>
              {!search && !filterStatus && !filterSupplier && (
                <button onClick={() => setShowForm(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition mt-1">
                  <Plus size={15} /> Crear primera orden
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Orden</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Proveedor</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase"><div className="flex items-center gap-1"><Calendar size={12} /> Fecha</div></th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Entrega</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase">Total</th>
                    <th className="text-center px-5 py-3 text-xs font-bold text-gray-500 uppercase">Estado</th>
                    <th className="text-center px-5 py-3 text-xs font-bold text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(p => {
                    const supplierName = (p.supplier as any)?.name ?? '—';
                    const busy         = actionLoading === p.id;
                    const isLocal      = !!(p as any).__local;
                    const pendingSync  = !!(p as any).__pendingSync;
                    return (
                      <tr key={p.id} className={`hover:bg-gray-50/70 transition ${isLocal ? 'bg-orange-50/30' : ''}`}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-gray-800">{p.purchase_number}</span>
                            {isLocal && (
                              <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full font-semibold">
                                local
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                              <Truck size={13} className="text-blue-600" />
                            </div>
                            <span className="font-medium text-gray-800 truncate max-w-36">{supplierName}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-gray-500">{fmtDate(p.purchase_date)}</td>
                        <td className="px-5 py-4 text-gray-500">{fmtDate(p.expected_delivery_date)}</td>
                        <td className="px-5 py-4 text-right font-black text-gray-900">{fmt(p.total_amount)}</td>
                        <td className="px-5 py-4 text-center">
                          <StatusBadge status={p.status as Status} pendingSync={pendingSync} />
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-center gap-1.5">
                            {!isLocal && (
                              <button onClick={() => setDetailPurchase(p)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Ver detalle">
                                <Eye size={15} />
                              </button>
                            )}
                            {!isLocal && (
                              <button onClick={() => handlePrintRow(p)} disabled={printingId === p.id}
                                className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 disabled:opacity-40 rounded-lg transition" title="Imprimir">
                                {printingId === p.id ? <Loader size={15} className="animate-spin" /> : <Printer size={15} />}
                              </button>
                            )}
                            {p.status === 'pending' && !isLocal && (
                              <button onClick={() => setReviewPurchase(p)} disabled={busy}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100 disabled:opacity-40 transition">
                                {busy ? <RefreshCw size={11} className="animate-spin" /> : <ClipboardCheck size={11} />}
                                Revisar y Recibir
                              </button>
                            )}
                            {p.status === 'pending' && (
                              <button onClick={() => handleCancel(p)} disabled={busy}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100 disabled:opacity-40 transition">
                                <XCircle size={11} /> {isLocal ? 'Eliminar' : 'Cancelar'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && filtered.length > 0 && (
          <p className="text-xs text-gray-400 text-center">
            Mostrando {filtered.length} de {purchases.length} órdenes
          </p>
        )}
      </div>

      {/* New Order Modal */}
      <PurchaseForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onSuccess={async () => {
          if (tenantId) {
            await loadPurchases(tenantId);
            await refreshPendingCount(tenantId);
          }
        }}
      />

      {/* Detail Modal */}
      {detailPurchase && (
        <PurchaseDetailModal
          purchaseId={detailPurchase.id}
          onClose={() => setDetailPurchase(null)}
        />
      )}

      {/* Receive Review Modal */}
      {reviewPurchase && tenantId && (
        <ReceiveReviewModal
          purchase={reviewPurchase}
          tenantId={tenantId}
          canUpdateStock={canUpdateStock}
          onClose={() => setReviewPurchase(null)}
          onConfirmed={async () => {
            setReviewPurchase(null);
            await loadPurchases(tenantId);
            await refreshPendingCount(tenantId);
            // Refrescar el cache del inventario: la recepción sumó stock en la
            // BD; re-cacheamos para que el inventario y el POS muestren el nuevo.
            try {
              const fresh = await getAllProducts(tenantId);
              const { cacheSet, cacheKey } = await import('@/utils/offlineCache');
              cacheSet(cacheKey(tenantId, 'global_products'), fresh);
              // Avisar a otras vistas (inventario/POS) que el stock cambió.
              window.dispatchEvent(new CustomEvent('inventory-updated'));
            } catch (e) {
              console.warn('[purchases] no se pudo refrescar inventario:', e);
            }
          }}
        />
      )}
    </div>
  );
};
