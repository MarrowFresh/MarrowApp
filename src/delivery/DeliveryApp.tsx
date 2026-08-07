// =====================================================================
//  MARROW FRESH — Delivery app (App 2)  ·  mobile PWA view
//  Delivery boy sees ONLY: customer name + address + items + amount.
//  NEVER the customer's phone number (privacy rule from brand guide).
// =====================================================================
import { useState } from "react";
import { useDB } from "../useStore";
import { store } from "../lib/data";
import type { Order } from "../lib/types";
import "./delivery.css";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");
const SESSION = "marrow_delivery_session";

export default function DeliveryApp() {
  const db = useDB();
  const [staffId, setStaffId] = useState<string | null>(
    () => localStorage.getItem(SESSION)
  );

  const me = db.staff.find((s) => s.id === staffId && s.role === "delivery");

  if (!me) return <Login onLogin={(id) => { localStorage.setItem(SESSION, id); setStaffId(id); }} />;

  const myOrders = db.orders.filter(
    (o) =>
      o.assigned_to === me.id &&
      o.status !== "Delivered" &&
      o.status !== "Cancelled"
  );
  const done = db.orders.filter(
    (o) => o.assigned_to === me.id && o.status === "Delivered"
  );

  return (
    <div className="dframe">
      <header className="dhead">
        <div>
          <div className="dbrand">Marrow<b>Fresh</b></div>
          <div className="dsub">Delivery · {me.name}</div>
        </div>
        <button className="dlogout" onClick={() => { localStorage.removeItem(SESSION); setStaffId(null); }}>Logout</button>
      </header>

      <div className="dbody">
        <div className="dcount">{myOrders.length} active · {done.length} delivered today</div>

        {myOrders.length === 0 && (
          <div className="dempty">
            🎉 No pending deliveries.<br />
            <span>Orders assigned to you by the shop appear here.</span>
          </div>
        )}

        {myOrders.map((o) => <OrderCard key={o.id} o={o} />)}

        {done.length > 0 && (
          <>
            <div className="dsection">Delivered</div>
            {done.map((o) => (
              <div className="dcard done" key={o.id}>
                <div className="drow"><b>#{o.order_no}</b> · {o.customer_name}<span className="dtick">✓</span></div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function OrderCard({ o }: { o: Order }) {
  const mapHref =
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(`${o.address ?? ""} ${o.area ?? ""} Hyderabad`);

  const advance =
    o.status === "Out for delivery"
      ? null
      : { label: "Picked up — Out for delivery", to: "Out for delivery" as const };

  return (
    <div className="dcard">
      <div className="drow">
        <b>#{o.order_no}</b>
        <span className={"dpill " + o.status.replace(/[\/ ].*/, "")}>{o.status}</span>
      </div>

      <div className="dcust">{o.customer_name}</div>
      <div className="daddr">📍 {o.address || "—"}{o.area ? `, ${o.area}` : ""}</div>

      <ul className="ditems">
        {o.lines.map((l, i) => (
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

      {/* NOTE: customer phone is intentionally NOT shown. */}
      <div className="dnote">Call needed? Contact the shop — number is private.</div>

      <div className="dactions">
        <a className="dbtn map" href={mapHref} target="_blank" rel="noreferrer">🗺️ Maps</a>
        {advance && (
          <button className="dbtn go" onClick={() => store.setOrderStatus(o.id, advance.to)}>
            {advance.label}
          </button>
        )}
        {o.status === "Out for delivery" && (
          <button className="dbtn done" onClick={() => {
            store.markPaid(o.id);
            store.setOrderStatus(o.id, "Delivered");
          }}>✓ Delivered</button>
        )}
      </div>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (id: string) => void }) {
  const db = useDB();
  const riders = db.staff.filter((s) => s.role === "delivery" && s.active);
  const [pin, setPin] = useState("");
  const [pick, setPick] = useState<string>("");

  return (
    <div className="dframe">
      <div className="dlogin">
        <div className="dmark">M</div>
        <div className="dbrand big">Marrow<b>Fresh</b></div>
        <div className="dsub">Delivery partner login</div>

        <label className="dlabel">Who are you?</label>
        <select className="dselect" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Select your name…</option>
          {riders.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        <label className="dlabel">PIN</label>
        <input className="dinput" inputMode="numeric" value={pin} placeholder="e.g. 1234"
          onChange={(e) => setPin(e.target.value)} />

        <button className="dbtn go full" disabled={!pick || pin.length < 4}
          onClick={() => onLogin(pick)}>Login</button>
        <div className="dhint">Demo: pick a name, type any 4-digit PIN.</div>
      </div>
    </div>
  );
}
