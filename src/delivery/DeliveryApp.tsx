// =====================================================================
//  MARROW FRESH — Delivery app (App 2)  ·  mobile PWA view
//  A rider signs in with their phone + 6-digit PIN and sees only the
//  orders assigned to them. They can leave a remark and move an order
//  to "Out for delivery" and then "Delivered".
// =====================================================================
import { useCallback, useEffect, useState } from "react";
import {
  riderAuth, useRiderAuth, fetchMyOrders, updateMyOrder,
  type RiderOrder,
} from "../lib/deliveryApi";
import "./delivery.css";

const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN");
const when = (s?: string | null) => (s ? new Date(s).toLocaleString("en-IN") : "—");

export default function DeliveryApp() {
  const token = useRiderAuth();
  if (!token) return <Login />;
  return <MyOrders />;
}

// ─── Login ───────────────────────────────────────────────────────────────────
function Login() {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = phone.replace(/\D/g, "").length >= 10 && pin.length === 6 && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true); setError(null);
    try {
      await riderAuth.login(phone.trim(), pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dframe">
      <form className="dlogin" onSubmit={submit}>
        <div className="dmark">M</div>
        <div className="dbrand big">Marrow<b>Fresh</b></div>
        <div className="dsub">Delivery partner login</div>

        <label className="dlabel">Phone number</label>
        <input
          className="dinput"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          placeholder="9347625048"
          onChange={(e) => setPhone(e.target.value)}
        />

        <label className="dlabel">6-digit PIN</label>
        <input
          className="dinput"
          inputMode="numeric"
          type="password"
          autoComplete="current-password"
          maxLength={6}
          value={pin}
          placeholder="••••••"
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />

        {error && <div className="derror">{error}</div>}

        <button className="dbtn go full" type="submit" disabled={!canSubmit}>
          {busy ? "Signing in…" : "Login"}
        </button>
        <div className="dhint">Ask the shop for your PIN if you've forgotten it.</div>
      </form>
    </div>
  );
}

// ─── Order list ──────────────────────────────────────────────────────────────
function MyOrders() {
  const [orders, setOrders] = useState<RiderOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return fetchMyOrders()
      .then((o) => { setOrders(o); setError(null); })
      .catch((e) => setError(e?.message || "Could not load your orders"))
      .finally(() => setLoading(false));
  }, []);

  // Poll so newly assigned orders turn up without the rider refreshing.
  useEffect(() => {
    load();
    const iv = setInterval(load, 20000);
    return () => clearInterval(iv);
  }, [load]);

  const active = orders.filter((o) => o.status !== "Delivered" && o.status !== "Cancelled");
  const done = orders.filter((o) => o.status === "Delivered");

  return (
    <div className="dframe">
      <header className="dhead">
        <div>
          <div className="dbrand">Marrow<b>Fresh</b></div>
          <div className="dsub">Delivery · {riderAuth.name()}</div>
        </div>
        <button className="dlogout" onClick={() => riderAuth.logout()}>Logout</button>
      </header>

      <div className="dbody">
        <div className="dcount">
          {loading ? "Loading…" : `${active.length} active · ${done.length} delivered`}
          <button className="drefresh" onClick={() => load()}>↻</button>
        </div>

        {error && <div className="derror">{error}</div>}

        {!loading && active.length === 0 && (
          <div className="dempty">
            🎉 No pending deliveries.<br />
            <span>Orders assigned to you by the shop appear here.</span>
          </div>
        )}

        {active.map((o) => <OrderCard key={o.id} o={o} onDone={load} />)}

        {done.length > 0 && (
          <>
            <div className="dsection">Delivered</div>
            {done.map((o) => (
              <div className="dcard done" key={o.id}>
                <div className="drow">
                  <b>#{o.order_no}</b> · {o.customer_name}
                  <span className="dtick">✓</span>
                </div>
                <div className="dmuted">{when(o.delivered_at)}</div>
                {o.remarks && <div className="dremark">📝 {o.remarks}</div>}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── One order ───────────────────────────────────────────────────────────────
function OrderCard({ o, onDone }: { o: RiderOrder; onDone: () => void }) {
  const [remarks, setRemarks] = useState(o.remarks || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const mapHref =
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(`${o.address ?? ""} Hyderabad`);
  const telHref = `tel:+${(o.customer_phone || "").replace(/\D/g, "")}`;

  const run = async (input: { status?: string; remarks?: string }, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true); setErr(null);
    try {
      await updateMyOrder(o.id, input);
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const remarkChanged = remarks.trim() !== (o.remarks || "").trim();

  return (
    <div className="dcard">
      <div className="drow">
        <b>#{o.order_no}</b>
        <span className={"dpill " + o.status.replace(/[\/ ].*/, "")}>{o.status}</span>
      </div>

      <div className="dcust">{o.customer_name}</div>
      <div className="daddr">📍 {o.address || "No address on file"}</div>
      {o.distance_km > 0 && <div className="dmuted">{o.distance_km.toFixed(1)} km from the shop</div>}

      <ul className="ditems">
        {o.items.map((l, i) => (
          <li key={i}>{l.qty}× {l.name}</li>
        ))}
      </ul>

      <div className="dpay">
        {o.payment_status === "Paid" ? (
          <span className="dpaid">✓ PAID via {o.payment_method}</span>
        ) : (
          <span className="dcollect">Collect {inr(o.grand_total)} · {o.payment_method}</span>
        )}
      </div>

      {o.remarks && !open && (
        <div className="dremark">
          📝 {o.remarks}
          {o.remarks_by ? <span className="dmuted"> — {o.remarks_by}</span> : null}
        </div>
      )}

      {err && <div className="derror">{err}</div>}

      <div className="dactions">
        <a className="dbtn map" href={mapHref} target="_blank" rel="noreferrer">🗺️ Maps</a>
        {o.customer_phone && <a className="dbtn call" href={telHref}>📞 Call</a>}
        <button className="dbtn note" onClick={() => setOpen((v) => !v)}>
          📝 {open ? "Close" : "Remark"}
        </button>
      </div>

      {open && (
        <div className="dremark-edit">
          <textarea
            className="dtextarea"
            rows={2}
            value={remarks}
            placeholder="e.g. customer not home, left with security"
            onChange={(e) => setRemarks(e.target.value)}
          />
          <button
            className="dbtn go"
            disabled={busy || !remarkChanged}
            onClick={() => run({ remarks })}
          >
            {busy ? "Saving…" : "Save remark"}
          </button>
        </div>
      )}

      <div className="dactions">
        {o.status !== "Out for delivery" && o.status !== "Delivered" && (
          <button
            className="dbtn go full"
            disabled={busy}
            onClick={() => run(
              { status: "Out for delivery", ...(remarkChanged ? { remarks } : {}) },
              `Picked up order #${o.order_no}?\n\nThe customer is told it's on the way.`
            )}
          >
            🛵 Picked up — Out for delivery
          </button>
        )}

        {o.status === "Out for delivery" && (
          <button
            className="dbtn done full"
            disabled={busy}
            onClick={() => run(
              { status: "Delivered", ...(remarkChanged ? { remarks } : {}) },
              `Mark order #${o.order_no} as delivered?\n\nThe customer is notified.`
            )}
          >
            ✓ Delivered
          </button>
        )}
      </div>
    </div>
  );
}
