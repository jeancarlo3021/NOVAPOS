/**
 * Offline support for cash sessions
 * Allows opening/closing cash sessions when offline with automatic sync
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { CashSession, CreateCashSessionInput } from '@/types/Types_POS';

interface OfflineDB extends DBSchema {
  pending_cash_sessions: {
    key: string;
    value: {
      id: string;
      type: 'open' | 'close';
      data: CreateCashSessionInput | any;
      timestamp: number;
      synced: boolean;
      /** Cuántas veces se intentó subir y por qué falló la última. */
      retries?: number;
      lastError?: string;
    };
  };
}

let db: IDBPDatabase<OfflineDB> | null = null;

async function getDb(): Promise<IDBPDatabase<OfflineDB>> {
  if (!db) {
    db = await openDB<OfflineDB>('novapos_cash_offline', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('pending_cash_sessions')) {
          db.createObjectStore('pending_cash_sessions', { keyPath: 'id' });
        }
      },
    });
  }
  return db;
}

export const cashSessionOfflineService = {
  /**
   * Queue cash session operation for offline/sync
   */
  async queueOpenSession(data: CreateCashSessionInput): Promise<CashSession> {
    const idb = await getDb();
    // Generate a valid UUID-like ID
    const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

    const pending = {
      id,
      type: 'open' as const,
      data,
      timestamp: Date.now(),
      synced: false,
    };

    await idb.put('pending_cash_sessions', pending);

    // Return optimistic response (mismo shape que CashSession: opening_date/closing_date).
    const nowIso = new Date().toISOString();
    return {
      id,
      tenant_id: data.tenant_id,
      user_id: data.user_id,
      opening_amount: data.opening_amount,
      closing_amount: null,
      opening_date: nowIso,
      closing_date: null,
      status: 'open',
      created_at: nowIso,
      updated_at: nowIso,
    } as unknown as CashSession;
  },

  /**
   * Queue cash session close for offline/sync
   */
  async queueCloseSession(data: { id: string; closing_amount: number; notes: string }): Promise<void> {
    try {
      const idb = await getDb();

      const pending = {
        id: data.id,
        type: 'close' as const,
        data,
        timestamp: Date.now(),
        synced: false,
      };

      await idb.put('pending_cash_sessions', pending);
    } catch (error) {
      throw new Error(`No se pudo guardar la operación offline: ${error instanceof Error ? error.message : 'error desconocido'}`);
    }
  },

  /**
   * Get pending operations
   */
  async getPendingOperations(): Promise<any[]> {
    const idb = await getDb();
    return idb.getAll('pending_cash_sessions');
  },

  /**
   * Get pending count
   */
  async getPendingCount(): Promise<number> {
    const idb = await getDb();
    const all = await idb.getAll('pending_cash_sessions');
    return all.filter(op => !op.synced).length;
  },

  /**
   * Mark operation as synced
   */
  async markSynced(id: string): Promise<void> {
    const idb = await getDb();
    const pending = await idb.get('pending_cash_sessions', id);
    if (pending) {
      pending.synced = true;
      await idb.put('pending_cash_sessions', pending);
    }
  },

  /**
   * Clear pending operations (after successful sync)
   */
  async clearSynced(): Promise<void> {
    const idb = await getDb();
    const all = await idb.getAll('pending_cash_sessions');
    for (const op of all) {
      if (op.synced) {
        await idb.delete('pending_cash_sessions', op.id);
      }
    }
  },

  /**
   * Sync all pending operations
   */
  /**
   * @param only Subir solo aperturas o solo cierres.
   *
   * El orden importa: un CIERRE tiene que subir DESPUÉS de las facturas del día.
   * Si sube antes, el servidor calcula los totales sin esas ventas y congela un
   * cierre en ceros que ya no se puede corregir.
   */
  async syncAll(
    syncFunction: (op: any) => Promise<any>,
    only?: 'open' | 'close',
  ): Promise<{ synced: number; failed: number }> {
    const idb = await getDb();
    const pending = await idb.getAll('pending_cash_sessions');
    const unsynced = pending.filter(op => !op.synced && (!only || op.type === only));

    let synced = 0;
    let failed = 0;

    for (const op of unsynced) {
      try {

        if (op.type === 'close') {
          // For close operations, extract the data and call the sync function
          await syncFunction({ type: 'close', data: op.data });
        } else {
          // For open operations, pass the full operation
          await syncFunction(op);
        }

        await this.markSynced(op.id);
        synced++;
      } catch (error) {
        // El motivo se guarda: sin él, una apertura o un cierre que no sube deja
        // «falló 1» en pantalla y a nadie con qué averiguar por qué.
        const msg = error instanceof Error ? error.message : String(error);
        try {
          await idb.put('pending_cash_sessions', {
            ...op, retries: (op.retries ?? 0) + 1, lastError: msg,
          });
        } catch { /* si no se puede anotar, igual queda pendiente */ }
        failed++;
      }
    }

    // Clean up synced operations
    await this.clearSynced();

    return { synced, failed };
  },
};
