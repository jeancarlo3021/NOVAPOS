import { Product, CashSession, CartItem } from '@/types/Types_POS';

// ─── IndexedDB setup ────────────────────────────────────────────────────────

const DB_NAME = 'novapos_offline';
const DB_VERSION = 1;
const PRODUCTS_STORE  = 'pos_products';
const INVOICES_STORE  = 'pos_pending_invoices';
const VOIDS_STORE     = 'pos_pending_voids';

export interface OfflineInvoicePayload {
  id: string;
  invoiceNumber: string;
  tenantId: string;
  sessionId: string;
  cartItems: CartItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'sinpe';
  amountReceived?: number;
  changeAmount?: number;
  voucherNumber?: string;
  notes?: string;
  timestamp: number;
  synced: 0 | 1;
  retries: number;
  syncError?: string;
}

export interface OfflineVoidPayload {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  timestamp: number;
  synced: 0 | 1;
  retries: number;
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
      if (!db.objectStoreNames.contains(VOIDS_STORE)) {
        const store = db.createObjectStore(VOIDS_STORE, { keyPath: 'id' });
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

// ─── Invoices cache for void operations ────────────────────────────────────────

const INVOICES_CACHE_KEY = 'novapos_invoices_cache';

interface CachedInvoice {
  id: string;
  invoice_number: string;
  issued_at: string;
  total: number;
  payment_method: string;
  voided?: boolean;
}

function cacheInvoices(invoices: CachedInvoice[]): void {
  try {
    localStorage.setItem(INVOICES_CACHE_KEY, JSON.stringify({
      invoices,
      cachedAt: Date.now(),
    }));
  } catch (e) {
    console.warn('[posOfflineService] Error cacheando facturas:', e);
  }
}

function getCachedInvoices(): CachedInvoice[] {
  try {
    const raw = localStorage.getItem(INVOICES_CACHE_KEY);
    return raw ? JSON.parse(raw).invoices : [];
  } catch {
    return [];
  }
}

function addCachedInvoice(invoice: CachedInvoice): void {
  const cached = getCachedInvoices();
  // Evitar duplicados
  const exists = cached.some(inv => inv.id === invoice.id);
  if (!exists) {
    cached.unshift(invoice); // Agregar al inicio (más recientes primero)
    cacheInvoices(cached.slice(0, 100)); // Guardar máximo 100
  }
}

function markVoidedInCache(invoiceId: string): void {
  const cached = getCachedInvoices();
  const invoice = cached.find(inv => inv.id === invoiceId);
  if (invoice) {
    invoice.voided = true;
    cacheInvoices(cached);
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

// ─── Generate offline invoice numbers ─────────────────────────────────────────

const OFFLINE_INVOICE_COUNTER_KEY = 'novapos_offline_invoice_counter';

function getOfflineInvoiceCounter(): number {
  try {
    const raw = localStorage.getItem(OFFLINE_INVOICE_COUNTER_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

function incrementOfflineInvoiceCounter(): number {
  const current = getOfflineInvoiceCounter();
  const next = current + 1;
  localStorage.setItem(OFFLINE_INVOICE_COUNTER_KEY, String(next));
  return next;
}

function generateOfflineInvoiceNumber(): string {
  const counter = incrementOfflineInvoiceCounter();
  const date = new Date();
  const datePart = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return `${datePart}-${String(counter).padStart(5, '0')}`;
}

// ─── Pending invoices queue ───────────────────────────────────────────────────

async function queueInvoice(payload: Omit<OfflineInvoicePayload, 'id' | 'invoiceNumber' | 'timestamp' | 'synced' | 'retries'>): Promise<string> {
  const db = await openDB();
  const invoiceNumber = generateOfflineInvoiceNumber();
  const invoice: OfflineInvoicePayload = {
    ...payload,
    id: generateUUID(),
    invoiceNumber,
    timestamp: Date.now(),
    synced: 0,
    retries: 0,
  };
  await idbPut(db, INVOICES_STORE, invoice);
  console.log('[posOfflineService] Factura encolada:', { id: invoice.id, invoiceNumber, total: payload.total });
  return invoiceNumber; // Return invoice number instead of ID
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
  if (!inv) return;
  const retries = (inv.retries ?? 0) + 1;
  // After 3 failed attempts mark as permanently failed (synced=1) so it stops retrying
  await idbPut(db, INVOICES_STORE, {
    ...inv,
    retries,
    syncError: error,
    synced: retries >= 3 ? 1 : 0,
  });
}

async function getPendingCount(): Promise<number> {
  const pending = await getPendingInvoices();
  return pending.length;
}

// ── Error message extractor ───────────────────────────────────────────────────

function extractErrorMessage(err: unknown): string {
  if (!err) return 'Error desconocido';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  // Supabase returns plain objects: { message, code, details, hint }
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const parts: string[] = [];
    if (e.message)  parts.push(String(e.message));
    if (e.details)  parts.push(String(e.details));
    if (e.hint)     parts.push(`Sugerencia: ${e.hint}`);
    if (e.code)     parts.push(`(${e.code})`);
    return parts.length ? parts.join(' — ') : JSON.stringify(err);
  }
  return String(err);
}

// ─── Sync pending invoices (call createInvoice for each) ─────────────────────

export interface SyncError {
  invoiceId: string;
  timestamp: number;
  message: string;
}

async function syncPendingInvoices(
  createInvoice: (p: OfflineInvoicePayload) => Promise<void>
): Promise<{ synced: number; errors: number; details: SyncError[] }> {
  const pending = await getPendingInvoices();
  let synced = 0;
  let errors = 0;
  const details: SyncError[] = [];

  for (const inv of pending) {
    try {
      await createInvoice(inv);
      await markInvoiceSynced(inv.id);
      synced++;
    } catch (err) {
      const msg = extractErrorMessage(err);
      await markInvoiceError(inv.id, msg);
      details.push({ invoiceId: inv.id, timestamp: inv.timestamp, message: msg });
      errors++;
    }
  }

  return { synced, errors, details };
}

async function getFailedInvoices(): Promise<OfflineInvoicePayload[]> {
  const db = await openDB();
  // Failed = synced:1 but has syncError and retries >= 3
  const all = await idbGetAllByIndex<OfflineInvoicePayload>(db, INVOICES_STORE, 'synced', 1);
  return all.filter(inv => inv.syncError && (inv.retries ?? 0) >= 3);
}

async function clearFailedInvoice(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(INVOICES_STORE, 'readwrite');
    const req = tx.objectStore(INVOICES_STORE).delete(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
}

// ─── Session ID remapping (offline UUID → server UUID) ───────────────────────

const SESSION_ID_MAP_KEY = 'novapos_session_id_map';

function getSessionIdMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SESSION_ID_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSessionIdMap(map: Record<string, string>): void {
  localStorage.setItem(SESSION_ID_MAP_KEY, JSON.stringify(map));
}

function mapOfflineSessionId(offlineId: string): string {
  const map = getSessionIdMap();
  return map[offlineId] ?? offlineId;
}

function remapSessionId(offlineId: string, serverId: string): void {
  const map = getSessionIdMap();
  map[offlineId] = serverId;
  saveSessionIdMap(map);
  console.log(`[SESSION-REMAP] ${offlineId} → ${serverId}`);
}

async function updateInvoiceSessionIds(offlineId: string, serverId: string): Promise<void> {
  const db = await openDB();
  const pending = await getPendingInvoices();
  for (const inv of pending) {
    if (inv.sessionId === offlineId) {
      await idbPut(db, INVOICES_STORE, { ...inv, sessionId: serverId });
    }
  }
}

// ─── Void invoices (offline) ──────────────────────────────────────────────────

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function queueVoid(invoiceId: string, invoiceNumber: string): Promise<string> {
  const db = await openDB();
  const id = generateUUID();
  const payload: OfflineVoidPayload = {
    id,
    invoiceId,
    invoiceNumber,
    timestamp: Date.now(),
    synced: 0,
    retries: 0,
  };
  await idbPut(db, VOIDS_STORE, payload);
  console.log('[posOfflineService] Void encolado:', { invoiceNumber, id });
  return id;
}

async function getPendingVoids(): Promise<OfflineVoidPayload[]> {
  const db = await openDB();
  return idbGetAllByIndex<OfflineVoidPayload>(db, VOIDS_STORE, 'synced', 0);
}

async function getPendingVoidCount(): Promise<number> {
  const voids = await getPendingVoids();
  return voids.length;
}

async function markVoidSynced(id: string): Promise<void> {
  const db = await openDB();
  const void_op = await idbGet<OfflineVoidPayload>(db, VOIDS_STORE, id);
  if (void_op) {
    await idbPut(db, VOIDS_STORE, { ...void_op, synced: 1 });
  }
}

async function markVoidError(id: string, error: string): Promise<void> {
  const db = await openDB();
  const void_op = await idbGet<OfflineVoidPayload>(db, VOIDS_STORE, id);
  if (void_op) {
    await idbPut(db, VOIDS_STORE, {
      ...void_op,
      synced: 1,
      retries: (void_op.retries ?? 0) + 1,
      syncError: error,
    });
  }
}

async function syncPendingVoids(
  cancelInvoice: (id: string) => Promise<void>
): Promise<{ synced: number; errors: number; details: SyncError[] }> {
  const pending = await getPendingVoids();
  let synced = 0;
  let errors = 0;
  const details: SyncError[] = [];

  for (const void_op of pending) {
    try {
      await cancelInvoice(void_op.invoiceId);
      await markVoidSynced(void_op.id);
      synced++;
      console.log('[posOfflineService] Void sincronizado:', void_op.invoiceNumber);
    } catch (err) {
      const msg = extractErrorMessage(err);
      await markVoidError(void_op.id, msg);
      details.push({
        invoiceId: void_op.invoiceId,
        timestamp: void_op.timestamp,
        message: msg,
      });
      errors++;
    }
  }

  return { synced, errors, details };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const posOfflineService = {
  // Products
  cacheProducts,
  getCachedProducts,
  // Session
  cacheSession,
  getCachedSession,
  // Invoices cache
  cacheInvoices,
  getCachedInvoices,
  addCachedInvoice,
  markVoidedInCache,
  // Invoices
  queueInvoice,
  getPendingInvoices,
  getPendingCount,
  markInvoiceSynced,
  syncPendingInvoices,
  getFailedInvoices,
  clearFailedInvoice,
  // Void invoices
  queueVoid,
  getPendingVoids,
  getPendingVoidCount,
  markVoidSynced,
  markVoidError,
  syncPendingVoids,
  // Session ID remapping
  mapOfflineSessionId,
  remapSessionId,
  updateInvoiceSessionIds,
};
