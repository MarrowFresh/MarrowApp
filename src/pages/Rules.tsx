import { useState } from "react";
import { adminApi } from "../lib/apiClient";
import { useResource } from "../lib/useResource";
import type { Rule, RuleCondition } from "../lib/types";
import ConditionsEditor, { blankCondition } from "../components/ConditionsEditor";

const blankCond = blankCondition;
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
  // Rules live in the database — the pricing engine evaluates them for every
  // order, on the website and on WhatsApp alike.
  const { data: rules, loading, error, saving, mutate } =
    useResource<Rule[]>(adminApi.getRules as unknown as () => Promise<Rule[]>, []);

  const [r, setR] = useState<Rule>(blankRule());
  const setRule = (p: Partial<Rule>) => setR({ ...r, ...p });
  const setCond = (i: number, p: Partial<RuleCondition>) =>
    setR({ ...r, conditions: r.conditions.map((c, j) => (j === i ? { ...c, ...p } : c)) });

  const save = async () => {
    if (!r.name.trim()) return;
    const ok = await mutate(() => adminApi.createRule({
      name: r.name.trim(),
      conditions: r.conditions,
      match: r.match,
      waive_delivery: r.waive_delivery,
      waive_packing: r.waive_packing,
      active: true,
      sort_order: rules.length + 1,
    }));
    if (ok) setR(blankRule());
  };

  const toggle = (rule: Rule) => mutate(() => adminApi.updateRule(rule.id, { active: !rule.active }));

  const turnOff = (rule: Rule) => {
    if (window.confirm(`Turn off "${rule.name}"?\n\nOrders stop qualifying for it immediately.`))
      mutate(() => adminApi.deactivateRule(rule.id));
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
        <ConditionsEditor
          conditions={r.conditions}
          match={r.match as "any" | "all"}
          onChange={(next) => setRule({ conditions: next })}
          onMatchChange={(m) => setRule({ match: m })}
        />


        <div className="row" style={{ marginTop: 14 }}>
          <label className="row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={r.waive_delivery} onChange={(e) => setRule({ waive_delivery: e.target.checked })} /> Free delivery
          </label>
          <label className="row" style={{ margin: 0, gap: 5 }}>
            <input type="checkbox" checked={r.waive_packing} onChange={(e) => setRule({ waive_packing: e.target.checked })} /> Free packing
          </label>
          <button className="btn primary" style={{ marginLeft: "auto" }} disabled={saving || !r.name.trim()} onClick={save}>{saving ? "Saving…" : "Add rule"}</button>
        </div>
      </div>

      <div className="panel">
        <h2>Rules ({rules.length})</h2>
        <table>
          <thead><tr><th>Rule</th><th>When</th><th>Gives</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rules.map((rule) => (
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
                    disabled={saving} onClick={() => toggle(rule)}>
                    {rule.active ? "On" : "Off"}
                  </button>
                </td>
                <td>{rule.active && (
                  <button className="btn sm ghost" disabled={saving} onClick={() => turnOff(rule)}>Turn off</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
