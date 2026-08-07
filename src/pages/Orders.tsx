import { Link } from "react-router-dom";
import { useDB } from "../useStore";
import { store } from "../lib/data";
import type { OrderStatus } from "../lib/types";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");
const FLOW: OrderStatus[] = ["New", "Cutting/Packing", "Out for delivery", "Delivered"];

export default function Orders() {
  const db = useDB();
  const delivery = db.staff.filter((s) => s.role === "delivery");

  const next = (cur: OrderStatus): OrderStatus | null => {
    const i = FLOW.indexOf(cur);
    return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null;
  };

  const approve = (id: string, orderNo: number) => {
    if (window.confirm(`Approve order #${orderNo}?\n\nThis sends the customer a WhatsApp "Order Confirmed" message.`))
      store.setOrderStatus(id, "Cutting/Packing");
  };

  const advance = (id: string, orderNo: number, to: OrderStatus) => {
    if (to === "Out for delivery") {
      const name = window.prompt(`Delivery agent name for order #${orderNo}?`);
      if (name === null) return; // cancelled
      const phone = window.prompt("Delivery agent phone (optional):") || "";
      store.setOrderStatus(id, to, { agentName: name.trim(), agentPhone: phone.trim() });
    } else if (to === "Delivered") {
      if (window.confirm(`Mark order #${orderNo} as delivered? This notifies the customer.`))
        store.setOrderStatus(id, to);
    } else {
      store.setOrderStatus(id, to);
    }
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Orders</h1><div className="sub">Move through the flow · assign a delivery boy</div></div>
      </div>

      <div className="panel">
        {db.orders.length === 0 ? (
          <p className="muted">No orders yet. Create one from <b>New Order</b>.</p>
        ) : (
          <table>
            <thead>
              <tr><th>#</th><th>Customer</th><th>Items</th><th>Total</th><th>Pay</th><th>Status</th><th>Assign</th><th>Action</th></tr>
            </thead>
            <tbody>
              {db.orders.map((o) => {
                const nx = next(o.status);
                return (
                  <tr key={o.id}>
                    <td><Link to={`/orders/${o.id}`}>#{o.order_no}</Link></td>
                    <td>
                      <Link to={`/orders/${o.id}`}>{o.customer_name}</Link>
                      <div className="muted" style={{ fontSize: 11 }}>{o.area}</div>
                    </td>
                    <td className="muted">
                      <Link to={`/orders/${o.id}`} style={{ color: "inherit" }}>
                        {o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}
                      </Link>
                    </td>
                    <td>{inr(o.grand_total)}</td>
                    <td><span className={"pill " + o.payment_status}>{o.payment_method}</span></td>
                    <td><span className={"pill " + o.status.replace(/[\/ ].*/, "")}>{o.status}</span></td>
                    <td>
                      <select value={o.assigned_to ?? ""} onChange={(e) => store.assignOrder(o.id, e.target.value)}>
                        <option value="">—</option>
                        {delivery.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </td>
                    <td>
                      {o.status === "New" ? (
                        <button className="btn sm primary" onClick={() => approve(o.id, o.order_no)}>✓ Approve</button>
                      ) : nx ? (
                        <button className="btn sm" onClick={() => advance(o.id, o.order_no, nx)}>→ {nx}</button>
                      ) : o.status === "Delivered" ? <span className="free">✓ Done</span> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
