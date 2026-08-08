// Marrow Fresh — shared types

export type Category =
  | "Chicken" | "Mutton" | "Fish" | "Prawns" | "Crabs" | "Eggs";

export type OrderStatus =
  // "Draft" = a website cart saved at checkout, not yet confirmed on WhatsApp.
  | "Draft" | "New" | "Cutting/Packing" | "Out for delivery" | "Delivered" | "Cancelled";

export interface Product {
  id: string;
  name: string;
  category: Category;
  unit: string;        // "1kg" | "500g" | "6" | "30"
  price: number;
  weight_kg: number;
  available: boolean;
}

export interface Combo {
  id: string;
  name: string;
  price: number;
  save_amount: number;
  free_delivery: boolean;
  weight_kg: number;   // summed from parts
  available: boolean;
}

export type CouponType = "percent" | "flat" | "free_delivery";

export interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  min_order: number;
  max_discount?: number | null;
  first_order_only: boolean;
  active: boolean;
}

// One condition inside a rule.
export interface RuleCondition {
  measure: "amount" | "weight" | "qty";
  scope: "all" | "category" | "product";
  target?: string | null;   // category name or product id
  op: ">=";
  value: number;
}

export interface Rule {
  id: string;
  name: string;
  conditions: RuleCondition[];
  match: "all" | "any";       // AND / OR — combination logic
  waive_delivery: boolean;
  waive_packing: boolean;
  active: boolean;
}

export interface Settings {
  base_delivery_fee: number;
  packing_fee_enabled: boolean;
  packing_fee: number;
  platform_fee_enabled: boolean;
  platform_fee_type: "flat" | "percent";
  platform_fee_value: number;
  default_tax_rate: number;          // % — 0 for fresh meat
  free_delivery_amount: number;      // shown in "add ₹X for free delivery" nudge
  min_order_value: number;
}

export interface CartLine {
  ref_id: string;       // product or combo id
  kind: "product" | "combo";
  name: string;
  category?: Category;  // undefined for combos
  qty: number;
  price_each: number;
  weight_each: number;
}

export interface Banner {
  id: string;
  title: string;
  image_url: string;
  link_to?: string;
  placement: "home_hero" | "carousel" | "popup" | "strip";
  start_date?: string;
  end_date?: string;
  active: boolean;
}

export interface Staff {
  id: string;
  name: string;
  phone: string;
  role: "admin" | "delivery";
  active: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  area?: string;
}

export interface Order {
  id: string;
  order_no: number;
  customer_name: string;
  customer_phone?: string | null;
  /** First order from this customer? seq = position in their history, count = lifetime total. */
  is_new_customer?: boolean;
  customer_order_seq?: number;
  customer_order_count?: number;
  address?: string;
  area?: string;
  status: OrderStatus;
  lines: CartLine[];
  subtotal: number;
  total_weight: number;
  coupon_code?: string;
  discount: number;
  delivery_fee: number;
  packing_fee: number;
  platform_fee: number;
  tax_total: number;
  grand_total: number;
  payment_method: "UPI" | "Cash";
  payment_status: "Paid" | "Unpaid";
  assigned_to?: string;   // staff id
  created_at: string;
}
