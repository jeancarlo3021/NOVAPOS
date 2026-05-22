import { apiFetch } from '@/lib/api';
import { validateUUID } from '@/lib/validation';
import type { Shift, CreateShiftFormData, UpdateShiftFormData } from '@/types/Types_Users';

export const shiftsService = {
  async getShifts(
    _tenantId: string,
    filters?: { user_id?: string; team_id?: string; from?: string; to?: string; status?: string }
  ): Promise<Shift[]> {
    const params = new URLSearchParams();
    if (filters?.user_id) params.set('user_id', filters.user_id);
    if (filters?.team_id) params.set('team_id', filters.team_id);
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    if (filters?.status) params.set('status', filters.status);
    const qs = params.toString();
    return apiFetch<Shift[]>(`/shifts${qs ? '?' + qs : ''}`);
  },

  async getShiftById(shiftId: string): Promise<Shift> {
    validateUUID(shiftId, 'shiftId');
    return apiFetch<Shift>(`/shifts/${shiftId}`);
  },

  async createShift(_tenantId: string, form: CreateShiftFormData): Promise<Shift> {
    return apiFetch<Shift>('/shifts', {
      method: 'POST',
      body: JSON.stringify({
        user_id: form.user_id || null,
        team_id: form.team_id || null,
        start_datetime: form.start_datetime,
        end_datetime: form.end_datetime || null,
        status: form.status || 'scheduled',
        notes: form.notes || null,
      }),
    });
  },

  async updateShift(shiftId: string, form: UpdateShiftFormData): Promise<Shift> {
    validateUUID(shiftId, 'shiftId');
    return apiFetch<Shift>(`/shifts/${shiftId}`, {
      method: 'PUT',
      body: JSON.stringify(form),
    });
  },

  async deleteShift(shiftId: string): Promise<void> {
    validateUUID(shiftId, 'shiftId');
    await apiFetch(`/shifts/${shiftId}`, { method: 'DELETE' });
  },

  async getShiftsForWeek(
    _tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<Shift[]> {
    return this.getShifts(_tenantId, { from: startDate, to: endDate });
  },

  async getShiftsForUser(_tenantId: string, userId: string): Promise<Shift[]> {
    return this.getShifts(_tenantId, { user_id: userId });
  },

  async getActiveShifts(_tenantId: string): Promise<Shift[]> {
    return this.getShifts(_tenantId, { status: 'active' });
  },
};
