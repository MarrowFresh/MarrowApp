import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useDB } from "../useStore";
import { store } from "../lib/data";
import { CustomerBadge, CustomerPhone } from "../lib/customer";
import { fetchStaff, createStaff, resetStaffPin, adminApi, type StaffMember } from "../lib/apiClient";
import type { Order, OrderStatus } from "../lib/types";

// The reasons a Marrow Fresh order actually gets cancelled, so the shop taps
// instead of typing and the month's reasons can be counted. "Something else"
// keeps the ones nobody anticipated.
const OTHER = "Something else";
const CANCEL_REASONS = [
  "Customer changed their mind",
  "Customer not reachable",
  "Item sold out",
  "Outside delivery area",
  "Duplicate order",
  "Payment not received",
  "Shop closed / no stock today",
  OTHER,
];

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

// "07 Aug 2026" / "4:25 pm" — split across two lines so the column stays narrow.
const placedOn = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }),
    full: d.toLocaleString("en-IN"),
  };
};
const FLOW: OrderStatus[] = ["New", "Cutting/Packing", "Out for delivery", "Delivered"];
// Website carts the customer hasn't confirmed on WhatsApp yet. Hidden by default —
// they aren't work until confirmed — but reachable via the Status filter so you can
// call someone who dropped off at the handoff.
const DRAFT = "Draft";
const PAGE_SIZES = [10, 25, 50, 100];

// Local YYYY-MM-DD for a date input (not toISOString, which shifts to UTC).
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function Orders() {
  const db = useDB();

  // Delivery staff come from the database — orders.assigned_to is a FK to staff.id,
  // so only real staff rows can be assigned.
  const [delivery, setDelivery] = useState<StaffMember[]>([]);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffLoading, setStaffLoading] = useState(true);

  // The bot a rider must open before assignment pings can reach them. A warning
  // was already shown beside every unlinked rider, which on its own was useless:
  // the shop could see the problem and had nothing to send them.
  const [botLink, setBotLink] = useState<string | null>(null);
  useEffect(() => {
    adminApi.getTelegramBot().then((b) => setBotLink(b.link)).catch(() => {});
  }, []);

  const inviteToTelegram = (s: StaffMember) => {
    if (!botLink) {
      window.alert("The Telegram bot username isn't configured on the server yet.");
      return;
    }
    const lines = [
      `Hi ${s.name}, please open this link on your phone and tap START, then share your number when it asks:`,
      "",
      botLink,
      "",
      "You'll then get a Telegram message the moment an order is assigned to you.",
    ].join("\n");
    const to = String(s.phone || "").replace(/\D/g, "");
    window.open(`https://wa.me/${to}?text=${encodeURIComponent(lines)}`, "_blank", "noopener");
  };

  const loadStaff = useCallback(() => {
    setStaffLoading(true);
    return fetchStaff("delivery")
      .then((s) => { setDelivery(s); setStaffError(null); })
      .catch((e) =>
        setStaffError(
          // "Failed to fetch" is the browser's network error — say something useful.
          /failed to fetch/i.test(e?.message || "")
            ? "Can't reach the server"
            : e?.message || "Could not load delivery staff"
        ))
      .finally(() => setStaffLoading(false));
  }, []);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  // Retry when the tab regains focus, so a failure while the backend was
  // restarting doesn't leave the dropdown permanently empty.
  useEffect(() => {
    const onFocus = () => { if (staffError) loadStaff(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [staffError, loadStaff]);

  // ─── Filters ───────────────────────────────────────────────────────────────
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);

  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<"" | OrderStatus>("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    // `to` is inclusive: compare against the start of the following day.
    const fromMs = from ? new Date(from + "T00:00:00").getTime() : null;
    const toMs = to ? new Date(to + "T00:00:00").getTime() + 86_400_000 : null;

    return db.orders.filter((o: Order) => {
      // Drafts only appear when explicitly asked for.
      if (o.status === DRAFT && status !== DRAFT) return false;
      if (status && o.status !== status) return false;

      if (fromMs !== null || toMs !== null) {
        const t = o.created_at ? new Date(o.created_at).getTime() : NaN;
        if (Number.isNaN(t)) return false;
        if (fromMs !== null && t < fromMs) return false;
        if (toMs !== null && t >= toMs) return false;
      }

      if (needle) {
        const byName = (o.customer_name || "").toLowerCase().includes(needle);
        const byPhone = digits.length > 0 && (o.customer_phone || "").replace(/\D/g, "").includes(digits);
        const byNo = String(o.order_no).includes(digits || needle);
        if (!byName && !byPhone && !byNo) return false;
      }
      return true;
    });
  }, [db.orders, q, from, to, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize);

  // Any filter change puts you back on page 1 — otherwise you can land on a page
  // that no longer exists and see an empty table.
  useEffect(() => { setPage(1); }, [q, from, to, status, pageSize]);

  const anyFilter = q !== "" || from !== "" || to !== "" || status !== "";
  const clearAll = () => { setQ(""); setFrom(""); setTo(""); setStatus(""); };

  const quickRange = (days: number) => {
    const end = new Date();
    const begin = new Date();
    begin.setDate(begin.getDate() - (days - 1));
    setFrom(dayKey(begin));
    setTo(dayKey(end));
  };

  // ─── Assignment ────────────────────────────────────────────────────────────
  // Pending dropdown picks, per order. A selection only takes effect when the
  // admin presses Assign, so mis-clicking the dropdown doesn't reassign an order.
  const [pending, setPending] = useState<Record<string, string>>({});
  const [assigning, setAssigning] = useState<string | null>(null);
  const staffById = useMemo(
    () => Object.fromEntries(delivery.map((s) => [s.id, s])),
    [delivery]
  );

  const assign = async (id: string, staffId: string) => {
    setAssigning(id);
    try {
      await store.assignOrder(id, staffId);
      setPending((p) => { const { [id]: _drop, ...rest } = p; return rest; });
    } catch {
      window.alert("Could not save the assignment. Please try again.");
    } finally {
      setAssigning(null);
    }
  };

  // ─── Add a delivery boy (no staff screen exists yet) ───────────────────────
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPin, setNewPin] = useState("");
  const [saving, setSaving] = useState(false);

  // The rider signs in to the delivery app with this phone + PIN.
  const canAdd = newName.trim() !== "" && newPhone.trim() !== "" && newPin.length === 6;

  const addStaff = async () => {
    if (!canAdd) return;
    setSaving(true);
    try {
      await createStaff({
        name: newName.trim(), phone: newPhone.trim(), role: "delivery", pin: newPin,
      });
      await loadStaff();
      window.alert(
        `${newName.trim()} can now sign in at /#/delivery with:\n\n` +
        `Phone: ${newPhone.trim()}\nPIN: ${newPin}\n\nShare these with them.`
      );
      setNewName(""); setNewPhone(""); setNewPin(""); setShowAdd(false);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not add delivery boy");
    } finally {
      setSaving(false);
    }
  };

  // Reset a forgotten PIN.
  const resetPin = async (s: StaffMember) => {
    const pin = window.prompt(`New 6-digit PIN for ${s.name}:`);
    if (pin === null) return;
    if (!/^\d{6}$/.test(pin)) { window.alert("PIN must be exactly 6 digits."); return; }
    try {
      await resetStaffPin(s.id, pin);
      window.alert(`${s.name}'s PIN is now ${pin}. Share it with them.`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not reset PIN");
    }
  };

  // ─── Status actions ────────────────────────────────────────────────────────
  const approve = (o: Order) => {
    // A prepaid order is approved on the strength of the customer saying they've
    // paid, so make the admin look at the bank app first — approving marks it
    // Paid, and there's no gateway to disagree with them afterwards.
    const money =
      o.payment_method === "UPI" && o.payment_status !== "Paid"
        ? o.payment_status === "Pending"
          ? `\n\n💰 The customer says they've paid ${inr(o.grand_total)} by UPI.` +
            `\nCheck your bank app for reference MF${o.order_no} — approving marks this order PAID.`
          : `\n\n⚠️ This is a UPI order and no payment has been reported yet.`
        : "";

    if (window.confirm(
      `Approve order #${o.order_no}?\n\nThis sends the customer a WhatsApp "Order Confirmed" message.${money}`
    ))
      store.setOrderStatus(o.id, "Cutting/Packing");
  };

  // Delivery-agent details come from the assigned staff member — no retyping.
  const sendOut = (o: Order) => {
    const agent = o.assigned_to ? staffById[o.assigned_to] : undefined;
    if (!agent) return;
    if (window.confirm(
      `Send order #${o.order_no} out for delivery with ${agent.name}?\n\n` +
      `The customer gets a WhatsApp update with the delivery agent's name and number.`
    )) {
      store.setOrderStatus(o.id, "Out for delivery", { agentName: agent.name, agentPhone: agent.phone });
    }
  };

  const markDelivered = (o: Order) => {
    if (window.confirm(`Mark order #${o.order_no} as delivered? This notifies the customer.`))
      store.setOrderStatus(o.id, "Delivered");
  };

  // Cancelling without a reason made "the customer changed their mind" and "we
  // ran out of mutton" the same row, and only the second one is worth counting
  // at the end of a month. The list is the common cases; anything else is typed.
  const confirmCancel = async () => {
    if (!cancelling) return;
    const text = (reason === OTHER ? other : reason).trim();
    if (!text) return;

    setCancelBusy(true);
    try {
      await adminApi.cancelOrder(cancelling.id, text);
      setCancelling(null);
      await store.refreshOrders();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not cancel the order.");
    } finally {
      setCancelBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Orders</h1><div className="sub">Move through the flow · assign a delivery boy</div></div>
      </div>

      {/* ─── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="panel filters">
        <div className="filter-field grow">
          <label htmlFor="f-q">Search name, phone or order #</label>
          <input
            id="f-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Gowtham, 9154217648, 47"
          />
        </div>
        <div className="filter-field">
          <label htmlFor="f-from">From</label>
          <input id="f-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="filter-field">
          <label htmlFor="f-to">To</label>
          <input id="f-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="filter-field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | "")}>
            <option value="">All</option>
            {FLOW.map((s) => <option key={s} value={s}>{s}</option>)}
            <option value={DRAFT}>Draft (unconfirmed website carts)</option>
          </select>
        </div>

        <div className="filter-actions">
          <button className="btn sm ghost" onClick={() => quickRange(1)}>Today</button>
          <button className="btn sm ghost" onClick={() => quickRange(7)}>7 days</button>
          <button className="btn sm ghost" onClick={() => quickRange(30)}>30 days</button>
          {anyFilter && <button className="btn sm" onClick={clearAll}>✕ Clear</button>}
        </div>
      </div>

      {/* ─── Delivery staff ─────────────────────────────────────────────────── */}
      <div className="panel staff-bar">
        <span className="muted">
          🛵 Delivery staff:{" "}
          {staffLoading ? "loading…"
            : staffError ? <span style={{ color: "#c0392b" }}>{staffError}</span>
            : delivery.length === 0 ? <b>none yet — add one before dispatching</b>
            : delivery.map((d) => (
                <span key={d.id} className="staff-chip">
                  {d.name} <span className="muted">({d.phone})</span>
                  <span title={d.telegram_chat_id
                    ? "Telegram linked — gets a ping on assignment"
                    : "Not on Telegram yet — ask them to open the bot and share their number"}>
                    {d.telegram_chat_id ? "✈️" : "⚠️"}
                  </span>
                  {!d.telegram_chat_id && (
                    <button className="linkish" title="Send them the Telegram link on WhatsApp"
                      onClick={() => inviteToTelegram(d)}>Link&nbsp;✈️</button>
                  )}
                  <button className="linkish" title="Reset PIN" onClick={() => resetPin(d)}>🔑</button>
                </span>
              ))}
        </span>
        {staffError && !staffLoading && (
          <button className="btn sm" onClick={() => loadStaff()}>↻ Retry</button>
        )}
        {!showAdd && (
          <button className="btn sm ghost" onClick={() => setShowAdd(true)}>＋ Add delivery boy</button>
        )}
        {showAdd && (
          <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
              style={{ width: 150 }}
            />
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="+91 90000 00001"
              style={{ width: 170 }}
            />
            <input
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit PIN"
              inputMode="numeric"
              style={{ width: 120 }}
            />
            <button className="btn sm primary" disabled={saving || !canAdd} onClick={addStaff}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              className="btn sm ghost"
              onClick={() => { setShowAdd(false); setNewName(""); setNewPhone(""); setNewPin(""); }}
            >
              Cancel
            </button>
          </span>
        )}
      </div>

      <div className="panel">
        <div className="list-meta">
          <span className="muted">
            {filtered.length === 0
              ? "No matching orders"
              : `Showing ${start + 1}–${Math.min(start + pageSize, filtered.length)} of ${filtered.length}`}
            {anyFilter && db.orders.length !== filtered.length ? ` (filtered from ${db.orders.length})` : ""}
          </span>
          <span className="row" style={{ gap: 6 }}>
            <label htmlFor="f-size" style={{ margin: 0 }}>Per page</label>
            <select
              id="f-size"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              style={{ width: "auto" }}
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </span>
        </div>

        {db.orders.length === 0 ? (
          <p className="muted">No orders yet. Create one from <b>New Order</b>.</p>
        ) : filtered.length === 0 ? (
          <p className="muted">
            No orders match these filters. <button className="btn sm ghost" onClick={clearAll}>Clear filters</button>
          </p>
        ) : (
          <>
            <table>
              <thead>
                <tr><th>#</th><th>Placed</th><th>Customer</th><th>Items</th><th>Total</th><th>Pay</th><th>Status</th><th>Assign</th><th>Action</th></tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const picked = pending[o.id] ?? o.assigned_to ?? "";
                  const agent = o.assigned_to ? staffById[o.assigned_to] : undefined;
                  const placed = placedOn(o.created_at);
                  return (
                    <tr key={o.id}>
                      <td>
                        <Link to={`/orders/${o.id}`}>#{o.order_no}</Link>
                        {/* Taken while the shop was shut. Without this the night's
                            orders look identical to the morning's, and the one that
                            has been waiting since 11pm gets cut last. */}
                        {o.scheduled_for && (
                          <div className="pre-for" title={`Ordered while closed — prepare at ${new Date(o.scheduled_for).toLocaleString("en-IN")}`}>
                            ⏳ for {new Date(o.scheduled_for).toLocaleString("en-IN",
                              { hour: "numeric", minute: "2-digit", hour12: true })}
                          </div>
                        )}
                      </td>
                      <td className="nowrap" title={placed?.full}>
                        {placed ? (
                          <>
                            {placed.date}
                            <div className="muted" style={{ fontSize: 11 }}>{placed.time}</div>
                          </>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <Link to={`/orders/${o.id}`}>{o.customer_name}</Link>
                          <CustomerBadge order={o} />
                        </div>
                        <div><CustomerPhone phone={o.customer_phone} compact /></div>
                        <div className="muted" style={{ fontSize: 11 }}>{o.area}</div>
                      </td>
                      <td className="muted">
                        <Link to={`/orders/${o.id}`} style={{ color: "inherit" }}>
                          {o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}
                        </Link>
                      </td>
                      <td>{inr(o.grand_total)}</td>
                      <td>
                        <span className={"pill " + o.payment_status}>{o.payment_method}</span>
                        {/* Nothing calls us back when a UPI transfer lands, so the
                            shop has to see at a glance which orders are still owed. */}
                        {o.payment_method === "UPI" && o.payment_status !== "Paid" && (
                          <div className={"paychip " + (o.payment_status === "Pending" ? "claimed" : "owed")}>
                            {o.payment_status === "Pending" ? "says paid — verify" : "awaiting payment"}
                          </div>
                        )}
                        {o.payment_status === "Paid" && (
                          <div className="paychip ok">✓ paid</div>
                        )}
                      </td>
                      <td><span className={"pill " + o.status.replace(/[\/ ].*/, "")}>{o.status}</span></td>
                      <td>
                        <div className="assign-cell">
                          <select
                            value={picked}
                            disabled={o.status === "Delivered" || delivery.length === 0}
                            onChange={(e) => setPending((p) => ({ ...p, [o.id]: e.target.value }))}
                          >
                            <option value="">{delivery.length === 0 ? "— no staff —" : "— select —"}</option>
                            {delivery.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                          <button
                            className="btn sm"
                            disabled={!picked || picked === o.assigned_to || assigning === o.id}
                            onClick={() => assign(o.id, picked)}
                          >
                            {assigning === o.id ? "…" : "Assign"}
                          </button>
                        </div>
                        {agent && (
                          <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                            ✓ {agent.name} · {agent.phone}
                          </div>
                        )}
                      </td>
                      <td>
                        {/* One row, one gap. The cancel button used to carry its own
                            margin beside a bare "—", which left the column ragged
                            and the two controls at different heights. */}
                        <div className="ord-actions">
                          {o.status === "New" ? (
                            <button className="btn sm primary" onClick={() => approve(o)}>✓ Approve</button>
                          ) : o.status === "Cutting/Packing" ? (
                            <button
                              className="btn sm primary"
                              disabled={!agent}
                              title={agent ? `Dispatch with ${agent.name}` : "Assign a delivery boy first"}
                              onClick={() => sendOut(o)}
                            >
                              🛵 Out for delivery
                            </button>
                          ) : o.status === "Out for delivery" ? (
                            <button className="btn sm" onClick={() => markDelivered(o)}>✓ Delivered</button>
                          ) : o.status === "Delivered" ? (
                            <span className="free">✓ Done</span>
                          ) : (
                            <span className="ord-none">—</span>
                          )}

                          {/* Cancelling stays available right up to delivery — most
                              cancellations happen once the order is already being
                              cut, which is exactly when the reason matters. Quiet
                              by default: it must never be the easiest thing to hit
                              next to Approve. */}
                          {o.status !== "Delivered" && o.status !== "Cancelled" && (
                            <button className="btn sm danger ord-cancel"
                              title={`Cancel order #${o.order_no}`}
                              onClick={() => { setCancelling(o); setReason(""); setOther(""); }}>
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {pageCount > 1 && (
              <div className="pager">
                <button className="btn sm ghost" disabled={current === 1} onClick={() => setPage(1)}>« First</button>
                <button className="btn sm ghost" disabled={current === 1} onClick={() => setPage(current - 1)}>‹ Prev</button>
                <span className="muted">Page {current} of {pageCount}</span>
                <button className="btn sm ghost" disabled={current === pageCount} onClick={() => setPage(current + 1)}>Next ›</button>
                <button className="btn sm ghost" disabled={current === pageCount} onClick={() => setPage(pageCount)}>Last »</button>
              </div>
            )}
          </>
        )}
      </div>

      {cancelling && (
        <div className="modal-back" onClick={() => !cancelBusy && setCancelling(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Cancel order #{cancelling.order_no}?</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
              {cancelling.customer_name || "The customer"} is told the order is cancelled.
              Pick the reason — it stays on the order.
            </p>

            <div className="cx-reasons">
              {CANCEL_REASONS.map((r) => (
                <button key={r} className="cx-reason" aria-checked={reason === r} role="radio"
                  disabled={cancelBusy} onClick={() => setReason(r)}>
                  <span className="dot" />{r}
                </button>
              ))}
            </div>

            {reason === OTHER && (
              <input autoFocus value={other} maxLength={300} placeholder="What happened?"
                style={{ width: "100%", marginTop: 10 }}
                onChange={(e) => setOther(e.target.value)} />
            )}

            <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button className="btn" disabled={cancelBusy} onClick={() => setCancelling(null)}>
                Keep the order
              </button>
              <button className="btn danger" onClick={confirmCancel}
                disabled={cancelBusy || !reason || (reason === OTHER && !other.trim())}>
                {cancelBusy ? "Cancelling…" : "Cancel the order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
