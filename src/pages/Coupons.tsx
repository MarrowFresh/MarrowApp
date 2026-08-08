import { useState } from "react";
import { adminApi } from "../lib/apiClient";
import { useResource } from "../lib/useResource";

// Discount codes, stored in the database so the website and the bot both honour
// them. Limits (usage, per-customer, validity, first-order) are enforced by the
// backend at checkout — not just displayed here.
type Row = Record<string, any>;

const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN");

const blank = (): Row => ({
  code: "", type: "percent", value: 10, min_order: 0, max_discount: null,
  first_order_only: false, usage_limit: null, per_customer_limit: null,
  valid_from: "", valid_to: "", active: true,
});

function describe(c: Row) {
  if (c.type === "percent")
    return `${c.value}% off${c.max_discount ? `, max ${inr(c.max_discount)}` : ""}`;
  if (c.type === "flat") return `${inr(c.value)} off`;
  return "Free delivery";
}

function limits(c: Row) {
  const bits: string[] = [];
  if (c.first_order_only) bits.push("1st order only");
  if (c.usage_limit) bits.push(`${c.used_count ?? 0}/${c.usage_limit} used`);
  if (c.per_customer_limit) bits.push(`${c.per_customer_limit}× per customer`);
  if (c.valid_to) bits.push(`until ${new Date(c.valid_to).toLocaleDateString("en-IN")}`);
  return bits.length ? bits.join(" · ") : "—";
}

export default function Coupons() {
  const { data: coupons, loading, error, saving, mutate } = useResource<Row[]>(adminApi.getCoupons, []);
  const [d, setD] = useState<Row>(blank());
  const set = (p: Row) => setD((c) => ({ ...c, ...p }));

  const add = async () => {
    const payload: Row = {
      code: d.code.trim().toUpperCase(),
      type: d.type,
      value: d.type === "free_delivery" ? 0 : Number(d.value || 0),
      min_order: Number(d.min_order || 0),
      max_discount: d.type === "percent" && d.max_discount ? Number(d.max_discount) : null,
      first_order_only: !!d.first_order_only,
      usage_limit: d.usage_limit ? Number(d.usage_limit) : null,
      per_customer_limit: d.per_customer_limit ? Number(d.per_customer_limit) : null,
      valid_from: d.valid_from || null,
      valid_to: d.valid_to || null,
      active: true,
    };
    if (await mutate(() => adminApi.createCoupon(payload))) setD(blank());
  };

  const toggle = (c: Row) => mutate(() => adminApi.updateCoupon(c.id, { active: !c.active }));

  const deactivate = (c: Row) => {
    if (window.confirm(
      `Turn off ${c.code}?\n\nIt stops working immediately. Past orders that used it are unaffected.`
    )) mutate(() => adminApi.deactivateCoupon(c.id));
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Coupons</h1><div className="sub">Discount codes customers type at checkout</div></div>
      </div>

      {error && <div className="panel"><span style={{ color: "#c0392b" }}>{error}</span></div>}

      <div className="panel">
        <h2>Create coupon</h2>
        <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
          <div><label>Code</label><input style={{ width: 130 }} value={d.code}
            onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="WELCOME10" /></div>

          <div><label>Type</label>
            <select value={d.type} onChange={(e) => set({ type: e.target.value })}>
              <option value="percent">Percent %</option>
              <option value="flat">Flat ₹ off</option>
              <option value="free_delivery">Free delivery</option>
            </select></div>

          {d.type !== "free_delivery" && (
            <div><label>{d.type === "percent" ? "Percent" : "Amount ₹"}</label>
              <input type="number" style={{ width: 90 }} value={d.value}
                onChange={(e) => set({ value: e.target.value })} /></div>
          )}
          {d.type === "percent" && (
            <div><label>Max discount ₹</label><input type="number" style={{ width: 110 }}
              value={d.max_discount ?? ""} onChange={(e) => set({ max_discount: e.target.value })} /></div>
          )}

          <div><label>Min order ₹</label><input type="number" style={{ width: 100 }} value={d.min_order}
            onChange={(e) => set({ min_order: e.target.value })} /></div>

          <div><label>Total uses</label><input type="number" style={{ width: 95 }} placeholder="∞"
            value={d.usage_limit ?? ""} onChange={(e) => set({ usage_limit: e.target.value })} /></div>

          <div><label>Per customer</label><input type="number" style={{ width: 100 }} placeholder="∞"
            value={d.per_customer_limit ?? ""} onChange={(e) => set({ per_customer_limit: e.target.value })} /></div>

          <div><label>Valid from</label><input type="date" value={d.valid_from || ""}
            onChange={(e) => set({ valid_from: e.target.value })} /></div>

          <div><label>Valid to</label><input type="date" value={d.valid_to || ""}
            onChange={(e) => set({ valid_to: e.target.value })} /></div>

          <label className="row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={!!d.first_order_only}
              onChange={(e) => set({ first_order_only: e.target.checked })} /> 1st order only
          </label>

          <button className="btn primary" disabled={saving || !d.code.trim()} onClick={add}>
            {saving ? "Saving…" : "Add coupon"}
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Coupons ({coupons.length})</h2>
        {loading ? <p className="muted">Loading…</p> : coupons.length === 0 ? (
          <p className="muted">No coupons yet.</p>
        ) : (
          <table>
            <thead><tr><th>Code</th><th>Offer</th><th>Min order</th><th>Limits</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.code}</b></td>
                  <td className="muted">{describe(c)}</td>
                  <td>{c.min_order ? inr(c.min_order) : "—"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{limits(c)}</td>
                  <td>
                    <button className={"btn sm " + (c.active ? "accent" : "ghost")}
                      disabled={saving} onClick={() => toggle(c)}>
                      {c.active ? "Active" : "Off"}
                    </button>
                  </td>
                  <td>
                    {c.active && (
                      <button className="btn sm ghost" disabled={saving} onClick={() => deactivate(c)}>
                        Turn off
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Coupons are turned off rather than deleted — past orders reference the code.
        </p>
      </div>
    </>
  );
}
