import { useState } from "react";
import { useDB } from "../useStore";
import { store } from "../lib/data";
import type { Category, Rule, RuleCondition } from "../lib/types";

const CATS: Category[] = ["Chicken", "Mutton", "Fish", "Prawns", "Crabs", "Eggs"];

const blankCond = (): RuleCondition => ({ measure: "amount", scope: "all", op: ">=", value: 500 });
const blankRule = (): Rule => ({
  id: "", name: "", conditions: [blankCond()], match: "any",
  waive_delivery: true, waive_packing: true, active: true,
});

function condText(c: RuleCondition) {
  const where =
    c.scope === "all" ? "order" : c.scope === "category" ? `${c.target}` : "product";
  const unit = c.measure === "amount" ? "₹" : c.measure === "weight" ? "kg" : "qty";
  const val = c.measure === "amount" ? `₹${c.value}` : `${c.value}${unit === "kg" ? "kg" : ""}`;
  return `${where} ${c.measure} ≥ ${val}`;
}

export default function Rules() {
  const db = useDB();
  const [r, setR] = useState<Rule>(blankRule());
  const setRule = (p: Partial<Rule>) => setR({ ...r, ...p });
  const setCond = (i: number, p: Partial<RuleCondition>) =>
    setR({ ...r, conditions: r.conditions.map((c, j) => (j === i ? { ...c, ...p } : c)) });

  const save = () => {
    if (!r.name) return;
    store.upsertRule({ ...r, id: store.uid() });
    setR(blankRule());
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Free Delivery & Packing Rules</h1>
          <div className="sub">When should delivery / packing be free? Combine conditions with AND/OR.</div></div>
      </div>

      <div className="panel">
        <h2>New rule</h2>
        <div className="row" style={{ marginBottom: 10 }}>
          <div style={{ flex: 1 }}><label>Rule name</label>
            <input style={{ width: "100%" }} value={r.name}
              onChange={(e) => setRule({ name: e.target.value })} placeholder="Mutton ≥ ₹800" /></div>
          <div><label>Match</label>
            <select value={r.match} onChange={(e) => setRule({ match: e.target.value as "all" | "any" })}>
              <option value="all">ALL (AND)</option>
              <option value="any">ANY (OR)</option>
            </select></div>
        </div>

        <label>Conditions</label>
        {r.conditions.map((c, i) => (
          <div className="row" key={i} style={{ marginBottom: 8, flexWrap: "wrap" }}>
            <select value={c.scope} onChange={(e) => setCond(i, { scope: e.target.value as RuleCondition["scope"], target: undefined })}>
              <option value="all">Whole order</option>
              <option value="category">Category</option>
            </select>
            {c.scope === "category" && (
              <select value={c.target ?? CATS[0]} onChange={(e) => setCond(i, { target: e.target.value })}>
                {CATS.map((x) => <option key={x}>{x}</option>)}
              </select>
            )}
            <select value={c.measure} onChange={(e) => setCond(i, { measure: e.target.value as RuleCondition["measure"] })}>
              <option value="amount">amount ₹</option>
              <option value="weight">weight kg</option>
              <option value="qty">quantity</option>
            </select>
            <span className="muted">≥</span>
            <input type="number" style={{ width: 90 }} value={c.value}
              onChange={(e) => setCond(i, { value: +e.target.value })} />
            {r.conditions.length > 1 && (
              <button className="btn sm ghost" onClick={() => setRule({ conditions: r.conditions.filter((_, j) => j !== i) })}>✕</button>
            )}
          </div>
        ))}
        <button className="btn sm ghost" onClick={() => setRule({ conditions: [...r.conditions, blankCond()] })}>+ Add condition</button>

        <div className="row" style={{ marginTop: 14 }}>
          <label className="row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={r.waive_delivery} onChange={(e) => setRule({ waive_delivery: e.target.checked })} /> Free delivery
          </label>
          <label className="row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={r.waive_packing} onChange={(e) => setRule({ waive_packing: e.target.checked })} /> Free packing
          </label>
          <button className="btn primary" style={{ marginLeft: "auto" }} disabled={!r.name} onClick={save}>Add rule</button>
        </div>
      </div>

      <div className="panel">
        <h2>Active rules ({db.rules.length})</h2>
        <table>
          <thead><tr><th>Rule</th><th>When</th><th>Gives</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {db.rules.map((rule) => (
              <tr key={rule.id}>
                <td><b>{rule.name}</b></td>
                <td className="muted">
                  {rule.conditions.map(condText).join(rule.match === "all" ? "  AND  " : "  OR  ")}
                </td>
                <td className="muted">
                  {[rule.waive_delivery && "Delivery", rule.waive_packing && "Packing"].filter(Boolean).join(" + ") || "—"} free
                </td>
                <td>
                  <button className={"btn sm " + (rule.active ? "accent" : "ghost")}
                    onClick={() => store.upsertRule({ ...rule, active: !rule.active })}>
                    {rule.active ? "On" : "Off"}
                  </button>
                </td>
                <td><button className="btn sm ghost" onClick={() => store.deleteRule(rule.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
