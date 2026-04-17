import { supabase } from '@/lib/supabase';

export interface OfflineOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  table: string;
  data: any;
  timestamp: number;
  synced: boolean;
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
      const request = indexedDB.open(this.DB_NAME, 2);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
          store.createIndex('synced', 'synced', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
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
      synced: false,
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
      const request = index.getAll(false);

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
    switch (op.type) {
      case 'create':
        return await supabase.from(op.table).insert([op.data]);
      case 'update':
        return await supabase
          .from(op.table)
          .update(op.data)
          .eq('id', op.data.id);
      case 'delete':
        return await supabase.from(op.table).delete().eq('id', op.data.id);
      default:
        throw new Error(`Tipo de operación desconocido: ${op.type}`);
    }
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
        op.synced = true;
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
      const request = index.openCursor(IDBKeyRange.only(true));

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