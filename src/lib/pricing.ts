// =====================================================================
//  MARROW FRESH — Pricing engine (the brain)
//  items -> coupon -> delivery -> packing -> platform -> tax -> total
//  Flexible, rules-driven waivers (amount / weight / category / combo AND-OR)
// =====================================================================
import type { CartLine, Coupon, Rule, RuleCondition, Settings } from "./types";

export interface PriceBreakdown {
  subtotal: number;
  total_weight: number;
  discount: number;
  coupon_applied?: string;
  coupon_error?: string;
  delivery_fee: number;
  delivery_waived: boolean;
  packing_fee: number;
  packing_waived: boolean;
  platform_fee: number;
  tax_total: number;
  grand_total: number;
  free_delivery_nudge?: string;   // "Add ₹80 for free delivery"
}

const round = (n: number) => Math.round(n * 100) / 100;

// --- metric helpers: aggregate the cart for a rule condition --------
function measureValue(
  lines: CartLine[],
  c: RuleCondition
): number {
  const pick = lines.filter((l) => {
    if (c.scope === "all") return true;
    if (c.scope === "category") return l.category === c.target;
    if (c.scope === "product") return l.ref_id === c.target;
    return false;
  });
  if (c.measure === "amount")
    return pick.reduce((s, l) => s + l.qty * l.price_each, 0);
  if (c.measure === "weight")
    return pick.reduce((s, l) => s + l.qty * l.weight_each, 0);
  // qty
  return pick.reduce((s, l) => s + l.qty, 0);
}

function conditionMet(lines: CartLine[], c: RuleCondition): boolean {
  return measureValue(lines, c) >= c.value;   // op is always ">=" for now
}

function ruleMatches(lines: CartLine[], rule: Rule): boolean {
  if (!rule.active || rule.conditions.length === 0) return false;
  return rule.match === "all"
    ? rule.conditions.every((c) => conditionMet(lines, c))
    : rule.conditions.some((c) => conditionMet(lines, c));
}

// --- main ------------------------------------------------------------
export function priceOrder(
  lines: CartLine[],
  settings: Settings,
  rules: Rule[],
  opts: { couponCode?: string; coupons?: Coupon[] } = {}
): PriceBreakdown {
  const subtotal = round(lines.reduce((s, l) => s + l.qty * l.price_each, 0));
  const total_weight = round(
    lines.reduce((s, l) => s + l.qty * l.weight_each, 0)
  );

  // 1) Coupon -------------------------------------------------------
  let discount = 0;
  let coupon_applied: string | undefined;
  let coupon_error: string | undefined;
  let couponFreeDelivery = false;

  const code = opts.couponCode?.trim().toUpperCase();
  if (code) {
    const c = (opts.coupons ?? []).find(
      (x) => x.code.toUpperCase() === code && x.active
    );
    if (!c) {
      coupon_error = "Invalid or inactive code";
    } else if (subtotal < c.min_order) {
      coupon_error = `Min order ₹${c.min_order} for ${c.code}`;
    } else {
      coupon_applied = c.code;
      if (c.type === "percent") {
        discount = (subtotal * c.value) / 100;
        if (c.max_discount != null) discount = Math.min(discount, c.max_discount);
      } else if (c.type === "flat") {
        discount = Math.min(c.value, subtotal);
      } else if (c.type === "free_delivery") {
        couponFreeDelivery = true;
      }
    }
  }
  discount = round(discount);

  // 2) Rules — evaluate waivers ------------------------------------
  let delivery_waived = couponFreeDelivery;
  let packing_waived = false;
  for (const r of rules) {
    if (ruleMatches(lines, r)) {
      if (r.waive_delivery) delivery_waived = true;
      if (r.waive_packing) packing_waived = true;
    }
  }

  // 3) Delivery fee -------------------------------------------------
  const delivery_fee =
    lines.length === 0 || delivery_waived ? 0 : round(settings.base_delivery_fee);

  // 4) Packing fee --------------------------------------------------
  const packing_fee =
    !settings.packing_fee_enabled || packing_waived || lines.length === 0
      ? 0
      : round(settings.packing_fee);

  // 5) Platform fee -------------------------------------------------
  let platform_fee = 0;
  if (settings.platform_fee_enabled && lines.length > 0) {
    platform_fee =
      settings.platform_fee_type === "percent"
        ? (subtotal * settings.platform_fee_value) / 100
        : settings.platform_fee_value;
  }
  platform_fee = round(platform_fee);

  // 6) Tax (fresh meat = 0%) ---------------------------------------
  const taxable = Math.max(0, subtotal - discount);
  const tax_total = round((taxable * settings.default_tax_rate) / 100);

  // 7) Grand total --------------------------------------------------
  const grand_total = round(
    subtotal - discount + delivery_fee + packing_fee + platform_fee + tax_total
  );

  // Nudge: how much more to reach free delivery (by amount)
  let free_delivery_nudge: string | undefined;
  if (!delivery_waived && subtotal > 0 && subtotal < settings.free_delivery_amount) {
    const gap = round(settings.free_delivery_amount - subtotal);
    free_delivery_nudge = `Add ₹${gap} more for FREE delivery`;
  }

  return {
    subtotal,
    total_weight,
    discount,
    coupon_applied,
    coupon_error,
    delivery_fee,
    delivery_waived,
    packing_fee,
    packing_waived,
    platform_fee,
    tax_total,
    grand_total,
    free_delivery_nudge,
  };
}
