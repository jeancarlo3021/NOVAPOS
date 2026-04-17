import { useCallback } from 'react';
import { offlineSyncService } from '@/services/offlineSyncService';
import { useOfflineSync } from './useOfflineSync';

interface Plan {
  id: string;
  name: string;
  description?: string;
  price: number;
  tenant_id: string;
  created_at?: string;
  updated_at?: string;
}

export function usePlansOffline() {
  const { updateSyncStatus } = useOfflineSync();

  // Crear plan offline
  const createPlanOffline = useCallback(
    async (plan: Omit<Plan, 'id' | 'created_at' | 'updated_at'>) => {
      try {
        const operation = await offlineSyncService.addOperation({
          type: 'create',
          table: 'plans',
          data: plan,
        });
        await updateSyncStatus();
        return operation;
      } catch (error) {
        console.error('Error creando plan offline:', error);
        throw error;
      }
    },
    [updateSyncStatus]
  );

  // Actualizar plan offline
  const updatePlanOffline = useCallback(
    async (id: string, updates: Partial<Plan>) => {
      try {
        const operation = await offlineSyncService.addOperation({
          type: 'update',
          table: 'plans',
          data: { id, ...updates },
        });
        await updateSyncStatus();
        return operation;
      } catch (error) {
        console.error('Error actualizando plan offline:', error);
        throw error;
      }
    },
    [updateSyncStatus]
  );

  // Eliminar plan offline
  const deletePlanOffline = useCallback(
    async (id: string) => {
      try {
        const operation = await offlineSyncService.addOperation({
          type: 'delete',
          table: 'plans',
          data: { id },
        });
        await updateSyncStatus();
        return operation;
      } catch (error) {
        console.error('Error eliminando plan offline:', error);
        throw error;
      }
    },
    [updateSyncStatus]
  );

  return {
    createPlanOffline,
    updatePlanOffline,
    deletePlanOffline,
  };
}