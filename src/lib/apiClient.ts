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
