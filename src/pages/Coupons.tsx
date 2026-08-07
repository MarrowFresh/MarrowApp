import { useState } from "react";
import { useDB } from "../useStore";
import { store } from "../lib/data";
import type { Coupon, CouponType } from "../lib/types";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");
const blank = (): Coupon => ({
  id: "", code: "", type: "percent", value: 10, min_order: 0,
  max_discount: null, first_order_only: false, active: true,
});

function describe(c: Coupon) {
  if (c.type === "percent")
    return `${c.value}% off${c.max_discount ? `, max ${inr(c.max_discount)}` : ""}`;
  if (c.type === "flat") return `${inr(c.value)} off`;
  return "Free delivery";
}

export default function Coupons() {
  const db = useDB();
  const [d, setD] = useState<Coupon>(blank());
  const set = (p: Partial<Coupon>) => setD({ ...d, ...p });

  const save = () => {
    store.upsertCoupon({ ...d, code: d.code.trim().toUpperCase(), id: store.uid() });
    setD(blank());
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Coupons</h1><div className="sub">Discount codes customers type at checkout</div></div>
      </div>

      <div className="panel">
        <h2>Create coupon</h2>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <div><label>Code</label><input style={{ width: 130 }} value={d.code}
            onChange={(e) => set({ code: e.target.value })} placeholder="WELCOME10" /></div>
          <div><label>Type</label>
            <select value={d.type} onChange={(e) => set({ type: e.target.value as CouponType })}>
              <option value="percent">Percent %</option>
              <option value="flat">Flat ₹ off</option>
              <option value="free_delivery">Free delivery</option>
            </select></div>
          {d.type !== "free_delivery" && (
            <div><label>{d.type === "percent" ? "Percent" : "Amount ₹"}</label>
              <input type="number" style={{ width: 90 }} value={d.value}
                onChange={(e) => set({ value: +e.target.value })} /></div>
          )}
          {d.type === "percent" && (
            <div><label>Max discount ₹</label><input type="number" style={{ width: 100 }}
              value={d.max_discount ?? ""} onChange={(e) => set({ max_discount: e.target.value ? +e.target.value : null })} /></div>
          )}
          <div><label>Min order ₹</label><input type="number" style={{ width: 90 }} value={d.min_order}
            onChange={(e) => set({ min_order: +e.target.value })} /></div>
          <div style={{ alignSelf: "end" }} className="row">
            <label className="row" style={{ margin: 0, gap: 5 }}>
              <input type="checkbox" checked={d.first_order_only}
                onChange={(e) => set({ first_order_only: e.target.checked })} /> 1st order
            </label>
          </div>
          <div style={{ alignSelf: "end" }}>
            <button className="btn primary" disabled={!d.code} onClick={save}>Add coupon</button>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Active coupons ({db.coupons.length})</h2>
        <table>
          <thead><tr><th>Code</th><th>Offer</th><th>Min order</th><th>1st only</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {db.coupons.map((c) => (
              <tr key={c.id}>
                <td><b>{c.code}</b></td>
                <td className="muted">{describe(c)}</td>
                <td>{c.min_order ? inr(c.min_order) : "—"}</td>
                <td>{c.first_order_only ? "Yes" : "—"}</td>
                <td>
                  <button className={"btn sm " + (c.active ? "accent" : "ghost")}
                    onClick={() => store.upsertCoupon({ ...c, active: !c.active })}>
                    {c.active ? "Active" : "Off"}
                  </button>
                </td>
                <td><button className="btn sm ghost" onClick={() => store.deleteCoupon(c.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
