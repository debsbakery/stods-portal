// lib/types.ts — COMPLETE UPDATED VERSION

export interface Product {
  id: string;
  product_number: number | null;
  name: string;
  description: string | null;
  price: number;
  unit: string;
  min_quantity: number;
  max_quantity: number;
  image_url: string | null;
  code?: string | null; // ✅ Add this
  category: string | null;
  is_available: boolean;
  gst_applicable: boolean;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Customer {
  id: string;
  email: string;
  business_name: string | null;
  contact_name: string | null;
  phone: string | null;
  address: string | null;
  abn: string | null;
  balance: number;
  payment_terms: number;
  credit_limit: number | null;
  route_number: string | null;
  drop_number: number | null;
  last_statement_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  customer_id: string | null;
  customer_email: string;
  customer_business_name: string | null;
  customer_address: string | null;
  customer_abn: string | null;
  delivery_date: string;
  notes: string | null;
  status: "pending" | "invoiced" | "confirmed" | "preparing" | "delivered" | "cancelled";
  total_amount: number | null;
  source: string;
  invoice_number?: number;
  po_number?: string;
  docket_number?: string;
  copied_from_order_id: string | null;
  invoiced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  gst_applicable: boolean;
  created_at: string;
}

export interface OrderWithItems extends Order {
  order_items: OrderItem[];
}

export interface InvoiceNumber {
  id: number;
  order_id: string;
  invoice_number: number;
  created_at: string;
}

export interface CustomerPricing {
  id: string;
  customer_id: string;
  product_id: string;
  contract_price: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

export interface ShadowOrder {
  id: string;
  customer_id: string;
  product_id: string;
  default_quantity: number;
  display_order: number;
  created_at: string;
  updated_at: string;
  products?: Product;
}

export interface ARTransaction {
  id: string;
  customer_id: string;
  type: string;
  invoice_id: string | null;
  amount: number;
  balance_after: number | null;
  due_date: string | null;
  paid_date: string | null;
  description: string | null;
  created_at: string;
}

export interface ARAging {
  customer_id: string;
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_over_90: number;
  total_due: number;
  updated_at: string;
}

export interface Route {
  route_number: string;
  route_name: string | null;
  driver_name: string | null;
  start_time: string | null;
  notes: string | null;
}

export interface StandingOrder {
  id: string;
  customer_id: string;
  delivery_days: string;
  active: boolean;
  next_generation_date: string;
  last_generated_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface StandingOrderItem {
  id: string;
  standing_order_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
}