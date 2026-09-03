import { adminApi } from "./apiClient";

// One status per product, instead of three switches that could contradict each
// other.
//
// The shop was operating three separate controls — On sale/Hidden on the
// product, Available/Sold out on every pack, and Mark as pre-order — and nothing
// stopped them disagreeing. A product could be Hidden AND pre-order, which is
// two answers to one question.
//
// Nothing new is stored. The status is derived from what the database already
// holds, and choosing one writes whichever combination produces it. Per-pack
// Sold out stays as the finer control for "only the 250g has gone".
export type ProductStatus = "available" | "soldout" | "preorder" | "hidden";

export const STATUS: {
  id: ProductStatus; label: string; hint: string; pill: string;
}[] = [
  {
    id: "available", label: "Available now", pill: "ON SALE",
    hint: "On the shelf. Customers add it to the basket and check out as normal.",
  },
  {
    id: "soldout", label: "Sold out", pill: "SOLD OUT",
    hint: "Finished for today. Still listed — struck through, so people know to come back — but nothing can be added.",
  },
  {
    id: "preorder", label: "Pre-order", pill: "PRE-ORDER",
    hint: "Never stocked; sourced when someone asks. Listed last with a WhatsApp button instead of Add.",
  },
  {
    id: "hidden", label: "Hidden", pill: "HIDDEN",
    hint: "Not part of the shop right now. Gone from the website, WhatsApp and the app entirely — nobody knows it exists.",
  },
];

/// What a product's rows add up to.
///
/// Order matters: hidden beats everything (nobody sees it, so nothing else is
/// true of it), then pre-order (which is out of stock by definition, so asking
/// about packs would always answer "sold out").
export function statusOf(p: Record<string, any>): ProductStatus {
  if (p.available === false) return "hidden";
  if (p.preorder) return "preorder";

  const variants: Record<string, any>[] = p.product_variants || p.variants || [];
  if (variants.length > 0 && variants.every((v) => v.available === false)) return "soldout";

  return "available";
}

/// Apply a status by writing whatever combination produces it.
///
/// "Sold out" and "Available now" both touch every pack, because at product
/// level they mean all of them. Anyone who wants just the 250g gone uses the
/// per-pack switch instead — that is a different, finer statement.
export async function applyStatus(
  p: Record<string, any>,
  status: ProductStatus,
): Promise<void> {
  const variants: Record<string, any>[] = p.product_variants || p.variants || [];

  await adminApi.updateProduct(p.id, {
    available: status !== "hidden",
    preorder: status === "preorder",
  });

  // Hidden and pre-order say nothing about individual packs, so leave them be —
  // un-hiding a product should restore exactly the packs it had.
  if (status === "soldout" || status === "available") {
    const wanted = status === "available";
    for (const v of variants) {
      // A hidden pack is withdrawn from sale — a size we no longer offer. Putting
      // the product back on sale must not quietly bring it back.
      if (v.hidden === true) continue;
      if (v.available !== wanted) {
        await adminApi.updateVariant(v.id, { available: wanted });
      }
    }
  }
}

/// A pack has the same three answers a product does, minus pre-order — that is
/// a property of the whole product, not of one size of it.
export type PackStatus = "available" | "soldout" | "hidden";

export function packStatus(v: Record<string, any>): PackStatus {
  if (v.hidden === true) return "hidden";
  return v.available === false ? "soldout" : "available";
}
