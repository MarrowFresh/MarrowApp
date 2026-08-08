import { useDB } from "../useStore";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

export default function Dashboard() {
  const db = useDB();
  const today = new Date().toDateString();

  // "Draft" is a website cart the customer never confirmed on WhatsApp. It isn't a
  // sale and isn't work — counting it would inflate revenue and the pending queue.
  const real = db.orders.filter((o) => o.status !== "Draft");

  const todays = real.filter(
    (o) => new Date(o.created_at).toDateString() === today
  );
  const revenue = real
    .filter((o) => o.status !== "Cancelled")
    .reduce((s, o) => s + o.grand_total, 0);
  const pending = real.filter(
    (o) => o.status !== "Delivered" && o.status !== "Cancelled"
  ).length;

  // top item by qty
  const counts: Record<string, number> = {};
  real.forEach((o) =>
    o.lines.forEach((l) => (counts[l.name] = (counts[l.name] || 0) + l.qty))
  );
  const top =
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">KPHB Phase 4 · live overview</div>
        </div>
      </div>

      <div className="cards">
        <div className="card"><div className="k">Orders today</div><div className="v acc">{todays.length}</div></div>
        <div className="card"><div className="k">Total orders</div><div className="v">{real.length}</div></div>
        <div className="card"><div className="k">Revenue (all)</div><div className="v">{inr(revenue)}</div></div>
        <div className="card"><div className="k">Pending</div><div className="v acc">{pending}</div></div>
      </div>

      <div className="panel">
        <h2>Recent orders</h2>
        {real.length === 0 ? (
          <p className="muted">No orders yet. Create one from <b>New Order</b> — type in a WhatsApp order to get started.</p>
        ) : (
          <table>
            <thead><tr><th>#</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              {real.slice(0, 6).map((o) => (
                <tr key={o.id}>
                  <td>#{o.order_no}</td>
                  <td>{o.customer_name}</td>
                  <td className="muted">{o.lines.length} item(s)</td>
                  <td>{inr(o.grand_total)}</td>
                  <td><span className={"pill " + o.status.replace(/[\/ ].*/, "")}>{o.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>Quick stats</h2>
        <p className="muted">Top seller: <b style={{ color: "var(--terracotta)" }}>{top}</b></p>
      </div>
    </>
  );
}
