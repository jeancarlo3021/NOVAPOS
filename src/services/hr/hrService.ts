// Servicio HR — usa el backend HTTP
import { apiFetch } from '@/lib/api';
import type {
  Employee, AttendanceRecord, LeaveRequest, EmployeeStatus, LeaveStatus,
} from '@/modules/hr/types/HR.types';

// ─── EMPLOYEES ───────────────────────────────────────────────────────────────
export const employeesService = {
  async list(): Promise<Employee[]> {
    return apiFetch<Employee[]>('/hr/employees');
  },

  async getMe(): Promise<Employee | null> {
    return apiFetch<Employee | null>('/hr/employees/me').catch(() => null);
  },

  async create(data: Omit<Employee, 'id' | 'tenant_id' | 'created_at'>): Promise<Employee> {
    return apiFetch<Employee>('/hr/employees', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, patch: Partial<Employee>): Promise<Employee> {
    return apiFetch<Employee>(`/hr/employees/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },

  async remove(id: string): Promise<void> {
    await apiFetch(`/hr/employees/${id}`, { method: 'DELETE' });
  },
};

// ─── ATTENDANCE ──────────────────────────────────────────────────────────────
export const attendanceService = {
  async list(filter?: { employeeId?: string; from?: string; to?: string }): Promise<AttendanceRecord[]> {
    const qs = new URLSearchParams();
    if (filter?.employeeId) qs.set('employee_id', filter.employeeId);
    if (filter?.from) qs.set('from', filter.from);
    if (filter?.to) qs.set('to', filter.to);
    const url = `/hr/attendance${qs.toString() ? '?' + qs.toString() : ''}`;
    return apiFetch<AttendanceRecord[]>(url);
  },

  async todayRecord(employeeId: string): Promise<AttendanceRecord | undefined> {
    const today = new Date().toISOString().slice(0, 10);
    const records = await this.list({ employeeId, from: today, to: today });
    return records[0];
  },

  async clockIn(employeeId: string): Promise<AttendanceRecord> {
    return apiFetch<AttendanceRecord>('/hr/attendance/clock-in', {
      method: 'POST',
      body: JSON.stringify({ employee_id: employeeId }),
    });
  },

  async clockOut(employeeId: string): Promise<AttendanceRecord> {
    return apiFetch<AttendanceRecord>('/hr/attendance/clock-out', {
      method: 'POST',
      body: JSON.stringify({ employee_id: employeeId }),
    });
  },
};

// ─── LEAVE REQUESTS ──────────────────────────────────────────────────────────
export const leaveService = {
  async list(filter?: { status?: LeaveStatus; employeeId?: string }): Promise<LeaveRequest[]> {
    const qs = new URLSearchParams();
    if (filter?.status) qs.set('status', filter.status);
    if (filter?.employeeId) qs.set('employee_id', filter.employeeId);
    const url = `/hr/leave-requests${qs.toString() ? '?' + qs.toString() : ''}`;
    return apiFetch<LeaveRequest[]>(url);
  },

  async create(data: Omit<LeaveRequest, 'id' | 'created_at' | 'status'>): Promise<LeaveRequest> {
    return apiFetch<LeaveRequest>('/hr/leave-requests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateStatus(id: string, status: LeaveStatus, approvedBy?: string): Promise<LeaveRequest> {
    return apiFetch<LeaveRequest>(`/hr/leave-requests/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, approved_by: approvedBy }),
    });
  },

  async remove(id: string): Promise<void> {
    await apiFetch(`/hr/leave-requests/${id}`, { method: 'DELETE' });
  },
};

// ─── STATS HELPERS ───────────────────────────────────────────────────────────
export const hrStats = {
  async dashboard(): Promise<{
    counts: Record<EmployeeStatus, number>;
    total: number;
    expiringCerts: Employee[];
    presentToday: number;
    pendingLeave: number;
    payroll: { base: number; commission: number; total: number };
  }> {
    const [employees, attendance, pendingLeave] = await Promise.all([
      employeesService.list(),
      attendanceService.list({
        from: new Date().toISOString().slice(0, 10),
        to: new Date().toISOString().slice(0, 10),
      }),
      leaveService.list({ status: 'pending' }),
    ]);

    const counts: Record<EmployeeStatus, number> = {
      active: employees.filter(e => e.status === 'active').length,
      inactive: employees.filter(e => e.status === 'inactive').length,
      vacation: employees.filter(e => e.status === 'vacation').length,
      leave: employees.filter(e => e.status === 'leave').length,
    };

    const now = Date.now();
    const limit = now + 30 * 86_400_000;
    const expiringCerts = employees.filter(e => {
      if (!e.health_cert_expires_at) return false;
      const exp = new Date(e.health_cert_expires_at).getTime();
      return exp <= limit;
    });

    const activeEmps = employees.filter(e => e.status === 'active');
    const base = activeEmps.reduce((s, e) => s + (Number(e.monthly_salary) || 0), 0);
    const commission = activeEmps.reduce(
      (s, e) => s + ((Number(e.monthly_salary) || 0) * ((Number(e.commission_pct) || 0) / 100)),
      0,
    );

    return {
      counts,
      total: employees.length,
      expiringCerts,
      presentToday: new Set(attendance.filter(r => r.clock_in).map(r => r.employee_id)).size,
      pendingLeave: pendingLeave.length,
      payroll: { base, commission, total: base + commission },
    };
  },
};
