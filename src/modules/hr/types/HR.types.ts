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
  // ── Migración 149: lo que el impuesto sobre la renta necesita ──
  /** Hijos declarados, para el crédito familiar del impuesto. */
  dependents_children?: number;
  has_spouse?: boolean;
  /** Para los casos reales en que la retención no corre. */
  tax_exempt?: boolean;
}

/** Un renglón del desglose: «IVM, 4,33%, ₡21.650». */
export interface Renglon {
  id: string;
  label: string;
  pct: number;
  monto: number;
}

export type TipoDeduccion =
  | 'prestamo' | 'solidarista' | 'cooperativa' | 'pension_alimentaria'
  | 'embargo' | 'ahorro' | 'asociacion' | 'otro';

export const TIPOS_DEDUCCION: Array<{ id: TipoDeduccion; label: string; nota: string }> = [
  { id: 'prestamo', label: 'Préstamo', nota: 'Se rebaja en cuotas hasta saldarlo, y después se apaga solo.' },
  { id: 'solidarista', label: 'Asociación solidarista', nota: 'Normalmente un % del salario bruto.' },
  { id: 'cooperativa', label: 'Cooperativa', nota: 'Ahorro o crédito de la cooperativa.' },
  { id: 'pension_alimentaria', label: 'Pensión alimentaria', nota: 'Ordenada por un juzgado. No entra en el límite del salario inembargable.' },
  { id: 'embargo', label: 'Embargo judicial', nota: 'Sí entra en el límite del salario inembargable.' },
  { id: 'ahorro', label: 'Ahorro voluntario', nota: 'A solicitud del trabajador.' },
  { id: 'asociacion', label: 'Asociación o sindicato', nota: 'Cuota de afiliación.' },
  { id: 'otro', label: 'Otro', nota: '' },
];

/** Una deducción fija de un empleado: préstamo, solidarista, embargo. */
export interface DeduccionEmpleado {
  id: string;
  employee_id: string;
  tipo: TipoDeduccion;
  label: string;
  modo: 'fijo' | 'porcentaje';
  monto: number;
  pct: number;
  tope?: number | null;
  saldo_total?: number | null;
  saldo_restante?: number | null;
  desde?: string | null;
  hasta?: string | null;
  activo: boolean;
  notas?: string | null;
  created_at?: string;
}

/** Las tasas con las que se calcula la planilla. */
export interface TasaConfig { id: string; label: string; pct: number; nota?: string | null }

export interface TasasPlanilla {
  vigente: string;
  obrero: TasaConfig[];
  patronal: TasaConfig[];
  ins: { pct: number; label: string; nota: string; activo: boolean };
  renta: {
    activo: boolean;
    base: 'bruto' | 'bruto_menos_ccss';
    tramos: Array<{ desde: number; hasta: number | null; pct: number }>;
    credito_hijo: number;
    credito_conyuge: number;
  };
  bmc: { aplicar: boolean; sem: number; ivm: number; nota: string };
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
  // ── Migración 149: el desglose, congelado con la planilla ──
  employee_charges_detail?: Renglon[];
  income_tax?: number;
  income_tax_detail?: Renglon[];
  deductions_detail?: Renglon[];
  employer_charges?: number;
  employer_charges_detail?: Renglon[];
  ins_amount?: number;
  /** Sobre cuánto se calcularon las cuotas (puede ser la base mínima). */
  contribution_base?: number | null;
  /** Avisos de la línea. Nunca cambian un número: se muestran. */
  avisos?: string[];
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
  // ── Migración 149 ──
  employee_charges_detail?: Renglon[];
  employer_charges_detail?: Renglon[];
  other_deductions_detail?: Renglon[];
  income_tax?: number;
  ins_amount?: number;
  /** Las tasas con las que se calculó, tal cual estaban ese día. */
  rates_snapshot?: TasasPlanilla | null;
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
