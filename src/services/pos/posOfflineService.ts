import { Product, CashSession, CartItem } from '@/types/Types_POS';

// ─── IndexedDB setup ────────────────────────────────────────────────────────

const DB_NAME = 'novapos_offline';
const DB_VERSION = 1;
const PRODUCTS_STORE  = 'pos_products';
const INVOICES_STORE  = 'pos_pending_invoices';

export interface OfflineInvoicePayload {
  id: string;
  tenantId: string;
  sessionId: string;
  cartItems: CartItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'sinpe';
  notes?: string;
  timestamp: number;
  synced: 0 | 1;
  syncError?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PRODUCTS_STORE)) {
        db.createObjectStore(PRODUCTS_STORE, { keyPath: 'tenantId' });
      }
      if (!db.objectStoreNames.contains(INVOICES_STORE)) {
        const store = db.createObjectStore(INVOICES_STORE, { keyPath: 'id' });
        store.createIndex('synced', 'synced', { unique: false });
      }
    };
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result ?? null);
  });
}

function idbPut(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
}

function idbGetAllByIndex<T>(db: IDBDatabase, store: string, index: string, value: unknown): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).index(index).getAll(IDBKeyRange.only(value));
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

// ─── Session cache (localStorage — lightweight) ──────────────────────────────

const SESSION_KEY = 'novapos_session';

function cacheSession(session: CashSession | null): void {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function getCachedSession(): CashSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ─── Products cache ───────────────────────────────────────────────────────────

async function cacheProducts(tenantId: string, products: Product[]): Promise<void> {
  const db = await openDB();
  await idbPut(db, PRODUCTS_STORE, { tenantId, products, updatedAt: Date.now() });
}

async function getCachedProducts(tenantId: string): Promise<Product[] | null> {
  const db = await openDB();
  const record = await idbGet<{ tenantId: string; products: Product[]; updatedAt: number }>(
    db, PRODUCTS_STORE, tenantId
  );
  return record?.products ?? null;
}

// ─── Pending invoices queue ───────────────────────────────────────────────────

async function queueInvoice(payload: Omit<OfflineInvoicePayload, 'id' | 'timestamp' | 'synced'>): Promise<string> {
  const db = await openDB();
  const invoice: OfflineInvoicePayload = {
    ...payload,
    id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    synced: 0,
  };
  await idbPut(db, INVOICES_STORE, invoice);
  return invoice.id;
}

async function getPendingInvoices(): Promise<OfflineInvoicePayload[]> {
  const db = await openDB();
  const all = await idbGetAllByIndex<OfflineInvoicePayload>(db, INVOICES_STORE, 'synced', 0);
  return all.sort((a, b) => a.timestamp - b.timestamp);
}

async function markInvoiceSynced(id: string): Promise<void> {
  const db = await openDB();
  const inv = await idbGet<OfflineInvoicePayload>(db, INVOICES_STORE, id);
  if (inv) await idbPut(db, INVOICES_STORE, { ...inv, synced: 1 });
}

async function markInvoiceError(id: string, error: string): Promise<void> {
  const db = await openDB();
  const inv = await idbGet<OfflineInvoicePayload>(db, INVOICES_STORE, id);
  if (inv) await idbPut(db, INVOICES_STORE, { ...inv, syncError: error });
}

async function getPendingCount(): Promise<number> {
  const pending = await getPendingInvoices();
  return pending.length;
}

// ─── Sync pending invoices (call createInvoice for each) ─────────────────────

async function syncPendingInvoices(
  createInvoice: (p: OfflineInvoicePayload) => Promise<void>
): Promise<{ synced: number; errors: number }> {
  const pending = await getPendingInvoices();
  let synced = 0;
  let errors = 0;

  for (const inv of pending) {
    try {
      await createInvoice(inv);
      await markInvoiceSynced(inv.id);
      synced++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await markInvoiceError(inv.id, msg);
      errors++;
    }
  }

  return { synced, errors };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const posOfflineService = {
  // Products
  cacheProducts,
  getCachedProducts,
  // Session
  cacheSession,
  getCachedSession,
  // Invoices
  queueInvoice,
  getPendingInvoices,
  getPendingCount,
  markInvoiceSynced,
  syncPendingInvoices,
};
