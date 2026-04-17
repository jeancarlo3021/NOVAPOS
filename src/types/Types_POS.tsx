// ============ CASH MANAGEMENT TYPES ============

export interface CashDenomination {
  id: string;
  cash_session_id: string;
  denomination_value: number;
  denomination_type: 'billete' | 'moneda';
  quantity: number;
  subtotal: number;
  created_at: string;
  updated_at: string;
}

export interface CashSession {
  id: string;
  tenant_id: string;
  user_id: string;
  opening_amount: number;
  opening_date: string;
  closing_amount?: number;
  closing_date?: string;
  status: 'open' | 'closed';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CashMovement {
  id: string;
  cash_session_id: string;
  type: 'income' | 'expense' | 'sale';
  amount: number;
  description: string;
  reference_id?: string;
  created_at: string;
}

// ============ SALES TYPES ============

export interface Product {
  id: string;
  tenant_id: string;
  name: string;
  sku: string;
  description?: string;
  unit_price: number;
  cost_price?: number;
  category_id?: string;
  unit_type_id?: string;
  stock_quantity: number;
  min_stock_level?: number;
  max_stock_level?: number;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  product_id: string;
  product: Product;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  subtotal: number;
}

export interface ShoppingCart {
  items: CartItem[];
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
}

// ============ INVOICE TYPES ============

export interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  identification_number?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  discount_amount?: number;
  subtotal: number;
  created_at: string;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  cash_session_id: string;
  customer_id?: string;
  invoice_number: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  subtotal: number;
  discount_amount: number;
  discount_percent: number;
  tax_percent: number;
  tax_amount: number;
  total: number;
  payment_method: 'cash' | 'card' | 'check' | 'transfer';
  status: 'draft' | 'completed' | 'cancelled';
  notes?: string;
  issued_at: string;
  created_at: string;
  updated_at: string;
}

// ============ REPORT TYPES ============

export interface DailySalesReport {
  date: string;
  total_sales: number;
  total_transactions: number;
  total_discount: number;
  total_tax: number;
  payment_methods: {
    cash: number;
    card: number;
    check: number;
    transfer: number;
  };
}

export interface CashSummary {
  cash_session_id: string;
  opening_amount: number;
  total_income: number;
  total_expense: number;
  total_sales: number;
  expected_closing: number;
  actual_closing?: number;
  difference?: number;
}

// ============ CASH SESSION INPUT TYPES ============

export interface CreateCashSessionInput {
  tenant_id: string;
  user_id: string;
  opening_amount: number;
  notes?: string;
}

export interface CloseCashSessionInput {
  id: string;
  closing_amount: number;
  notes?: string;
}
