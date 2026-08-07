// =====================================================================
//  Local data store (seed + localStorage) for Phase A.
//  Mirrors the Supabase schema so we swap to the real DB later with
//  minimal change. Includes a tiny pub/sub so screens re-render on change.
// =====================================================================
import type {
  Banner, Combo, Coupon, Customer, Order, Product, Rule, Settings, Staff,
} from "./types";
import { fetchOrders, patchOrderStatus, patchOrderAssign, hasApi, auth } from "./apiClient";

const uid = () => Math.random().toString(36).slice(2, 10);

// --- SEED -------------------------------------------------------------
const seedProducts: Product[] = [
  { id: uid(), name: "Curry cut (skin)", category: "Chicken", unit: "1kg", price: 200, weight_kg: 1.0, available: true },
  { id: uid(), name: "Boneless", category: "Chicken", unit: "1kg", price: 280, weight_kg: 1.0, available: true },
  { id: uid(), name: "Whole dressed", category: "Chicken", unit: "1kg", price: 230, weight_kg: 1.0, available: true },
  { id: uid(), name: "Curry cut", category: "Mutton", unit: "1kg", price: 900, weight_kg: 1.0, available: true },
  { id: uid(), name: "Boneless", category: "Mutton", unit: "1kg", price: 980, weight_kg: 1.0, available: true },
  { id: uid(), name: "Rohu", category: "Fish", unit: "1kg", price: 260, weight_kg: 1.0, available: true },
  { id: uid(), name: "Seer (Surmai)", category: "Fish", unit: "1kg", price: 650, weight_kg: 1.0, available: true },
  { id: uid(), name: "Medium", category: "Prawns", unit: "500g", price: 600, weight_kg: 0.5, available: true },
  { id: uid(), name: "Mud crab", category: "Crabs", unit: "1kg", price: 700, weight_kg: 1.0, available: true },
  { id: uid(), name: "Country", category: "Eggs", unit: "6", price: 90, weight_kg: 0.0, available: true },
];

const seedCoupons: Coupon[] = [
  { id: uid(), code: "WELCOME10", type: "percent", value: 10, min_order: 300, max_discount: 100, first_order_only: true, active: true },
  { id: uid(), code: "FLAT50", type: "flat", value: 50, min_order: 500, max_discount: null, first_order_only: false, active: true },
  { id: uid(), code: "FREESHIP", type: "free_delivery", value: 0, min_order: 200, max_discount: null, first_order_only: false, active: true },
];

const seedRules: Rule[] = [
  { id: uid(), name: "Global: ₹500 or 2kg", match: "any", waive_delivery: true, waive_packing: true, active: true,
    conditions: [
      { measure: "amount", scope: "all", op: ">=", value: 500 },
      { measure: "weight", scope: "all", op: ">=", value: 2 },
    ] },
  { id: uid(), name: "Chicken ≥ 2kg", match: "all", waive_delivery: true, waive_packing: false, active: true,
    conditions: [{ measure: "weight", scope: "category", target: "Chicken", op: ">=", value: 2 }] },
  { id: uid(), name: "Mutton ≥ ₹800", match: "all", waive_delivery: true, waive_packing: true, active: true,
    conditions: [{ measure: "amount", scope: "category", target: "Mutton", op: ">=", value: 800 }] },
  { id: uid(), name: "Prawns ≥ ₹600", match: "all", waive_delivery: true, waive_packing: false, active: true,
    conditions: [{ measure: "amount", scope: "category", target: "Prawns", op: ">=", value: 600 }] },
];

const seedBanners: Banner[] = [
  { id: uid(), title: "Launch offer — 10% off first order", image_url: "", link_to: "WELCOME10", placement: "home_hero", active: true },
  { id: uid(), title: "Free delivery over ₹500", image_url: "", link_to: "", placement: "strip", active: true },
];

const seedStaff: Staff[] = [
  { id: uid(), name: "Owner", phone: "+91 94944 90991", role: "admin", active: true },
  { id: uid(), name: "Ravi (delivery)", phone: "+91 90000 00001", role: "delivery", active: true },
];

const seedSettings: Settings = {
  base_delivery_fee: 40,
  packing_fee_enabled: true,
  packing_fee: 10,
  platform_fee_enabled: false,
  platform_fee_type: "flat",
  platform_fee_value: 0,
  default_tax_rate: 0,
  free_delivery_amount: 500,
  min_order_value: 0,
};

// --- STORE ------------------------------------------------------------
interface DB {
  products: Product[];
  combos: Combo[];
  coupons: Coupon[];
  rules: Rule[];
  banners: Banner[];
  staff: Staff[];
  customers: Customer[];
  orders: Order[];
  settings: Settings;
}

const KEY = "marrow_db_v1";

function seed(): DB {
  return {
    products: seedProducts,
    combos: [],
    coupons: seedCoupons,
    rules: seedRules,
    banners: seedBanners,
    staff: seedStaff,
    customers: [],
    orders: [],
    settings: seedSettings,
  };
}

function load(): DB {
  const fresh = seed();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      // merge so a DB saved before a new field still gets sane defaults
      return { ...fresh, ...(JSON.parse(raw) as Partial<DB>) } as DB;
    }
  } catch {
    /* ignore */
  }
  localStorage.setItem(KEY, JSON.stringify(fresh));
  return fresh;
}

let db: DB = load();
const subs = new Set<() => void>();

// Skip notifying on the very first order load after login/startup.
let firstOrdersLoad = true;

// Browser notification for orders that appeared since the last poll.
function notifyNewOrders(fresh: Order[]) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const title = fresh.length === 1 ? `🔔 New order #${fresh[0].order_no}` : `🔔 ${fresh.length} new orders`;
    const body =
      fresh.length === 1
        ? `${fresh[0].customer_name} · ₹${Math.round(fresh[0].grand_total)}`
        : "Open Orders to view them";
    new Notification(title, { body });
  } catch {
    /* ignore */
  }
}

function persist() {
  // New top-level reference so useSyncExternalStore sees a changed snapshot and
  // re-renders (the mutations above happen in place on the previous object).
  db = { ...db };
  localStorage.setItem(KEY, JSON.stringify(db));
  subs.forEach((fn) => fn());
}

export const store = {
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
  get: () => db,
  resetSeed() {
    db = seed();
    persist();
  },

  // products
  upsertProduct(p: Product) {
    const i = db.products.findIndex((x) => x.id === p.id);
    if (i >= 0) db.products[i] = p;
    else db.products.push({ ...p, id: p.id || uid() });
    persist();
  },
  newProductId: uid,

  // settings
  saveSettings(s: Settings) {
    db.settings = s;
    persist();
  },

  // coupons
  upsertCoupon(c: Coupon) {
    const i = db.coupons.findIndex((x) => x.id === c.id);
    if (i >= 0) db.coupons[i] = c;
    else db.coupons.push({ ...c, id: c.id || uid() });
    persist();
  },
  deleteCoupon(id: string) {
    db.coupons = db.coupons.filter((x) => x.id !== id);
    persist();
  },

  // rules
  upsertRule(r: Rule) {
    const i = db.rules.findIndex((x) => x.id === r.id);
    if (i >= 0) db.rules[i] = r;
    else db.rules.push({ ...r, id: r.id || uid() });
    persist();
  },
  deleteRule(id: string) {
    db.rules = db.rules.filter((x) => x.id !== id);
    persist();
  },

  // banners
  upsertBanner(b: Banner) {
    const i = db.banners.findIndex((x) => x.id === b.id);
    if (i >= 0) db.banners[i] = b;
    else db.banners.push({ ...b, id: b.id || uid() });
    persist();
  },
  deleteBanner(id: string) {
    db.banners = db.banners.filter((x) => x.id !== id);
    persist();
  },

  uid,

  // orders
  // Load orders from the backend (real Supabase data). Replaces the local list.
  async refreshOrders() {
    if (!hasApi || !auth.isAuthed()) return;
    try {
      const incoming = await fetchOrders();
      const prevIds = new Set(db.orders.map((o) => o.id));
      const fresh = incoming.filter((o) => !prevIds.has(o.id));
      db.orders = incoming;
      persist();
      // Notify only for orders that appeared after the first load (i.e. genuinely new).
      if (!firstOrdersLoad && fresh.length > 0) notifyNewOrders(fresh);
      firstOrdersLoad = false;
    } catch (e) {
      console.warn("[admin] failed to load orders from backend", e);
    }
  },
  placeOrder(o: Omit<Order, "id" | "order_no" | "created_at">): string {
    const order_no =
      (db.orders.reduce((m, x) => Math.max(m, x.order_no), 1040)) + 1;
    const id = uid();
    db.orders.unshift({
      ...o,
      id,
      order_no,
      created_at: new Date().toISOString(),
    });
    persist();
    return id;
  },
  // Update status through the backend. The backend persists to Supabase and, when
  // the order is accepted (e.g. Cutting/Packing), sends the customer the WhatsApp
  // "Order Confirmed" message. Optimistically update locally, then reconcile.
  async setOrderStatus(
    id: string,
    status: Order["status"],
    extra?: { agentName?: string; agentPhone?: string },
  ) {
    const o = db.orders.find((x) => x.id === id);
    if (o) {
      o.status = status;
      persist();
    }
    if (hasApi) {
      try {
        await patchOrderStatus(id, status, extra);
      } catch (e) {
        console.warn("[admin] failed to update status on backend", e);
      }
      await store.refreshOrders();
    }
  },
  // Assign a delivery boy. Updates locally first (so the table and the delivery
  // app react immediately), then persists to the backend — orders.assigned_to is
  // a real FK to staff.id, so the assignment survives a refresh or another device.
  async assignOrder(id: string, staffId: string) {
    const o = db.orders.find((x) => x.id === id);
    const previous = o?.assigned_to;
    if (o) {
      o.assigned_to = staffId || undefined;
      persist();
    }

    if (!hasApi || !auth.isAuthed()) return;
    try {
      await patchOrderAssign(id, staffId || null);
    } catch (e) {
      // Roll back so the UI doesn't claim an assignment the server rejected.
      console.warn("[admin] failed to persist assignment", e);
      if (o) { o.assigned_to = previous; persist(); }
      throw e;
    }
  },
  markPaid(id: string) {
    const o = db.orders.find((x) => x.id === id);
    if (o) {
      o.payment_status = "Paid";
      persist();
    }
  },
};

// On startup, pull real orders from the backend (no-op if VITE_API_BASE is unset).
store.refreshOrders();
