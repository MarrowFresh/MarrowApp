// Delivery-app API client + session.
//
// Deliberately separate from the admin client: a rider's token is stored under
// its own key, so signing in on the delivery app never disturbs an admin session
// in the same browser (and vice versa). The rider's JWT carries role "delivery"
// and their staff id — the backend derives "my orders" from the token, never
// from anything the app sends.
import { useSyncExternalStore } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");

const TOKEN_KEY = "marrow_delivery_token";
const NAME_KEY  = "marrow_delivery_name";
const ID_KEY    = "marrow_delivery_id";

let token: string | null = localStorage.getItem(TOKEN_KEY);
let riderName: string    = localStorage.getItem(NAME_KEY) || "";
let riderId: string      = localStorage.getItem(ID_KEY) || "";

const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

export const riderAuth = {
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
  token: () => token,
  name: () => riderName,
  id: () => riderId,
  isAuthed: () => !!token,

  async login(phone: string, pin: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/delivery/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ phone, pin }),
    });
    if (!res.ok) {
      let msg = "Login failed";
      try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
      throw new Error(res.status === 401 ? "Invalid phone or PIN." : msg);
    }
    const data = await res.json();
    token = data.token;
    riderName = data.name || "";
    riderId = data.id || "";
    localStorage.setItem(TOKEN_KEY, token as string);
    localStorage.setItem(NAME_KEY, riderName);
    localStorage.setItem(ID_KEY, riderId);
    notify();
  },

  logout() {
    token = null; riderName = ""; riderId = "";
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(ID_KEY);
    notify();
  },
};

export function useRiderAuth(): string | null {
  return useSyncExternalStore(riderAuth.subscribe, () => token, () => token);
}

async function riderFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API_BASE}/api/delivery/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (res.status === 401) {
    riderAuth.logout();               // expired/invalid → back to the login screen
    throw new Error("Session expired. Please sign in again.");
  }
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res;
}

// ─── Types ───────────────────────────────────────────────────────────────────
export interface RiderLine {
  name: string;
  qty: number;
  price_each: number;
  weight_each: number;
}

export interface RiderOrder {
  id: string;
  order_no: number;
  status: string;
  customer_name: string;
  customer_phone?: string | null;
  address?: string | null;
  distance_km: number;
  grand_total: number;
  payment_method: string;
  payment_status: string;
  created_at?: string;
  delivered_at?: string | null;
  remarks?: string | null;
  remarks_at?: string | null;
  remarks_by?: string | null;
  items: RiderLine[];
}

// ─── Orders ──────────────────────────────────────────────────────────────────
export async function fetchMyOrders(): Promise<RiderOrder[]> {
  const res = await riderFetch("orders");
  return (await res.json()) as RiderOrder[];
}

export async function fetchMyOrder(id: string): Promise<RiderOrder> {
  const res = await riderFetch(`orders/${encodeURIComponent(id)}`);
  return (await res.json()) as RiderOrder;
}

// Advance the status and/or leave a remark. Either field may be omitted.
export async function updateMyOrder(
  id: string,
  input: { status?: string; remarks?: string }
): Promise<void> {
  await riderFetch(`orders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
