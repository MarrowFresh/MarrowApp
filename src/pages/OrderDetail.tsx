import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchOrderDetail, patchOrderStatus, type OrderDetail } from "../lib/apiClient";
import { store } from "../lib/data";
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

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchOrderDetail(id)
      .then((o) => alive && (setOrder(o), setError(null)))
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
      const name = window.prompt(`Delivery agent name for order #${order.order_no}?`);
      if (name === null) return; // cancelled
      const phone = window.prompt("Delivery agent phone (optional):") || "";
      doAdvance(to, { agentName: name.trim(), agentPhone: phone.trim() });
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
            <button className="btn" disabled={busy} onClick={() => onAdvance(nextStatus)}>
              {busy ? "Working…" : `→ ${nextStatus}`}
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
          <p><b>{order.customer_name}</b></p>
          <p className="muted" style={{ whiteSpace: "pre-wrap" }}>{order.delivery_address || "No address on file"}</p>
          <p className="muted">
            Nearest branch: <b>{order.branch || "—"}</b>
            {order.distance_km > 0 ? ` · ${order.distance_km.toFixed(1)} km` : ""}
          </p>
          <p className="muted">
            Instructions: {order.instructions ? <b>{order.instructions}</b> : <i>none recorded</i>}
          </p>
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
