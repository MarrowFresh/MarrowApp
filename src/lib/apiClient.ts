// Admin → backend API client + auth.
//
// Login goes through the backend (POST /api/auth/login), which validates against
// Supabase Auth and returns a short-lived admin JWT. The token is stored locally and
// sent as a Bearer on every /api/admin/* call. A 401 clears the session so the app
// falls back to the login screen.
import { useSyncExternalStore } from "react";
import type { Order, OrderStatus } from "./types";

// Empty base = same-origin (the admin is served from the backend itself), so calls
// go to a relative "/api/...". Set VITE_API_BASE only when hosting the admin on a
// different origin than the backend.
const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");
export const hasApi = true;

const TOKEN_KEY = "marrow_admin_token";
const EMAIL_KEY = "marrow_admin_email";

let token: string | null = localStorage.getItem(TOKEN_KEY);
let email: string = localStorage.getItem(EMAIL_KEY) || "";
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

// ─── Auth store (subscribe for re-render on login/logout) ────────────────────
export const auth = {
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
  token: () => token,
  email: () => email,
  isAuthed: () => !!token,

  async login(em: string, pw: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: em, password: pw }),
    });
    if (!res.ok) {
      let msg = "Login failed";
      try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
      throw new Error(res.status === 401 ? "Invalid email or password." : msg);
    }
    const data = await res.json();
    token = data.token;
    email = data.email || em;
    localStorage.setItem(TOKEN_KEY, token as string);
    localStorage.setItem(EMAIL_KEY, email);
    notify();
  },

  logout() {
    token = null;
    email = "";
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    notify();
  },
};

// React hook — returns the current token (null when logged out).
export function useAuth(): string | null {
  return useSyncExternalStore(auth.subscribe, () => token, () => token);
}

// ─── Authenticated fetch ─────────────────────────────────────────────────────
async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API_BASE}/api/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (res.status === 401) {
    auth.logout(); // token expired/invalid → back to login
    throw new Error("Session expired. Please sign in again.");
  }
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res;
}

// ─── Admin data ──────────────────────────────────────────────────────────────
export async function fetchOrders(): Promise<Order[]> {
  const res = await authFetch("admin/orders");
  return (await res.json()) as Order[];
}

export interface StatusExtra { agentName?: string; agentPhone?: string; }

export async function patchOrderStatus(
  id: string, status: OrderStatus, extra?: StatusExtra,
): Promise<void> {
  const body: Record<string, unknown> = { status };
  if (extra?.agentName) body.agent_name = extra.agentName;
  if (extra?.agentPhone) body.agent_phone = extra.agentPhone;
  await authFetch(`admin/orders/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// ─── Delivery staff ──────────────────────────────────────────────────────────
// Staff live in the database (orders.assigned_to is a FK to staff.id), so the
// dropdown and the assignment both work across browsers and machines.
export interface StaffMember {
  id: string;
  name: string;
  phone: string;
  role: "admin" | "delivery";
  active: boolean;
  /** Set once the rider links their Telegram; null = they get no Telegram ping. */
  telegram_chat_id?: string | null;
}

export async function fetchStaff(role?: "delivery" | "admin"): Promise<StaffMember[]> {
  const res = await authFetch(`admin/staff${role ? `?role=${role}` : ""}`);
  return (await res.json()) as StaffMember[];
}

export async function createStaff(input: {
  name: string;
  phone: string;
  role?: "delivery" | "admin";
  /** Exactly 6 digits — required for delivery staff, who sign in with it. */
  pin?: string;
}): Promise<StaffMember> {
  const res = await authFetch("admin/staff", { method: "POST", body: JSON.stringify(input) });
  const rows = (await res.json()) as StaffMember[];
  return rows[0];
}

// Reset a rider's PIN (they forgot it). The plain PIN is hashed server-side.
export async function resetStaffPin(staffId: string, pin: string): Promise<void> {
  await authFetch(`admin/staff/${encodeURIComponent(staffId)}/pin`, {
    method: "PATCH",
    body: JSON.stringify({ pin }),
  });
}

// Admin acting for a rider with no signal: set delivery status and/or a remark.
export async function patchOrderDelivery(
  orderId: string,
  input: { status?: string; remarks?: string }
): Promise<void> {
  await authFetch(`admin/orders/${encodeURIComponent(orderId)}/delivery`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// Persist the delivery boy on the order. Pass null to clear.
export async function patchOrderAssign(orderId: string, staffId: string | null): Promise<void> {
  await authFetch(`admin/orders/${encodeURIComponent(orderId)}/assign`, {
    method: "PATCH",
    body: JSON.stringify({ staff_id: staffId }),
  });
}

// ─── Catalog & config (settings, coupons, rules, products, banners) ──────────
//
// These used to live in localStorage, which meant an edit here never reached the
// database — the bot, the website and the pricing engine kept reading the seeded
// values. Everything now goes through the backend.
//
// Deactivate rather than delete: orders reference products and coupon codes, so
// removing a row would orphan history.
async function getJson<T>(path: string): Promise<T> {
  const res = await authFetch(path);
  return (await res.json()) as T;
}

const send = (path: string, method: string, body?: unknown) =>
  authFetch(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const adminApi = {
  // settings is a single row
  getSettings: async () => (await getJson<any[]>("admin/settings"))[0] ?? null,
  saveSettings: (patch: Record<string, unknown>) => send("admin/settings", "PUT", patch),

  getCoupons: () => getJson<any[]>("admin/coupons"),
  createCoupon: (c: Record<string, unknown>) => send("admin/coupons", "POST", c),
  updateCoupon: (id: string, c: Record<string, unknown>) =>
    send(`admin/coupons/${encodeURIComponent(id)}`, "PATCH", c),
  deactivateCoupon: (id: string) => send(`admin/coupons/${encodeURIComponent(id)}`, "DELETE"),

  getRules: () => getJson<any[]>("admin/rules"),
  createRule: (r: Record<string, unknown>) => send("admin/rules", "POST", r),
  updateRule: (id: string, r: Record<string, unknown>) =>
    send(`admin/rules/${encodeURIComponent(id)}`, "PATCH", r),
  deactivateRule: (id: string) => send(`admin/rules/${encodeURIComponent(id)}`, "DELETE"),

  getProducts: () => getJson<any[]>("admin/products"),
  updateProduct: (id: string, p: Record<string, unknown>) =>
    send(`admin/products/${encodeURIComponent(id)}`, "PATCH", p),
  deactivateProduct: (id: string) => send(`admin/products/${encodeURIComponent(id)}`, "DELETE"),
  updateVariant: (id: string, v: Record<string, unknown>) =>
    send(`admin/variants/${encodeURIComponent(id)}`, "PATCH", v),

  getContacts: () => getJson<any>("admin/contacts"),

  getBanners: () => getJson<any[]>("admin/banners"),
  createBanner: (b: Record<string, unknown>) => send("admin/banners", "POST", b),
  updateBanner: (id: string, b: Record<string, unknown>) =>
    send(`admin/banners/${encodeURIComponent(id)}`, "PATCH", b),
  deactivateBanner: (id: string) => send(`admin/banners/${encodeURIComponent(id)}`, "DELETE"),
};

// ─── Order detail ────────────────────────────────────────────────────────────
export interface OrderDetailLine {
  name: string;
  qty: number;
  price_each: number;
  weight_each: number;
  line_total: number;
}
export interface OrderDetailCategory {
  category: string;
  items: OrderDetailLine[];
}
export interface OrderDetail {
  id: string;
  order_no: number;
  status: OrderStatus;
  created_at?: string;
  delivered_at?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  is_new_customer?: boolean;
  customer_order_seq?: number;
  customer_order_count?: number;
  assigned_to?: string | null;
  agent_name?: string | null;
  agent_phone?: string | null;
  remarks?: string | null;
  remarks_at?: string | null;
  remarks_by?: string | null;
  delivery_address?: string | null;
  branch?: string | null;
  distance_km: number;
  instructions?: string | null;
  payment_method: string;
  payment_status: string;
  coupon_code?: string | null;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  packing_fee: number;
  platform_fee: number;
  tax_total: number;
  grand_total: number;
  total_weight: number;
  categories: OrderDetailCategory[];
}

export async function fetchOrderDetail(id: string): Promise<OrderDetail> {
  const res = await authFetch(`admin/orders/${encodeURIComponent(id)}`);
  return (await res.json()) as OrderDetail;
}
