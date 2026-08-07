import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDB } from "../useStore";
import { store } from "../lib/data";
import { priceOrder } from "../lib/pricing";
import type { CartLine } from "../lib/types";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

export default function NewOrder() {
  const db = useDB();
  const nav = useNavigate();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [coupon, setCoupon] = useState("");
  const [customer, setCustomer] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [pay, setPay] = useState<"UPI" | "Cash">("UPI");

  const breakdown = useMemo(
    () => priceOrder(lines, db.settings, db.rules, { couponCode: coupon, coupons: db.coupons }),
    [lines, db.settings, db.rules, db.coupons, coupon]
  );

  const addProduct = (id: string) => {
    const p = db.products.find((x) => x.id === id);
    if (!p) return;
    setLines((ls) => {
      const ex = ls.find((l) => l.ref_id === id);
      if (ex) return ls.map((l) => (l.ref_id === id ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, {
        ref_id: p.id, kind: "product", name: `${p.category} · ${p.name}`,
        category: p.category, qty: 1, price_each: p.price, weight_each: p.weight_kg,
      }];
    });
  };

  const setQty = (id: string, qty: number) =>
    setLines((ls) =>
      qty <= 0 ? ls.filter((l) => l.ref_id !== id)
        : ls.map((l) => (l.ref_id === id ? { ...l, qty } : l)));

  const place = () => {
    store.placeOrder({
      customer_name: customer || "Walk-in",
      address,
      area,
      status: "New",
      lines,
      subtotal: breakdown.subtotal,
      total_weight: breakdown.total_weight,
      coupon_code: breakdown.coupon_applied,
      discount: breakdown.discount,
      delivery_fee: breakdown.delivery_fee,
      packing_fee: breakdown.packing_fee,
      platform_fee: breakdown.platform_fee,
      tax_total: breakdown.tax_total,
      grand_total: breakdown.grand_total,
      payment_method: pay,
      payment_status: "Unpaid",
    });
    nav("/orders");
  };

  return (
    <>
      <div className="page-head">
        <div><h1>New Order</h1><div className="sub">Type in a WhatsApp order — pricing is automatic</div></div>
      </div>

      <div className="grid2">
        {/* LEFT: pick products */}
        <div className="panel">
          <h2>Add items</h2>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {db.products.filter((p) => p.available).map((p) => (
              <button key={p.id} className="btn ghost sm" onClick={() => addProduct(p.id)}>
                {p.category} {p.name} · {inr(p.price)}
              </button>
            ))}
          </div>

          <h2 style={{ marginTop: 18 }}>Cart</h2>
          {lines.length === 0 ? <p className="muted">Click items above to add.</p> : (
            <table>
              <thead><tr><th>Item</th><th>Qty</th><th className="right">Amount</th><th></th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.ref_id}>
                    <td>{l.name}<div className="muted" style={{ fontSize: 11 }}>{l.weight_each}kg · {inr(l.price_each)} ea</div></td>
                    <td>
                      <input type="number" min={0} step="0.5" style={{ width: 64 }} value={l.qty}
                        onChange={(e) => setQty(l.ref_id, +e.target.value)} />
                    </td>
                    <td className="right">{inr(l.qty * l.price_each)}</td>
                    <td><button className="btn sm ghost" onClick={() => setQty(l.ref_id, 0)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* RIGHT: pricing + place */}
        <div className="panel">
          <h2>Bill</h2>
          <div className="row" style={{ marginBottom: 10 }}>
            <input placeholder="Coupon code (e.g. WELCOME10)" value={coupon}
              onChange={(e) => setCoupon(e.target.value)} style={{ flex: 1 }} />
          </div>
          {breakdown.coupon_error && <div className="muted" style={{ color: "var(--bad)", fontSize: 12, marginBottom: 8 }}>{breakdown.coupon_error}</div>}

          <div className="tot-line"><span>Subtotal</span><span>{inr(breakdown.subtotal)}</span></div>
          <div className="tot-line"><span className="muted">Total weight</span><span className="muted">{breakdown.total_weight} kg</span></div>
          {breakdown.discount > 0 && (
            <div className="tot-line"><span>Coupon {breakdown.coupon_applied}</span><span>−{inr(breakdown.discount)}</span></div>
          )}
          <div className="tot-line">
            <span>Delivery</span>
            <span>{breakdown.delivery_waived ? <span className="free">FREE</span> : inr(breakdown.delivery_fee)}</span>
          </div>
          {db.settings.packing_fee_enabled && (
            <div className="tot-line">
              <span>Packing</span>
              <span>{breakdown.packing_waived ? <span className="free">FREE</span> : inr(breakdown.packing_fee)}</span>
            </div>
          )}
          {db.settings.platform_fee_enabled && (
            <div className="tot-line"><span>Platform fee</span><span>{inr(breakdown.platform_fee)}</span></div>
          )}
          <div className="tot-line"><span className="muted">Tax (fresh — exempt)</span><span className="muted">{inr(breakdown.tax_total)}</span></div>
          <div className="tot-line grand"><span>Total</span><span>{inr(breakdown.grand_total)}</span></div>

          {breakdown.free_delivery_nudge && <div className="nudge">💡 {breakdown.free_delivery_nudge}</div>}

          <div style={{ height: 16 }} />
          <div className="grid2">
            <div><label>Customer name</label><input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Walk-in" /></div>
            <div><label>Area</label><input value={area} onChange={(e) => setArea(e.target.value)} placeholder="KPHB Phase 4" /></div>
          </div>
          <div style={{ height: 10 }} />
          <label>Delivery address</label>
          <input style={{ width: "100%" }} value={address} onChange={(e) => setAddress(e.target.value)}
            placeholder="Flat / house, street, landmark" />
          <div style={{ height: 10 }} />
          <label>Payment</label>
          <div className="row">
            <button className={"btn sm " + (pay === "UPI" ? "accent" : "ghost")} onClick={() => setPay("UPI")}>UPI</button>
            <button className={"btn sm " + (pay === "Cash" ? "accent" : "ghost")} onClick={() => setPay("Cash")}>Cash</button>
          </div>

          <div style={{ height: 16 }} />
          <button className="btn primary" style={{ width: "100%" }} disabled={lines.length === 0} onClick={place}>
            Place order · {inr(breakdown.grand_total)}
          </button>
        </div>
      </div>
    </>
  );
}
