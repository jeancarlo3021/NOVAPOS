export interface Product {
  id: string;
  name: string;
  sku?: string;
  description?: string;
  unit_price: number;
  stock_quantity: number;
  tenant_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface CartItem {
  product_id: string;
  product_name: string;
  product: Product;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

export interface CashSession {
  id: string;
  tenant_id: string;
  cash_register_id: string;
  status: 'open' | 'closed';
  opening_balance?: number;
  opening_amount?: number;
  closing_balance?: number;
  closing_amount?: number;
  opening_date: string;
  closing_date?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  tenant_id: string;
  cash_session_id: string;
  items: CartItem[];
  subtotal: number;
  tax_amount: number;
  total: number;
  payment_method: 'cash' | 'card' | 'sinpe';
  customer_name?: string;
  customer_phone?: string;
  status: 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface POSState {
  isOpen: boolean;
  cashierName: string;
  totalSales: number;
  transactionsCount: number;
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  method: 'cash' | 'card' | 'sinpe';
  reference?: string;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
}