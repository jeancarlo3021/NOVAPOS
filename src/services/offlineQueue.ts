/**
 * Generic offline operation queue
 * Enqueues any API operation when offline and syncs when back online
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface OfflineDB extends DBSchema {
  pending_operations: {
    key: string;
    value: {
      id: string;
      path: string;
      method: string;
      body?: any;
      timestamp: number;
      synced: boolean;
      retries: number;
    };
  };
}

let db: IDBPDatabase<OfflineDB> | null = null;

async function getDb(): Promise<IDBPDatabase<OfflineDB>> {
  if (!db) {
    db = await openDB<OfflineDB>('novapos_offline_queue', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('pending_operations')) {
          db.createObjectStore('pending_operations', { keyPath: 'id' });
        }
      },
    });
  }
  return db;
}

export const offlineQueue = {
  /**
   * Enqueue an operation
   */
  async enqueue(path: string, method: string, body?: any): Promise<string> {
    const idb = await getDb();
    // Generate a valid UUID-like ID
    const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

    const operation = {
      id,
      path,
      method,
      body,
      timestamp: Date.now(),
      synced: false,
      retries: 0,
    };

    await idb.put('pending_operations', operation);
    console.log(`[QUEUE] Operación encolada: ${method} ${path}`);
    return id;
  },

  /**
   * Get all pending operations
   */
  async getPending(): Promise<any[]> {
    const idb = await getDb();
    const all = await idb.getAll('pending_operations');
    return all.filter(op => !op.synced);
  },

  /**
   * Get pending count
   */
  async getPendingCount(): Promise<number> {
    const idb = await getDb();
    const all = await idb.getAll('pending_operations');
    return all.filter(op => !op.synced).length;
  },

  /**
   * Mark as synced
   */
  async markSynced(id: string): Promise<void> {
    const idb = await getDb();
    const op = await idb.get('pending_operations', id);
    if (op) {
      op.synced = true;
      await idb.put('pending_operations', op);
    }
  },

  /**
   * Clear synced operations
   */
  async clearSynced(): Promise<void> {
    const idb = await getDb();
    const all = await idb.getAll('pending_operations');
    for (const op of all) {
      if (op.synced) {
        await idb.delete('pending_operations', op.id);
      }
    }
  },

  /**
   * Sync all pending operations
   */
  async syncAll(
    apiFetch: (path: string, options?: any) => Promise<any>
  ): Promise<{ synced: number; failed: number; errors: any[] }> {
    const idb = await getDb();
    const pending = await this.getPending();

    let synced = 0;
    let failed = 0;
    const errors: any[] = [];

    for (const op of pending) {
      try {
        console.log(`[SYNC] Sincronizando: ${op.method} ${op.path}`);
        await apiFetch(op.path, {
          method: op.method,
          ...(op.body && { body: JSON.stringify(op.body) }),
        });
        await this.markSynced(op.id);
        synced++;
        console.log(`[SYNC] ✅ ${op.method} ${op.path}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[SYNC] Error: ${op.method} ${op.path}`, errorMsg);

        // Errors that don't need retry
        const noRetryErrors = [
          'eliminado',
          'not found',
          '404',
          'no existe',
          'borrado',
        ];

        const shouldSkipRetry = noRetryErrors.some(msg =>
          errorMsg.toLowerCase().includes(msg)
        );

        if (shouldSkipRetry) {
          console.log(`[SYNC] ⏭️ Saltando operación (no existe): ${op.id}`);
          await this.markSynced(op.id);
          synced++;
        } else {
          // Increment retry count for real errors
          op.retries = (op.retries || 0) + 1;
          if (op.retries < 3) {
            console.log(`[SYNC] 🔄 Reintentando (${op.retries}/3): ${op.id}`);
            await idb.put('pending_operations', op);
          } else {
            console.warn(`[SYNC] ❌ Máximo de reintentos alcanzado: ${op.id}`);
            await this.markSynced(op.id);
          }
          failed++;
          errors.push({
            operationId: op.id,
            path: op.path,
            method: op.method,
            error: errorMsg,
          });
        }
      }
    }

    await this.clearSynced();
    console.log(`[SYNC] Resultado: ${synced} exitosas, ${failed} fallidas`);
    return { synced, failed, errors };
  },
};
