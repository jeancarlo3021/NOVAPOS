// Servicio HR — usa el backend HTTP
import { apiFetch } from '@/lib/api';
import type {
  Employee, AttendanceRecord, LeaveRequest, EmployeeStatus, LeaveStatus,
  PayrollRun, PayrollItem,
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

// ─── PLANILLA ────────────────────────────────────────────────────────────────

export interface PlanillaPreview {
  from: string;
  to: string;
  branch_id: string | null;
  lineas: PayrollItem[];
  totales: {
    gross: number; employee_charges: number; other_deductions: number;
    employer_charges: number; net: number; total_cost: number;
    employees_count: number; sales_total: number;
  };
  cargas: { obrero: number; patronal: number };
  /** Si el período ya tiene planilla guardada, para no pagar dos veces. */
  existente: { id: string; status: string; paid_at: string | null } | null;
}

export const payrollService = {
  /** Calcula la planilla del período con los datos reales (no guarda nada). */
  preview: (from: string, to: string, branchId?: string | null) => {
    const q = new URLSearchParams({ from, to });
    if (branchId) q.set('branch_id', branchId);
    return apiFetch<PlanillaPreview>(`/hr/payroll/preview?${q.toString()}`, {}, 25_000);
  },

  list: () => apiFetch<PayrollRun[]>('/hr/payroll'),

  get: (id: string) => apiFetch<PayrollRun>(`/hr/payroll/${id}`),

  save: (payload: {
    period_start: string; period_end: string;
    branch_id?: string | null; notes?: string | null; items: PayrollItem[];
  }) => apiFetch<PayrollRun>('/hr/payroll', { method: 'POST', body: JSON.stringify(payload) }),

  /** La marca como pagada y registra el GASTO (así entra a la utilidad). */
  pay: (id: string, opts?: { payment_method?: string; register_expense?: boolean }) =>
    apiFetch<PayrollRun>(`/hr/payroll/${id}/pay`, {
      method: 'POST', body: JSON.stringify(opts ?? {}),
    }),

  remove: (id: string) => apiFetch(`/hr/payroll/${id}`, { method: 'DELETE' }),
};

/** Lo de RRHH que necesita atención (lo usa el menú de notificaciones). */
export const hrAlerts = {
  get: () => apiFetch<{
    empleados_activos: number;
    carne_vencido: string[];
    carne_por_vencer: string[];
    contrato_por_vencer: string[];
    ausencias_pendientes: number;
  }>('/hr/alerts'),
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

    /**
     * La nómina del tablero sale del MISMO cálculo que la planilla.
     *
     * Antes se calculaba acá aparte, y la comisión era un porcentaje del propio
     * salario: el tablero mostraba un número y la pantalla de planilla otro, sin
     * forma de saber cuál creer. Ahora los dos preguntan lo mismo al servidor.
     */
    let base = 0, commission = 0;
    try {
      const hoy = new Date();
      const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
      const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10);
      const p = await payrollService.preview(desde, hasta);
      base = p.lineas.reduce((t, l) => t + l.base_amount, 0);
      commission = p.lineas.reduce((t, l) => t + l.commission_amount, 0);
    } catch {
      // Si el cálculo no responde, se cae al salario del expediente: es mejor un
      // número aproximado que un cero que parece «no hay planilla».
      const activos = employees.filter(e => e.status === 'active');
      base = activos.reduce((s, e) => s + (Number(e.monthly_salary) || 0), 0);
    }

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
