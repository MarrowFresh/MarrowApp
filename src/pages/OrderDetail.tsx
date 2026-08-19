import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchOrderDetail, patchOrderStatus, fetchStaff, patchOrderDelivery,
  type OrderDetail, type StaffMember,
} from "../lib/apiClient";
import { store } from "../lib/data";
import { CustomerBadge, CustomerPhone } from "../lib/customer";
import type { OrderStatus } from "../lib/types";

const STATUS_FLOW: OrderStatus[] = ["New", "Cutting/Packing", "Out for delivery", "Delivered"];

const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN");
const kg = (n: number) => `${Number(n || 0).toFixed(n % 1 === 0 ? 0 : 1)} kg`;
const when = (s?: string | null) => (s ? new Date(s).toLocaleString("en-IN") : "—");

export default function OrderDetail() {
  const { id = "" } = useParams();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Delivery staff for the assign dropdown (same source as the Orders screen).
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [picked, setPicked] = useState("");
  const [assigning, setAssigning] = useState(false);
  useEffect(() => { fetchStaff("delivery").then(setStaff).catch(() => setStaff([])); }, []);

  // Remarks — normally written by the rider in the delivery app; the admin can
  // write on their behalf when the rider has no signal.
  const [remarks, setRemarks] = useState("");
  const [savingRemark, setSavingRemark] = useState(false);

  const saveRemark = async () => {
    if (!order) return;
    setSavingRemark(true);
    try {
      await patchOrderDelivery(order.id, { remarks });
      setOrder(await fetchOrderDetail(order.id));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not save the remark");
    } finally {
      setSavingRemark(false);
    }
  };

  const doAssign = async () => {
    if (!order || !picked) return;
    setAssigning(true);
    try {
      await store.assignOrder(order.id, picked);
      setOrder(await fetchOrderDetail(order.id));
    } catch {
      window.alert("Could not save the assignment. Please try again.");
    } finally {
      setAssigning(false);
    }
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchOrderDetail(id)
      .then((o) => alive && (
        setOrder(o), setPicked(o.assigned_to || ""), setRemarks(o.remarks || ""), setError(null)
      ))
      .catch((e) => alive && setError(e?.message || "Failed to load order"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  if (loading) return <div className="panel"><p className="muted">Loading order…</p></div>;
  if (error)   return <div className="panel"><p style={{ color: "#c0392b" }}>{error}</p><Link to="/orders">← Back to orders</Link></div>;
  if (!order)  return <div className="panel"><p className="muted">Order not found.</p><Link to="/orders">← Back to orders</Link></div>;

  const idx = STATUS_FLOW.indexOf(order.status);
  const nextStatus = idx >= 0 && idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null;

  const doAdvance = async (to: OrderStatus, extra?: { agentName?: string; agentPhone?: string }) => {
    setBusy(true);
    try {
      await patchOrderStatus(order.id, to, extra);
      await store.refreshOrders();          // keep the Orders list in sync
      setOrder(await fetchOrderDetail(order.id)); // refresh this page
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const onAdvance = (to: OrderStatus) => {
    if (to === "Cutting/Packing") {
      if (window.confirm(`Approve order #${order.order_no}?\n\nThis sends the customer a WhatsApp "Order Confirmed" message.`))
        doAdvance(to);
    } else if (to === "Out for delivery") {
      // Agent details come from the assigned staff member — same as the Orders screen.
      if (!order.agent_name) {
        window.alert("Assign a delivery boy first (below, or from the Orders screen).");
        return;
      }
      if (window.confirm(
        `Send order #${order.order_no} out for delivery with ${order.agent_name}?\n\n` +
        `The customer gets a WhatsApp update with the delivery agent's name and number.`
      )) {
        doAdvance(to, { agentName: order.agent_name, agentPhone: order.agent_phone || "" });
      }
    } else if (to === "Delivered") {
      if (window.confirm(`Mark order #${order.order_no} as delivered? This notifies the customer.`))
        doAdvance(to);
    } else {
      doAdvance(to);
    }
  };

  const feeRow = (label: string, val: number, show = true) =>
    show ? (
      <tr><td className="muted">{label}</td><td style={{ textAlign: "right" }}>{inr(val)}</td></tr>
    ) : null;

  return (
    <>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <div style={{ fontSize: 13 }}><Link to="/orders">← Orders</Link></div>
          <h1>Order #{order.order_no}</h1>
          <div className="sub">
            <span className={"pill " + order.status.replace(/[\/ ].*/, "")}>{order.status}</span>
            <span className="muted" style={{ marginLeft: 10 }}>{when(order.created_at)}</span>
          </div>
        </div>
        <div style={{ paddingTop: 20 }}>
          {order.status === "New" ? (
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => onAdvance("Cutting/Packing")}
            >
              {busy ? "Working…" : "✓ Approve & notify customer"}
            </button>
          ) : nextStatus ? (
            <button
              className="btn"
              disabled={busy || (nextStatus === "Out for delivery" && !order.agent_name)}
              title={nextStatus === "Out for delivery" && !order.agent_name ? "Assign a delivery boy first" : ""}
              onClick={() => onAdvance(nextStatus)}
            >
              {busy ? "Working…" : nextStatus === "Out for delivery" ? "🛵 Out for delivery" : `→ ${nextStatus}`}
            </button>
          ) : order.status === "Delivered" ? (
            <span className="free">✓ Delivered</span>
          ) : null}
        </div>
      </div>

      <div className="detail-grid">
        {/* Delivery / customer */}
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>📍 Delivery</h3>
          <p style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <b>{order.customer_name}</b>
            <CustomerBadge order={order} />
          </p>
          {order.customer_phone && (
            <p style={{ marginTop: -4 }}><CustomerPhone phone={order.customer_phone} /></p>
          )}
          {!order.is_new_customer && (order.customer_order_count ?? 0) > 1 && (
            <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
              Returning customer · {order.customer_order_count} orders to date
            </p>
          )}
          <p className="muted" style={{ whiteSpace: "pre-wrap" }}>{order.delivery_address || "No address on file"}</p>
          {/* The exact pin, when the customer dropped one. Searching Google for
              "Flat 392, first floor" is how a rider ends up on the wrong street,
              so link straight to the coordinates and let the admin read them out
              or forward them if the rider's app is playing up. */}
          {order.delivery_lat != null && order.delivery_lng != null ? (
            <p className="muted pin-row">
              <a
                className="pin-link"
                href={`https://www.google.com/maps/dir/?api=1&destination=${order.delivery_lat},${order.delivery_lng}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                📍 Open exact location
              </a>
              <code>{Number(order.delivery_lat).toFixed(5)}, {Number(order.delivery_lng).toFixed(5)}</code>
            </p>
          ) : (
            <p className="muted" style={{ fontSize: 12 }}>
              📍 No pin on this order — the customer didn't share a location, so the
              rider will navigate by address.
            </p>
          )}
          <p className="muted">
            Nearest branch: <b>{order.branch || "—"}</b>
            {order.distance_km > 0 ? ` · ${order.distance_km.toFixed(1)} km` : ""}
          </p>
          {order.rating != null && (
            <div className="rating-box">
              <div className="stars">{"★".repeat(order.rating)}<span>{"★".repeat(5 - order.rating)}</span></div>
              <b>{order.rating}/5</b>
              {order.feedback ? <p>“{order.feedback}”</p> : <p className="muted">No comment left.</p>}
            </div>
          )}
          <p className="muted">
            Instructions: {order.instructions ? <b>{order.instructions}</b> : <i>none recorded</i>}
          </p>

          <div style={{ borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 10 }}>
            <label htmlFor="d-agent">🛵 Delivery boy</label>
            <div className="assign-cell">
              <select
                id="d-agent"
                value={picked}
                disabled={order.status === "Delivered" || staff.length === 0}
                onChange={(e) => setPicked(e.target.value)}
              >
                <option value="">{staff.length === 0 ? "— no staff —" : "— select —"}</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button
                className="btn sm"
                disabled={!picked || picked === order.assigned_to || assigning}
                onClick={doAssign}
              >
                {assigning ? "…" : "Assign"}
              </button>
            </div>
            {order.agent_name && (
              <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>
                ✓ {order.agent_name}{order.agent_phone ? ` · ${order.agent_phone}` : ""}
              </div>
            )}

            {/* Delivery remark — the rider writes this from the delivery app; the
                admin can write it for them when they have no signal. */}
            <label htmlFor="d-remark" style={{ marginTop: 12 }}>📝 Delivery remark</label>
            <textarea
              id="d-remark"
              rows={2}
              value={remarks}
              placeholder="e.g. customer not home, left with security"
              onChange={(e) => setRemarks(e.target.value)}
              style={{ width: "100%", resize: "vertical" }}
            />
            <div className="row" style={{ gap: 8, marginTop: 6 }}>
              <button
                className="btn sm"
                disabled={savingRemark || remarks.trim() === (order.remarks || "").trim()}
                onClick={saveRemark}
              >
                {savingRemark ? "Saving…" : "Save remark"}
              </button>
              {order.remarks_by && (
                <span className="muted" style={{ fontSize: 11 }}>
                  last by {order.remarks_by}{order.remarks_at ? ` · ${when(order.remarks_at)}` : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Payment */}
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>💳 Payment</h3>
          <p>Method: <b>{order.payment_method}</b></p>
          <p>Status: <span className={"pill " + order.payment_status}>{order.payment_status}</span></p>
          <p className="muted">Coupon: {order.coupon_code ? <b>{order.coupon_code}</b> : <i>none</i>}</p>
          <p className="muted">Total weight: {kg(order.total_weight)}</p>
        </div>
      </div>

      {/* Items by category */}
      <div className="panel" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>🛒 Items</h3>
        {order.categories.length === 0 ? (
          <p className="muted">No items.</p>
        ) : (
          order.categories.map((c) => (
            <div key={c.category} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, margin: "6px 0" }}>{c.category}</div>
              <table>
                <thead>
                  <tr><th>Item</th><th>Qty</th><th style={{ textAlign: "right" }}>Rate</th><th style={{ textAlign: "right" }}>Total</th></tr>
                </thead>
                <tbody>
                  {c.items.map((it, i) => (
                    <tr key={i}>
                      <td>{it.name}</td>
                      <td>{it.qty}</td>
                      <td style={{ textAlign: "right" }}>{inr(it.price_each)}</td>
                      <td style={{ textAlign: "right" }}>{inr(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      {/* Price breakdown */}
      <div className="panel" style={{ marginTop: 16, maxWidth: 420 }}>
        <h3 style={{ marginTop: 0 }}>🧾 Bill</h3>
        <table>
          <tbody>
            {feeRow("Subtotal", order.subtotal)}
            {feeRow("Discount", -order.discount, order.discount > 0)}
            {feeRow("Delivery", order.delivery_fee)}
            {feeRow("Packing", order.packing_fee, order.packing_fee > 0)}
            {feeRow("Platform fee", order.platform_fee, order.platform_fee > 0)}
            {feeRow("Tax", order.tax_total, order.tax_total > 0)}
            <tr style={{ borderTop: "1px solid #ddd" }}>
              <td><b>Grand total</b></td>
              <td style={{ textAlign: "right" }}><b>{inr(order.grand_total)}</b></td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
