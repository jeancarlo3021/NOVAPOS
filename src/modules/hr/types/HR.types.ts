// ── Tipos del módulo de Recursos Humanos ──────────────────────────────────────

export type EmployeeStatus = 'active' | 'inactive' | 'vacation' | 'leave';
export type AttendanceStatus = 'in' | 'out' | 'break';
export type LeaveType = 'vacation' | 'sick' | 'personal' | 'maternity' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface Employee {
  id: string;
  tenant_id: string;
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
  health_cert_expires_at?: string;
  notes?: string;
  created_at?: string;
}

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
