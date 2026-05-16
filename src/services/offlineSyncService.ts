import { apiFetch } from '@/lib/api';

export interface OfflineOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  table: string;
  data: any;
  timestamp: number;
  synced: 0 | 1; // boolean is NOT a valid IndexedDB key type — use 0/1
  retries: number;
  lastError?: string;
}

class OfflineSyncService {
  private DB_NAME = 'plansDB';
  private STORE_NAME = 'operations';
  private db: IDBDatabase | null = null;
  private MAX_RETRIES = 3;

  async init() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      // Version 3: recreate store to fix boolean→numeric key type migration
      const request = indexedDB.open(this.DB_NAME, 3);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        // Drop old store (may have boolean keys that crash Firefox) and recreate
        if (db.objectStoreNames.contains(this.STORE_NAME)) {
          db.deleteObjectStore(this.STORE_NAME);
        }
        const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
        store.createIndex('synced',    'synced',    { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      };
    });
  }

  async addOperation(operation: Omit<OfflineOperation, 'id' | 'timestamp' | 'retries' | 'synced'>) {
    await this.init();
    if (!this.db) throw new Error('IndexedDB no inicializado');

    const op: OfflineOperation = {
      ...operation,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      synced: 0,
      retries: 0,
    };

    return new Promise<OfflineOperation>((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.add(op);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(op);
    });
  }

  async getPendingOperations(): Promise<OfflineOperation[]> {
    await this.init();
    if (!this.db) throw new Error('IndexedDB no inicializado');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('synced');
      const request = index.getAll(IDBKeyRange.only(0));

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const operations = request.result.sort((a, b) => a.timestamp - b.timestamp);
        resolve(operations);
      };
    });
  }

  async syncOperations() {
    const operations = await this.getPendingOperations();
    if (operations.length === 0) return { success: true, synced: 0, errors: [] };

    let synced = 0;
    const errors: any[] = [];

    for (const op of operations) {
      try {
        if (op.retries >= this.MAX_RETRIES) {
          errors.push({
            operationId: op.id,
            error: 'Máximo número de reintentos alcanzado',
          });
          continue;
        }

        const result = await this.executeOperation(op);
        if (result.error) {
          await this.incrementRetries(op.id, result.error.message);
          errors.push({ operationId: op.id, error: result.error });
        } else {
          await this.markAsSynced(op.id);
          synced++;
        }
      } catch (error) {
        await this.incrementRetries(op.id, String(error));
        errors.push({ operationId: op.id, error });
      }
    }

    if (synced > 0) {
      localStorage.setItem('lastSync', new Date().toISOString());
    }

    return { success: errors.length === 0, synced, errors };
  }

  private async executeOperation(op: OfflineOperation) {
    const endpoint = this.tableToEndpoint(op.table);
    try {
      switch (op.type) {
        case 'create':
          await apiFetch(endpoint, {
            method: 'POST',
            body: JSON.stringify(op.data),
          });
          return { data: null, error: null };
        case 'update':
          await apiFetch(`${endpoint}/${op.data.id}`, {
            method: 'PUT',
            body: JSON.stringify(op.data),
          });
          return { data: null, error: null };
        case 'delete':
          await apiFetch(`${endpoint}/${op.data.id}`, {
            method: 'DELETE',
          });
          return { data: null, error: null };
        default:
          throw new Error(`Tipo de operación desconocido: ${op.type}`);
      }
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  private tableToEndpoint(table: string): string {
    const tableToApiMap: Record<string, string> = {
      products: '/products',
      invoices: '/invoices',
      expenses: '/expenses',
      purchases: '/purchases',
      cash_sessions: '/cash-sessions',
      cash_movements: '/cash-sessions/movements',
      suppliers: '/suppliers',
      product_categories: '/categories',
      promotions: '/promotions',
      users: '/users',
    };
    return tableToApiMap[table] || `/${table}`;
  }

  private async markAsSynced(operationId: string) {
    await this.init();
    if (!this.db) throw new Error('IndexedDB no inicializado');

    return new Promise<OfflineOperation>((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const getRequest = store.get(operationId);

      getRequest.onsuccess = () => {
        const op = getRequest.result;
        op.synced = 1;
        op.retries = 0;
        const updateRequest = store.put(op);
        updateRequest.onerror = () => reject(updateRequest.error);
        updateRequest.onsuccess = () => resolve(op);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  private async incrementRetries(operationId: string, error: string) {
    await this.init();
    if (!this.db) throw new Error('IndexedDB no inicializado');

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const getRequest = store.get(operationId);

      getRequest.onsuccess = () => {
        const op = getRequest.result;
        op.retries = (op.retries || 0) + 1;
        op.lastError = error;
        const updateRequest = store.put(op);
        updateRequest.onerror = () => reject(updateRequest.error);
        updateRequest.onsuccess = () => resolve();
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async getSyncStatus() {
    const operations = await this.getPendingOperations();
    return {
      pending: operations.length,
      lastSync: localStorage.getItem('lastSync'),
      operations,
    };
  }

  async clearSyncedOperations() {
    await this.init();
    if (!this.db) throw new Error('IndexedDB no inicializado');

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('synced');
      const request = index.openCursor(IDBKeyRange.only(1));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
}

export const offlineSyncService = new OfflineSyncService();