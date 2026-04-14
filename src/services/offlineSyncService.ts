import { supabase } from '@/lib/supabase';

export interface OfflineOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  table: string;
  data: any;
  timestamp: number;
  synced: boolean;
}

class OfflineSyncService {
  private DB_NAME = 'plansDB';
  private STORE_NAME = 'operations';
  private db: IDBDatabase | null = null;

  async init() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }

  async addOperation(operation: Omit<OfflineOperation, 'id' | 'timestamp'>) {
    await this.init();
    if (!this.db) throw new Error('IndexedDB no inicializado');

    const op: OfflineOperation = {
      ...operation,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      synced: false,
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
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const operations = request.result.filter((op) => !op.synced);
        resolve(operations);
      };
    });
  }

  async syncOperations() {
    const operations = await this.getPendingOperations();
    if (operations.length === 0) return { success: true, synced: 0 };

    let synced = 0;
    const errors: any[] = [];

    for (const op of operations) {
      try {
        const result = await this.executeOperation(op);
        if (result.error) {
          errors.push({ operationId: op.id, error: result.error });
        } else {
          await this.markAsSynced(op.id);
          synced++;
        }
      } catch (error) {
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
        const updateRequest = store.put(op);
        updateRequest.onerror = () => reject(updateRequest.error);
        updateRequest.onsuccess = () => resolve(op);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async getSyncStatus() {
    const operations = await this.getPendingOperations();
    return {
      pending: operations.length,
      lastSync: localStorage.getItem('lastSync'),
    };
  }
}

export const offlineSyncService = new OfflineSyncService();
