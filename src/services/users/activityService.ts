import { apiFetch } from '@/lib/api';
import type { ActivityLog } from '@/types/Types_Users';

export interface LogActivityData {
  action: string;
  entity_type?: string;
  entity_id?: string;
  details?: Record<string, any>;
  user_name?: string;
}

export const activityService = {
  async getActivityLogs(
    _tenantId: string,
    filters?: { user_id?: string; from?: string; to?: string; action?: string; limit?: number }
  ): Promise<ActivityLog[]> {
    const params = new URLSearchParams();
    if (filters?.user_id) params.set('user_id', filters.user_id);
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    if (filters?.action) params.set('action', filters.action);
    if (filters?.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return apiFetch<ActivityLog[]>(`/activity${qs ? '?' + qs : ''}`);
  },

  async getActivityForUser(
    _tenantId: string,
    userId: string,
    filters?: { from?: string; to?: string; limit?: number }
  ): Promise<ActivityLog[]> {
    const params = new URLSearchParams();
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    if (filters?.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return apiFetch<ActivityLog[]>(`/activity/user/${userId}${qs ? '?' + qs : ''}`);
  },

  async logActivity(_tenantId: string, data: LogActivityData): Promise<ActivityLog> {
    return apiFetch<ActivityLog>('/activity', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Convenience methods for common actions
  async logLogin(_tenantId: string, userName?: string): Promise<void> {
    try {
      await this.logActivity(_tenantId, {
        action: 'login',
        user_name: userName,
      });
    } catch {
      // Silently fail — activity logging shouldn't break the app
    }
  },

  async logUserCreated(
    _tenantId: string,
    createdUserId: string,
    createdUserName: string,
    currentUserName?: string
  ): Promise<void> {
    try {
      await this.logActivity(_tenantId, {
        action: 'user_created',
        entity_type: 'user',
        entity_id: createdUserId,
        user_name: currentUserName,
        details: { created_user: createdUserName },
      });
    } catch {
      // Silently fail
    }
  },

  async logUserDeleted(
    _tenantId: string,
    deletedUserId: string,
    deletedUserName: string,
    currentUserName?: string
  ): Promise<void> {
    try {
      await this.logActivity(_tenantId, {
        action: 'user_deleted',
        entity_type: 'user',
        entity_id: deletedUserId,
        user_name: currentUserName,
        details: { deleted_user: deletedUserName },
      });
    } catch {
      // Silently fail
    }
  },

  async logInvoiceCreated(
    _tenantId: string,
    invoiceId: string,
    invoiceNumber: string,
    total: number,
    currentUserName?: string
  ): Promise<void> {
    try {
      await this.logActivity(_tenantId, {
        action: 'invoice_created',
        entity_type: 'invoice',
        entity_id: invoiceId,
        user_name: currentUserName,
        details: { invoice_number: invoiceNumber, total },
      });
    } catch {
      // Silently fail
    }
  },

  async logPurchaseCreated(
    _tenantId: string,
    purchaseId: string,
    purchaseNumber: string,
    total: number,
    currentUserName?: string
  ): Promise<void> {
    try {
      await this.logActivity(_tenantId, {
        action: 'purchase_created',
        entity_type: 'purchase',
        entity_id: purchaseId,
        user_name: currentUserName,
        details: { purchase_number: purchaseNumber, total },
      });
    } catch {
      // Silently fail
    }
  },
};
