// ── Tipos del módulo de Recursos Humanos ──────────────────────────────────────

export type EmployeeStatus = 'active' | 'inactive' | 'vacation' | 'leave';
export type AttendanceStatus = 'in' | 'out' | 'break';
export type LeaveType = 'vacation' | 'sick' | 'personal' | 'maternity' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export type SalaryType = 'monthly' | 'hourly' | 'commission';
/** Sobre qué se calcula la comisión: lo que vendió, o su propio salario. */
export type CommissionBase = 'sales' | 'salary';

export interface Employee {
  id: string;
  tenant_id: string;
  /** Usuario del sistema con el que se vincula (habilita marcaje y comisión). */
  user_id?: string | null;
  full_name: string;
  identification?: string;
  email?: string;
  phone?: string;
  position: string;
  department: string;
  hourly_rate?: number;
  monthly_salary?: number;
  commission_pct?: number;
  hire_date: string;
  status: EmployeeStatus;
  health_cert_expires_at?: string | null;
  notes?: string;
  created_at?: string;
  // ── Migración 115 ──
  branch_id?: string | null;
  salary_type?: SalaryType;
  commission_base?: CommissionBase;
  payment_method?: string | null;
  bank_account?: string | null;
  birth_date?: string | null;
  emergency_contact?: string | null;
  emergency_phone?: string | null;
  contract_type?: string | null;
  contract_end_date?: string | null;
  vacation_days_per_year?: number | null;
  photo_url?: string | null;
  terminated_at?: string | null;
  termination_reason?: string | null;
}

/** Una línea de la planilla: un empleado en un período. */
export interface PayrollItem {
  id?: string;
  employee_id?: string | null;
  employee_name: string;
  position?: string | null;
  salary_type?: string | null;
  base_amount: number;
  hours?: number | null;
  hourly_rate?: number | null;
  commission_pct?: number | null;
  /** Ventas del período sobre las que se calculó la comisión. */
  commission_sales: number;
  commission_amount: number;
  bonuses: number;
  advances: number;
  other_deductions: number;
  employee_charges: number;
  gross: number;
  net: number;
  payment_method?: string | null;
  unpaid_days: number;
  notes?: string | null;
}

export interface PayrollRun {
  id: string;
  period_start: string;
  period_end: string;
  branch_id?: string | null;
  status: 'draft' | 'approved' | 'paid';
  gross: number;
  employee_charges: number;
  other_deductions: number;
  employer_charges: number;
  net: number;
  total_cost: number;
  employees_count: number;
  notes?: string | null;
  /** Gasto que generó al pagarse (así entra a los reportes de utilidad). */
  expense_id?: string | null;
  paid_at?: string | null;
  created_at?: string;
  items?: PayrollItem[];
}

export const SALARY_TYPE_LABELS: Record<SalaryType, string> = {
  monthly: 'Salario fijo al mes',
  hourly: 'Por hora trabajada',
  commission: 'Solo comisión',
};

export const CONTRACT_TYPES = ['Indefinido', 'Plazo fijo', 'Servicios profesionales', 'Ocasional'];

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  date: string;
  clock_in?: string;
  clock_out?: string;
  break_minutes?: number;
  hours_worked?: number;
  notes?: string;
  created_at: string;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  employee_name?: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
}

export const DEPARTMENTS = ['Cocina', 'Salón', 'Barra', 'Caja', 'Administración', 'Limpieza', 'Otro'];

export const STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  vacation: 'Vacaciones',
  leave: 'Incapacidad',
};

export const STATUS_COLORS: Record<EmployeeStatus, string> = {
  active: 'emerald',
  inactive: 'gray',
  vacation: 'blue',
  leave: 'amber',
};

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  vacation: 'Vacaciones',
  sick: 'Incapacidad',
  personal: 'Asunto personal',
  maternity: 'Maternidad/Paternidad',
  other: 'Otro',
};

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};
