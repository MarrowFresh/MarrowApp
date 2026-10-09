import { useState } from "react";
import ConditionsEditor, { blankCondition, conditionsText } from "../components/ConditionsEditor";
import type { RuleCondition } from "../lib/types";
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
  // No conditions is the old behaviour: qualify on min_order alone.
  conditions: [], match: "any",
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
  const [editing, setEditing] = useState<string | null>(null);   // coupon id being edited
  const [clash, setClash] = useState<string | null>(null);       // id of the code that already exists
  const set = (p: Row) => setD((c) => ({ ...c, ...p }));

  // Both buttons build the same shape — the only difference is where it goes.
  const payload = (): Row => ({
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
    conditions: d.conditions ?? [],
    match: d.match || "any",
  });

  const startEdit = (c: Row) => {
    setEditing(c.id);
    setClash(null);
    setD({
      ...blank(),
      ...c,
      // Date inputs need yyyy-mm-dd, and the API returns timestamps.
      valid_from: c.valid_from ? String(c.valid_from).slice(0, 10) : "",
      valid_to: c.valid_to ? String(c.valid_to).slice(0, 10) : "",
      max_discount: c.max_discount ?? null,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => { setEditing(null); setClash(null); setD(blank()); };

  const save = async () => {
    setClash(null);
    if (editing) {
      if (await mutate(() => adminApi.updateCoupon(editing, payload()))) cancelEdit();
      return;
    }

    // A code that already exists comes back as a 409 carrying the existing row,
    // because "turn off" keeps the code — so the usual fix is to edit that one,
    // not to invent a new code.
    const ok = await mutate(async () => {
      const res = await adminApi.createCoupon({ ...payload(), active: true });
      return res;
    });
    if (ok) { setD(blank()); return; }

    const hit = coupons.find((c) => c.code === d.code.trim().toUpperCase());
    if (hit) setClash(hit.id);
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
        <h2>{editing ? `Edit ${d.code}` : "Create coupon"}</h2>

        {clash && (
          <div className="clash">
            <span>
              <b>{d.code.trim().toUpperCase()}</b> already exists. Codes are kept when a coupon is
              switched off, so edit that one instead of creating a second.
            </span>
            <button
              className="btn sm accent"
              onClick={() => {
                const c = coupons.find((x) => x.id === clash);
                if (c) startEdit(c);
              }}
            >
              Edit it
            </button>
          </div>
        )}

        <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
          <div><label>Code</label><input style={{ width: 130 }} value={d.code}
            disabled={!!editing}
            title={editing ? "The code can't change — orders reference it" : undefined}
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

        </div>

        {/* Conditions. "Min order ₹" above is one rupee threshold for the whole
            shop, which cannot be fair when ₹400 is 400g of mutton and over a
            kilo of chicken. These say it properly: ₹400, OR 1.5kg of chicken,
            OR 1kg of mutton. Same editor and same engine as the delivery rules,
            so the two cannot come to mean different things. */}
        <div className="cond-block">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <label style={{ margin: 0 }}>Who qualifies</label>
            {(d.conditions?.length ?? 0) === 0 && (
              <button className="btn sm ghost"
                onClick={() => set({ conditions: [blankCondition()], match: "any" })}>
                + Add a condition
              </button>
            )}
          </div>

          {(d.conditions?.length ?? 0) === 0 ? (
            <div className="pe-hint" style={{ marginTop: 4 }}>
              Any order{Number(d.min_order) > 0 ? ` over ₹${d.min_order}` : ""} qualifies.
              Add a condition to ask for a weight or a category instead — “1.5kg of Chicken”
              is a fairer ask than a rupee figure that means different amounts at each counter.
            </div>
          ) : (
            <>
              <ConditionsEditor
                conditions={d.conditions as RuleCondition[]}
                match={(d.match as "any" | "all") || "any"}
                onChange={(next) => set({ conditions: next })}
                onMatchChange={(m) => set({ match: m })}
              />
              <div className="pe-hint" style={{ marginTop: 8 }}>
                Customers who don’t qualify are told:{" "}
                <b>“{d.code.trim().toUpperCase() || "CODE"} needs{" "}
                {conditionsText(d.conditions as RuleCondition[], (d.match as "any" | "all") || "any")}.”</b>
              </div>
            </>
          )}
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary" disabled={saving || !d.code.trim()} onClick={save}>
            {saving ? "Saving…" : editing ? "Save changes" : "Add coupon"}
          </button>
          {editing && (
            <button className="btn ghost" disabled={saving} onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="panel">
        <h2>Coupons ({coupons.length})</h2>
        {loading ? <p className="muted">Loading…</p> : coupons.length === 0 ? (
          <p className="muted">No coupons yet.</p>
        ) : (
          <table>
            <thead><tr><th>Code</th><th>Offer</th><th>Who qualifies</th><th>Limits</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.code}</b></td>
                  <td className="muted">{describe(c)}</td>
                  {/* The whole qualifying condition in one cell: a coupon whose
                      rules are invisible in the list is a coupon nobody can audit. */}
                  <td style={{ fontSize: 12.5 }}>
                    {(c.conditions?.length ?? 0) > 0
                      ? conditionsText(c.conditions, c.match || "any")
                      : c.min_order ? inr(c.min_order) : "—"}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{limits(c)}</td>
                  <td>
                    <button className={"btn sm " + (c.active ? "accent" : "ghost")}
                      disabled={saving} onClick={() => toggle(c)}>
                      {c.active ? "Active" : "Off"}
                    </button>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6, margin: 0 }}>
                      <button className="btn sm ghost" disabled={saving} onClick={() => startEdit(c)}>
                        ✏️ Edit
                      </button>
                      {c.active && (
                        <button className="btn sm ghost" disabled={saving} onClick={() => deactivate(c)}>
                          Turn off
                        </button>
                      )}
                    </div>
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
