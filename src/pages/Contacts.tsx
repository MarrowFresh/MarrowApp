import { useMemo, useState } from "react";
import { adminApi } from "../lib/apiClient";
import { useResource } from "../lib/useResource";
import { formatPhone, telHref, waHref } from "../lib/customer";

// Everyone who has ever messaged the WhatsApp bot — not just the people who
// ordered. The bot records each number on first contact, so the "never ordered"
// list is a ready-made set of interested customers to follow up with.
type Contact = {
  phone: string;
  name?: string | null;
  first_seen?: string;
  last_seen?: string;
  address?: string | null;
  ordered: boolean;
  order_count: number;
  total_spent: number;
  last_order?: string | null;
};

type Payload = { total: number; ordered: number; never_ordered: number; contacts: Contact[] };

const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN");
const day = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// "3 days ago" reads faster than a date when you're deciding who to chase.
const ago = (s?: string | null) => {
  if (!s) return "";
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  return `${Math.floor(d / 30)} mo ago`;
};

export default function Contacts() {
  const { data, loading, error } = useResource<Payload>(
    adminApi.getContacts as unknown as () => Promise<Payload>,
    { total: 0, ordered: 0, never_ordered: 0, contacts: [] }
  );

  const [filter, setFilter] = useState<"all" | "ordered" | "new">("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return data.contacts.filter((c) => {
      if (filter === "ordered" && !c.ordered) return false;
      if (filter === "new" && c.ordered) return false;
      if (!needle) return true;
      return (
        (c.name || "").toLowerCase().includes(needle) ||
        (digits.length > 0 && c.phone.replace(/\D/g, "").includes(digits))
      );
    });
  }, [data.contacts, filter, q]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Contacts</h1>
          <div className="sub">Every number that has messaged Marrow Fresh — ordered or not</div>
        </div>
      </div>

      {error && <div className="panel"><span style={{ color: "#c0392b" }}>{error}</span></div>}

      <div className="cards">
        <div className="card"><div className="k">Total contacts</div><div className="v">{data.total}</div></div>
        <div className="card"><div className="k">Became customers</div><div className="v">{data.ordered}</div></div>
        <div className="card"><div className="k">Never ordered</div><div className="v acc">{data.never_ordered}</div></div>
        <div className="card">
          <div className="k">Conversion</div>
          <div className="v">{data.total ? Math.round((data.ordered / data.total) * 100) : 0}%</div>
        </div>
      </div>

      <div className="panel filters">
        <div className="filter-field grow">
          <label htmlFor="c-q">Search name or number</label>
          <input id="c-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Gowtham, 9154217648" />
        </div>
        <div className="filter-actions">
          <button className={"btn sm " + (filter === "all" ? "primary" : "ghost")} onClick={() => setFilter("all")}>
            All ({data.total})
          </button>
          <button className={"btn sm " + (filter === "ordered" ? "primary" : "ghost")} onClick={() => setFilter("ordered")}>
            Customers ({data.ordered})
          </button>
          <button className={"btn sm " + (filter === "new" ? "primary" : "ghost")} onClick={() => setFilter("new")}>
            Never ordered ({data.never_ordered})
          </button>
        </div>
      </div>

      <div className="panel">
        {loading ? <p className="muted">Loading contacts…</p> : rows.length === 0 ? (
          <p className="muted">No contacts match.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Name</th><th>Number</th><th>First contact</th><th>Last seen</th><th>Orders</th><th>Spent</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.phone}>
                  <td>
                    <b>{c.name || <span className="muted">unknown</span>}</b>
                    {!c.ordered && <span className="pill New" style={{ marginLeft: 6 }}>lead</span>}
                    {c.address && <div className="muted" style={{ fontSize: 11 }}>{c.address.slice(0, 60)}</div>}
                  </td>
                  <td className="nowrap">{formatPhone(c.phone)}</td>
                  <td className="nowrap muted">{day(c.first_seen)}</td>
                  <td className="nowrap muted">{ago(c.last_seen)}</td>
                  <td>{c.order_count || <span className="muted">—</span>}</td>
                  <td>{c.total_spent > 0 ? inr(c.total_spent) : <span className="muted">—</span>}</td>
                  <td className="nowrap">
                    <a className="btn sm ghost" href={waHref(c.phone)} target="_blank" rel="noreferrer">💬 Chat</a>{" "}
                    <a className="btn sm ghost" href={telHref(c.phone)}>📞</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          A <b>lead</b> messaged the bot but never completed an order. Tap 💬 to reach them —
          but note WhatsApp only allows a free-form message within 24 hours of their last
          message; beyond that you need an approved template.
        </p>
      </div>
    </>
  );
}
