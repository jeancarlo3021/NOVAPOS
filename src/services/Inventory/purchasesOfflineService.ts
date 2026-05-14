import { supabase } from '@/lib/supabase';
import { inventoryPurchasesService } from './inventoryPurchasesService';
import {
  accountsPayableService,
  termsToDays,
  calcDueDate,
} from '@/services/accountsPayable/accountsPayableService';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PendingPurchaseCreate {
  localId?: number;
  tenantId: string;
  purchaseData: {
    supplier_id: string;
    supplier_name: string;
    purchase_number: string;
    purchase_date: string;
    expected_delivery_date: string | null;
    total_amount: number;
    notes: string | null;
  };
  items: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
  createdAt: string;
}

export interface PendingReceive {
  purchaseId: string; // keyPath
  tenantId: string;
  items: Array<{
    id: string;
    product_id: string;
    qty_received: number;
    price_received: number;
  }>;
  notes: string;
  canUpdateStock: boolean;
  totalReceived: number;
  supplierTerms: string;
  supplierId: string;
  purchaseNumber: string;
  supplierName: string;
  createdAt: string;
}

export interface PendingCancel {
  purchaseId: string; // keyPath
  tenantId: string;
  createdAt: string;
}

// ── IDB helpers ───────────────────────────────────────────────────────────────

const DB_NAME    = 'novapos_purchases';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      const stores: Array<[string, IDBObjectStoreParameters]> = [
        ['purchases_cache',  { keyPath: 'tenantId' }],
        ['suppliers_cache',  { keyPath: 'tenantId' }],
        ['products_cache',   { keyPath: 'tenantId' }],
        ['pending_creates',  { keyPath: 'localId', autoIncrement: true }],
        ['pending_receives', { keyPath: 'purchaseId' }],
        ['pending_cancels',  { keyPath: 'purchaseId' }],
      ];
      for (const [name, opts] of stores) {
        if (!db.objectStoreNames.contains(name))
          db.createObjectStore(name, opts);
      }
    };
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, store: string, value: object): Promise<IDBValidKey> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, store: string, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

function idbGetAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror   = () => reject(req.error);
  });
}

// ── Service ───────────────────────────────────────────────────────────────────

export const purchasesOfflineService = {

  // ── Cache ──────────────────────────────────────────────────────────────────

  async cachePurchases(tenantId: string, purchases: any[]): Promise<void> {
    const db = await openDB();
    await idbPut(db, 'purchases_cache', { tenantId, purchases, cachedAt: Date.now() });
  },

  async getCachedPurchases(tenantId: string): Promise<{ purchases: any[]; cachedAt: Date | null }> {
    const db  = await openDB();
    const rec = await idbGet<any>(db, 'purchases_cache', tenantId);
    return rec?.purchases?.length
      ? { purchases: rec.purchases, cachedAt: new Date(rec.cachedAt) }
      : { purchases: [], cachedAt: null };
  },

  async cacheSuppliers(tenantId: string, suppliers: any[]): Promise<void> {
    const db = await openDB();
    await idbPut(db, 'suppliers_cache', { tenantId, suppliers });
  },

  async getCachedSuppliers(tenantId: string): Promise<any[]> {
    const db  = await openDB();
    const rec = await idbGet<any>(db, 'suppliers_cache', tenantId);
    return rec?.suppliers ?? [];
  },

  async cacheProducts(tenantId: string, products: any[]): Promise<void> {
    const db = await openDB();
    await idbPut(db, 'products_cache', { tenantId, products });
  },

  async getCachedProducts(tenantId: string): Promise<any[]> {
    const db  = await openDB();
    const rec = await idbGet<any>(db, 'products_cache', tenantId);
    return rec?.products ?? [];
  },

  // ── Queue operations ───────────────────────────────────────────────────────

  async queueCreate(data: Omit<PendingPurchaseCreate, 'localId' | 'createdAt'>): Promise<number> {
    const db      = await openDB();
    const localId = await idbPut(db, 'pending_creates', { ...data, createdAt: new Date().toISOString() });
    return localId as number;
  },

  async queueReceive(data: Omit<PendingReceive, 'createdAt'>): Promise<void> {
    const db = await openDB();
    await idbPut(db, 'pending_receives', { ...data, createdAt: new Date().toISOString() });
  },

  async queueCancel(purchaseId: string, tenantId: string): Promise<void> {
    const db = await openDB();
    await idbPut(db, 'pending_cancels', { purchaseId, tenantId, createdAt: new Date().toISOString() });
  },

  // ── Read pending ───────────────────────────────────────────────────────────

  async getPendingCreates(tenantId: string): Promise<PendingPurchaseCreate[]> {
    const db  = await openDB();
    const all = await idbGetAll<PendingPurchaseCreate>(db, 'pending_creates');
    return all.filter(p => p.tenantId === tenantId);
  },

  async getPendingReceives(tenantId: string): Promise<PendingReceive[]> {
    const db  = await openDB();
    const all = await idbGetAll<PendingReceive>(db, 'pending_receives');
    return all.filter(p => p.tenantId === tenantId);
  },

  async getPendingCancels(tenantId: string): Promise<PendingCancel[]> {
    const db  = await openDB();
    const all = await idbGetAll<PendingCancel>(db, 'pending_cancels');
    return all.filter(p => p.tenantId === tenantId);
  },

  async getPendingCount(tenantId: string): Promise<number> {
    const [c, r, x] = await Promise.all([
      this.getPendingCreates(tenantId),
      this.getPendingReceives(tenantId),
      this.getPendingCancels(tenantId),
    ]);
    return c.length + r.length + x.length;
  },

  // ── Remove pending ─────────────────────────────────────────────────────────

  async removePendingCreate(localId: number): Promise<void> {
    const db = await openDB();
    await idbDelete(db, 'pending_creates', localId);
  },

  async removePendingReceive(purchaseId: string): Promise<void> {
    const db = await openDB();
    await idbDelete(db, 'pending_receives', purchaseId);
  },

  async removePendingCancel(purchaseId: string): Promise<void> {
    const db = await openDB();
    await idbDelete(db, 'pending_cancels', purchaseId);
  },

  // ── Merge for UI ───────────────────────────────────────────────────────────
  // Returns cached list with pending operations applied optimistically.

  async getMergedPurchases(tenantId: string): Promise<any[]> {
    const [{ purchases: cached }, creates, receives, cancels] = await Promise.all([
      this.getCachedPurchases(tenantId),
      this.getPendingCreates(tenantId),
      this.getPendingReceives(tenantId),
      this.getPendingCancels(tenantId),
    ]);

    const receiveIds = new Set(receives.map(r => r.purchaseId));
    const cancelIds  = new Set(cancels.map(c => c.purchaseId));

    const updated = cached.map(p => {
      if (receiveIds.has(p.id)) return { ...p, status: 'received', __pendingSync: true };
      if (cancelIds.has(p.id))  return { ...p, status: 'cancelled', __pendingSync: true };
      return p;
    });

    const localPurchases = creates.map(c => ({
      id:                     `local-${c.localId}`,
      __local:                true,
      __localId:              c.localId,
      tenant_id:              tenantId,
      supplier_id:            c.purchaseData.supplier_id,
      supplier:               { name: c.purchaseData.supplier_name, payment_terms: null },
      purchase_number:        c.purchaseData.purchase_number,
      purchase_date:          c.purchaseData.purchase_date,
      expected_delivery_date: c.purchaseData.expected_delivery_date,
      actual_delivery_date:   null,
      status:                 'pending',
      total_amount:           c.purchaseData.total_amount,
      notes:                  c.purchaseData.notes,
      items:                  c.items.map(it => ({
        id:          `local-item-${it.product_id}`,
        product_id:  it.product_id,
        product:     { name: it.product_name },
        quantity:    it.quantity,
        unit_price:  it.unit_price,
        subtotal:    it.subtotal,
      })),
      created_at:  c.createdAt,
      __pendingSync: true,
    }));

    return [...localPurchases, ...updated];
  },

  // ── Sync ──────────────────────────────────────────────────────────────────

  async _syncReceive(r: PendingReceive): Promise<void> {
    const { purchaseId, items, notes, canUpdateStock, totalReceived, tenantId } = r;

    for (const item of items) {
      await supabase
        .from('purchase_items')
        .update({
          received_quantity: Math.floor(item.qty_received),
          unit_price:        item.price_received,
          subtotal:          item.qty_received * item.price_received,
        })
        .eq('id', item.id);
    }

    await supabase
      .from('purchases')
      .update({
        total_amount:         totalReceived,
        notes:                notes || null,
        actual_delivery_date: new Date().toISOString().slice(0, 10),
      })
      .eq('id', purchaseId);

    for (const item of items) {
      if (item.price_received > 0) {
        await supabase
          .from('products')
          .update({ cost_price: item.price_received, updated_at: new Date().toISOString() })
          .eq('id', item.product_id);
      }
    }

    if (canUpdateStock) {
      for (const item of items) {
        if (item.qty_received <= 0) continue;
        const { data: prod } = await supabase
          .from('products')
          .select('stock_quantity')
          .eq('id', item.product_id)
          .maybeSingle();
        if (prod) {
          await supabase
            .from('products')
            .update({ stock_quantity: Math.floor((prod.stock_quantity ?? 0) + item.qty_received) })
            .eq('id', item.product_id);
          await supabase
            .from('stock_movements')
            .insert([{
              tenant_id:      tenantId,
              product_id:     item.product_id,
              movement_type:  'in',
              quantity:       Math.round(item.qty_received),
              reference_id:   purchaseId,
              reference_type: 'purchase',
            }]);
        }
      }
    }

    await inventoryPurchasesService.updatePurchaseStatus(purchaseId, 'received');

    const creditDays = termsToDays(r.supplierTerms);
    if (creditDays !== null) {
      const alreadyExists = await accountsPayableService.existsForPurchase(purchaseId);
      if (!alreadyExists) {
        const today = new Date().toISOString().slice(0, 10);
        await accountsPayableService.create({
          tenant_id:       tenantId,
          purchase_id:     purchaseId,
          supplier_id:     r.supplierId,
          purchase_number: r.purchaseNumber,
          supplier_name:   r.supplierName,
          total_amount:    totalReceived,
          paid_amount:     0,
          due_date:        calcDueDate(today, r.supplierTerms),
          status:          'pending',
          payment_terms:   r.supplierTerms || null,
          notes:           notes || null,
        });
      }
    }
  },

  async syncAll(tenantId: string): Promise<{ synced: number; errors: Array<{ op: string; message: string }> }> {
    let synced = 0;
    const errors: Array<{ op: string; message: string }> = [];

    for (const c of await this.getPendingCreates(tenantId)) {
      try {
        const purchase = await inventoryPurchasesService.createPurchase(tenantId, {
          supplier_id:            c.purchaseData.supplier_id,
          purchase_number:        c.purchaseData.purchase_number,
          purchase_date:          c.purchaseData.purchase_date,
          expected_delivery_date: c.purchaseData.expected_delivery_date,
          actual_delivery_date:   null,
          status:                 'pending',
          total_amount:           c.purchaseData.total_amount,
          notes:                  c.purchaseData.notes,
        });
        if (purchase?.id) {
          await inventoryPurchasesService.addPurchaseItems(
            purchase.id,
            c.items.map(i => ({
              product_id: i.product_id,
              quantity:   i.quantity,
              unit_price: i.unit_price,
              subtotal:   i.subtotal,
            }))
          );
        }
        await this.removePendingCreate(c.localId!);
        synced++;
      } catch (err) {
        errors.push({ op: `Crear ${c.purchaseData.purchase_number}`, message: err instanceof Error ? err.message : String(err) });
      }
    }

    for (const c of await this.getPendingCancels(tenantId)) {
      try {
        await inventoryPurchasesService.updatePurchaseStatus(c.purchaseId, 'cancelled');
        await this.removePendingCancel(c.purchaseId);
        synced++;
      } catch (err) {
        errors.push({ op: 'Cancelar orden', message: err instanceof Error ? err.message : String(err) });
      }
    }

    for (const r of await this.getPendingReceives(tenantId)) {
      try {
        await this._syncReceive(r);
        await this.removePendingReceive(r.purchaseId);
        synced++;
      } catch (err) {
        errors.push({ op: `Recibir ${r.purchaseNumber}`, message: err instanceof Error ? err.message : String(err) });
      }
    }

    return { synced, errors };
  },
};
