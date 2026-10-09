import type { Category, RuleCondition } from "../lib/types";

const CATS: Category[] = ["Chicken", "Mutton", "Fish", "Prawns", "Crabs", "Eggs"];

export const blankCondition = (): RuleCondition =>
  ({ measure: "amount", scope: "all", op: ">=", value: 500 });

/// The conditions a basket has to meet — shared by free-delivery rules and by
/// coupons, because they are the same question asked by two screens and the
/// backend evaluates them with one piece of code. Two editors would drift, and
/// the shop would end up with "₹400" meaning different things in each.
///
/// A flat rupee threshold is the wrong question on its own here: ₹400 is 400g
/// of mutton but over a kilo of chicken, so "spend ₹400" is generous on one
/// counter and nearly out of reach on the other. Weight and category are what
/// make an offer fair across both.
export default function ConditionsEditor({
  conditions, match, onChange, onMatchChange,
}: {
  conditions: RuleCondition[];
  match: "any" | "all";
  onChange: (next: RuleCondition[]) => void;
  onMatchChange: (next: "any" | "all") => void;
}) {
  const setCond = (i: number, p: Partial<RuleCondition>) =>
    onChange(conditions.map((c, j) => (j === i ? { ...c, ...p } : c)));

  return (
    <div className="cond-edit">
      {conditions.length > 1 && (
        <div className="row" style={{ gap: 8, marginBottom: 10, alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12.5 }}>Qualify when</span>
          <select value={match} onChange={(e) => onMatchChange(e.target.value as "any" | "all")}>
            <option value="any">any one of these is met</option>
            <option value="all">all of these are met</option>
          </select>
        </div>
      )}

      {conditions.map((c, i) => (
        <div className="row cond-row" key={i}>
          <select value={c.scope}
            onChange={(e) => setCond(i, {
              scope: e.target.value as RuleCondition["scope"],
              // The old target would otherwise linger and quietly scope the
              // condition to a category the shop can no longer see.
              target: undefined,
            })}>
            <option value="all">Whole order</option>
            <option value="category">Category</option>
          </select>

          {c.scope === "category" && (
            <select value={c.target ?? CATS[0]}
              onChange={(e) => setCond(i, { target: e.target.value })}>
              {CATS.map((x) => <option key={x}>{x}</option>)}
            </select>
          )}

          <select value={c.measure}
            onChange={(e) => setCond(i, { measure: e.target.value as RuleCondition["measure"] })}>
            <option value="amount">amount ₹</option>
            <option value="weight">weight kg</option>
            <option value="qty">quantity</option>
          </select>

          <span className="muted">≥</span>
          <input type="number" style={{ width: 90 }} value={c.value} min={0} step="0.1"
            onChange={(e) => setCond(i, { value: +e.target.value })} />

          {conditions.length > 1 && (
            <button className="btn sm ghost" title="Remove this condition"
              onClick={() => onChange(conditions.filter((_, j) => j !== i))}>✕</button>
          )}
        </div>
      ))}

      <button className="btn sm ghost"
        onClick={() => onChange([...conditions, blankCondition()])}>
        + Add condition
      </button>
    </div>
  );
}

/// One condition as a sentence — "1.5kg of Chicken", "₹400".
export function conditionText(c: RuleCondition): string {
  const of = c.scope === "category" && c.target ? ` of ${c.target}` : "";
  switch (c.measure) {
    case "weight": return `${c.value}kg${of}`;
    case "qty":    return `${c.value}${of || " items"}`;
    default:       return `₹${c.value}${of}`;
  }
}

/// The whole set as a sentence, the way the customer will be told it.
export function conditionsText(conds: RuleCondition[], match: "any" | "all"): string {
  if (!conds?.length) return "any order";
  const parts = conds.map(conditionText);
  return parts.length === 1 ? parts[0] : parts.join(match === "all" ? " and " : " or ");
}
