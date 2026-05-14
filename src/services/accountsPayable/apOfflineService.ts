import { accountsPayableService, type APPaymentPayload } from './accountsPayableService';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PendingAPPayment {
  localId?: number;
  tenantId: string;
  apId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  notes: string;
  createdAt: string;
}

// ── IDB helpers ───────────────────────────────────────────────────────────────

const DB_NAME    = 'novapos_ap';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror   = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('ap_cache'))
        db.createObjectStore('ap_cache', { keyPath: 'tenantId' });
      if (!db.objectStoreNames.contains('pending_payments'))
        db.createObjectStore('pending_payments', { keyPath: 'localId', autoIncrement: true });
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

export const apOfflineService = {

  // ── Cache ──────────────────────────────────────────────────────────────────

  async cacheAP(tenantId: string, entries: any[]): Promise<void> {
    const db = await openDB();
    await idbPut(db, 'ap_cache', { tenantId, entries, cachedAt: Date.now() });
  },

  async getCachedAP(tenantId: string): Promise<{ entries: any[]; cachedAt: Date | null }> {
    const db  = await openDB();
    const rec = await idbGet<any>(db, 'ap_cache', tenantId);
    return rec?.entries?.length
      ? { entries: rec.entries, cachedAt: new Date(rec.cachedAt) }
      : { entries: [], cachedAt: null };
  },

  // ── Queue ──────────────────────────────────────────────────────────────────

  async queuePayment(tenantId: string, apId: string, payment: APPaymentPayload): Promise<number> {
    const db      = await openDB();
    const localId = await idbPut(db, 'pending_payments', {
      tenantId,
      apId,
      amount:        payment.amount,
      paymentDate:   payment.payment_date,
      paymentMethod: payment.payment_method,
      notes:         payment.notes ?? '',
      createdAt:     new Date().toISOString(),
    });
    return localId as number;
  },

  // ── Read pending ───────────────────────────────────────────────────────────

  async getPendingPayments(tenantId: string): Promise<PendingAPPayment[]> {
    const db  = await openDB();
    const all = await idbGetAll<PendingAPPayment>(db, 'pending_payments');
    return all.filter(p => p.tenantId === tenantId);
  },

  async getPendingCount(tenantId: string): Promise<number> {
    const payments = await this.getPendingPayments(tenantId);
    return payments.length;
  },

  async removePendingPayment(localId: number): Promise<void> {
    const db = await openDB();
    await idbDelete(db, 'pending_payments', localId);
  },

  // ── Merge for UI ───────────────────────────────────────────────────────────
  // Returns cached AP with pending payments applied optimistically.

  async getMergedAP(tenantId: string): Promise<any[]> {
    const [{ entries: cached }, payments] = await Promise.all([
      this.getCachedAP(tenantId),
      this.getPendingPayments(tenantId),
    ]);

    const pendingByApId = new Map<string, number>();
    for (const p of payments) {
      pendingByApId.set(p.apId, (pendingByApId.get(p.apId) ?? 0) + p.amount);
    }

    return cached.map(ap => {
      const extra = pendingByApId.get(ap.id) ?? 0;
      if (extra === 0) return ap;
      const newPaid  = ap.paid_amount + extra;
      const newStatus = newPaid >= ap.total_amount ? 'paid' : 'partial';
      return { ...ap, paid_amount: newPaid, status: newStatus, __pendingSync: true };
    });
  },

  // ── Sync ──────────────────────────────────────────────────────────────────

  async syncAll(tenantId: string): Promise<{ synced: number; errors: Array<{ op: string; message: string }> }> {
    let synced = 0;
    const errors: Array<{ op: string; message: string }> = [];

    for (const p of await this.getPendingPayments(tenantId)) {
      try {
        await accountsPayableService.registerPayment(p.apId, {
          amount:         p.amount,
          payment_date:   p.paymentDate,
          payment_method: p.paymentMethod as APPaymentPayload['payment_method'],
          notes:          p.notes || undefined,
        });
        await this.removePendingPayment(p.localId!);
        synced++;
      } catch (err) {
        errors.push({ op: `Pago a ${p.apId}`, message: err instanceof Error ? err.message : String(err) });
      }
    }

    return { synced, errors };
  },
};
