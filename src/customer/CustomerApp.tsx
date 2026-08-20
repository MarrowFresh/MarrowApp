// =====================================================================
//  MARROW FRESH — Customer app (App 3)  ·  storefront + login + ordering
import { Logo } from "../components/Logo";
//  Design ported from the existing website (marrow-bold.html).
//  Orders placed here flow straight into Admin → Delivery (shared store).
// =====================================================================
import { useMemo, useState } from "react";
import { useDB } from "../useStore";
import { store } from "../lib/data";
import { priceOrder } from "../lib/pricing";
import type { CartLine, Category, OrderStatus } from "../lib/types";
import "./customer.css";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");
const CAT_ORDER: Category[] = ["Chicken", "Mutton", "Fish", "Prawns", "Crabs", "Eggs"];
const CAT_ICON: Record<Category, string> = {
  Chicken: "🐔", Mutton: "🐐", Fish: "🐟", Prawns: "🦐", Crabs: "🦀", Eggs: "🥚",
};
const SESSION = "marrow_customer";
const MY_ORDERS = "marrow_customer_orders";
const DEMO_OTP = "123456";

interface Session { name: string; phone: string; }

export default function CustomerApp() {
  const db = useDB();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [coupon, setCoupon] = useState("");
  const [session, setSession] = useState<Session | null>(() => {
    try { return JSON.parse(localStorage.getItem(SESSION) || "null"); } catch { return null; }
  });
  const [view, setView] = useState<"shop" | "cart" | "login" | "checkout" | "tracking">("shop");
  const [placedId, setPlacedId] = useState<string | null>(null);

  // build cart lines from product ids + qty
  const lines: CartLine[] = useMemo(
    () => Object.entries(cart).flatMap(([id, qty]) => {
      const p = db.products.find((x) => x.id === id);
      if (!p || qty <= 0) return [];
      return [{ ref_id: p.id, kind: "product", name: `${p.category} · ${p.name}`,
        category: p.category, qty, price_each: p.price, weight_each: p.weight_kg }];
    }),
    [cart, db.products]
  );
  const breakdown = useMemo(
    () => priceOrder(lines, db.settings, db.rules, { couponCode: coupon, coupons: db.coupons }),
    [lines, db.settings, db.rules, db.coupons, coupon]
  );
  const count = lines.reduce((s, l) => s + l.qty, 0);

  const setQty = (id: string, q: number) =>
    setCart((c) => ({ ...c, [id]: Math.max(0, q) }));

  const banners = db.banners.filter((b) => b.active &&
    (b.placement === "home_hero" || b.placement === "strip"));

  const myOrders = (() => {
    try {
      const ids: string[] = JSON.parse(localStorage.getItem(MY_ORDERS) || "[]");
      return ids.map((id) => db.orders.find((o) => o.id === id)).filter(Boolean);
    } catch { return []; }
  })() as NonNullable<ReturnType<typeof db.orders.find>>[];

  return (
    <div className="cust">
      {/* HEADER */}
      <header className="chdr">
        <div className="wrap cnav">
          <div className="cbrand">
            <Logo height={40} />
            <div className="name">Marrow<b>Fresh</b></div>
          </div>
          <div className="cnav-right">
            {myOrders.length > 0 && (
              <button className="clink" onClick={() => setView("tracking")}>My Orders</button>
            )}
            {session ? (
              <button className="clink" onClick={() => { localStorage.removeItem(SESSION); setSession(null); }}>
                Hi, {session.name.split(" ")[0]} · Logout
              </button>
            ) : (
              <button className="clink" onClick={() => setView("login")}>Login</button>
            )}
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="blob b1" /><div className="blob b2" />
        <div className="seal" aria-hidden>
          <svg viewBox="0 0 100 100" width="130" height="130">
            <defs><path id="cseal" d="M50,50 m-40,0 a40,40 0 1,1 80,0 a40,40 0 1,1 -80,0" /></defs>
            <text fontFamily="Poppins,sans-serif" fontSize="9.2" fill="#221913" fontWeight="500">
              <textPath href="#cseal" startOffset="0">FRESH · NEVER FROZEN · CUT TO ORDER · </textPath>
            </text>
          </svg>
          <span className="ctr">M</span>
        </div>
        <div className="wrap hero-inner">
          <span className="eyebrow"><span className="dot" /> Fresh meat · KPHB, Hyderabad</span>
          <h1 className="disp">Cut <span className="fill">fresh.</span><br /><span className="out">Never</span> frozen.</h1>
          <p className="lead">We cut it the moment you order and rush it to your door in 20–30 minutes — chilled, never frozen.</p>
          {banners.length > 0 && (
            <div className="promo">
              {banners.map((b, i) => (
                <div className={"pb" + (i % 2 ? " alt" : "")} key={b.id}>
                  <b>{b.title}</b>
                  {b.link_to && <span className="tag">{b.link_to}</span>}
                </div>
              ))}
            </div>
          )}
          <div className="trust">
            <div className="t"><span className="ic">🔪</span><div><b>Cut to order</b><span>Portioned only when you order</span></div></div>
            <div className="t"><span className="ic">❄️</span><div><b>Never frozen</b><span>Chilled, straight to you</span></div></div>
            <div className="t"><span className="ic">⏱️</span><div><b>20–30 min</b><span>Across KPHB, Hyderabad</span></div></div>
          </div>
        </div>
      </section>

      <div className="ticker">
        <div className="run">
          <span>ALWAYS FRESH</span><span className="star">✦</span><span>NEVER FROZEN</span>
          <span className="star">✦</span><span>CUT TO ORDER</span><span className="star">✦</span>
          <span>20–30 MIN DELIVERY</span><span className="star">✦</span>
          <span>ALWAYS FRESH</span><span className="star">✦</span><span>NEVER FROZEN</span>
          <span className="star">✦</span><span>CUT TO ORDER</span><span className="star">✦</span>
          <span>20–30 MIN DELIVERY</span><span className="star">✦</span>
        </div>
      </div>

      {/* CATEGORY QUICK NAV */}
      <div className="catnav">
        <div className="wrap">
          <div className="row">
            {CAT_ORDER.filter((c) => db.products.some((p) => p.category === c && p.available)).map((c) => (
              <a className="chip" key={c} href={"#cat-" + c}>{CAT_ICON[c]} {c}</a>
            ))}
          </div>
        </div>
      </div>

      {/* SHOP */}
      <section className="shop">
        <div className="wrap">
          {CAT_ORDER.map((cat) => {
            const items = db.products.filter((p) => p.category === cat && p.available);
            if (items.length === 0) return null;
            return (
              <div className="cat" id={"cat-" + cat} key={cat}>
                <div className="cat-head">
                  <span className="em">{CAT_ICON[cat]}</span>
                  <h2>{cat}</h2>
                  <span className="ln" />
                </div>
                <div className="pgrid">
                  {items.map((p) => (
                    <div className="prod" key={p.id}>
                      <div className="med">{CAT_ICON[cat]}</div>
                      <div className="pn">{p.name}</div>
                      <div className="pu">{cat} · per {p.unit}</div>
                      <div className="pbottom">
                        <div className="pp">{inr(p.price)} <small>/{p.unit}</small></div>
                        {cart[p.id] ? (
                          <div className="qstep">
                            <button onClick={() => setQty(p.id, (cart[p.id] || 0) - 1)}>−</button>
                            <span className="q">{cart[p.id]}</span>
                            <button onClick={() => setQty(p.id, (cart[p.id] || 0) + 1)}>+</button>
                          </div>
                        ) : (
                          <button className="btn fill" onClick={() => setQty(p.id, 1)}>Add +</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="cfoot">
        <div className="wrap">
          <div className="top">
            <div className="fb">
              <div className="name">Marrow<b>Fresh</b></div>
              <p>Premium fresh meat, cut only after you order. Always fresh, never frozen — across KPHB, Hyderabad.</p>
            </div>
            <div className="fc">
              <h4>Contact</h4>
              <span>WhatsApp +91 94944 90991</span>
              <span>hello@marrowfresh.com</span>
              <span>KPHB Phase 4, Kukatpally</span>
            </div>
            <div className="fc">
              <h4>Hours</h4>
              <span>Mon – Sun</span>
              <span>7:00 AM – 9:00 PM</span>
              <span style={{ color: "var(--saffron)" }}>20–30 min delivery</span>
            </div>
          </div>
          <div className="base">
            <span>© 2026 Marrow Fresh. All rights reserved.</span>
            <span>Always fresh · Never frozen</span>
          </div>
        </div>
      </footer>

      {/* FLOATING CART */}
      {count > 0 && view === "shop" && (
        <button className="fab" onClick={() => setView("cart")}>
          🛒 <span className="badge">{count}</span> · {inr(breakdown.grand_total)}
        </button>
      )}

      {/* CART DRAWER */}
      {view === "cart" && (
        <div className="scrim" onClick={() => setView("shop")}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="dh"><h3>Your basket</h3><button className="x" onClick={() => setView("shop")}>✕</button></div>
            {lines.map((l) => (
              <div className="cl" key={l.ref_id}>
                <span className="nm">{l.name}<br /><span className="pu">{inr(l.price_each)} × {l.qty}</span></span>
                <div className="qstep">
                  <button onClick={() => setQty(l.ref_id, l.qty - 1)}>−</button>
                  <span className="q">{l.qty}</span>
                  <button onClick={() => setQty(l.ref_id, l.qty + 1)}>+</button>
                </div>
              </div>
            ))}
            <label>Coupon code</label>
            <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="WELCOME10" />
            {breakdown.coupon_error && <div className="err">{breakdown.coupon_error}</div>}

            <div style={{ height: 14 }} />
            <div className="tl"><span>Subtotal</span><span>{inr(breakdown.subtotal)}</span></div>
            {breakdown.discount > 0 && <div className="tl"><span>Coupon {breakdown.coupon_applied}</span><span>−{inr(breakdown.discount)}</span></div>}
            <div className="tl"><span>Delivery</span><span>{breakdown.delivery_waived ? <span className="free">FREE</span> : inr(breakdown.delivery_fee)}</span></div>
            {db.settings.packing_fee_enabled && <div className="tl"><span>Packing</span><span>{breakdown.packing_waived ? <span className="free">FREE</span> : inr(breakdown.packing_fee)}</span></div>}
            {db.settings.platform_fee_enabled && <div className="tl"><span>Platform fee</span><span>{inr(breakdown.platform_fee)}</span></div>}
            <div className="tl grand"><span>Total</span><span>{inr(breakdown.grand_total)}</span></div>
            {breakdown.free_delivery_nudge && <div className="nudge">💡 {breakdown.free_delivery_nudge}</div>}

            <div style={{ height: 16 }} />
            <button className="btn fill full" onClick={() => setView(session ? "checkout" : "login")}>
              {session ? "Checkout" : "Login to checkout"}
            </button>
          </div>
        </div>
      )}

      {view === "login" && (
        <LoginSheet
          onClose={() => setView(count > 0 ? "cart" : "shop")}
          onLogin={(s) => { localStorage.setItem(SESSION, JSON.stringify(s)); setSession(s); setView(count > 0 ? "checkout" : "shop"); }}
        />
      )}

      {view === "checkout" && session && (
        <Checkout
          session={session} breakdown={breakdown}
          onClose={() => setView("cart")}
          onPlace={(address, area, pay) => {
            const id = store.placeOrder({
              customer_name: session.name, address, area, status: "New", lines,
              subtotal: breakdown.subtotal, total_weight: breakdown.total_weight,
              coupon_code: breakdown.coupon_applied, discount: breakdown.discount,
              delivery_fee: breakdown.delivery_fee, packing_fee: breakdown.packing_fee,
              platform_fee: breakdown.platform_fee, tax_total: breakdown.tax_total,
              grand_total: breakdown.grand_total, payment_method: pay, payment_status: "Unpaid",
            });
            const ids = JSON.parse(localStorage.getItem(MY_ORDERS) || "[]");
            localStorage.setItem(MY_ORDERS, JSON.stringify([id, ...ids]));
            setPlacedId(id); setCart({}); setCoupon(""); setView("tracking");
          }}
        />
      )}

      {view === "tracking" && (
        <Tracking orders={placedId ? myOrders : myOrders} highlight={placedId}
          onClose={() => { setPlacedId(null); setView("shop"); }} />
      )}
    </div>
  );
}

// --- Login (phone + OTP, simulated) ----------------------------------
function LoginSheet({ onClose, onLogin }: { onClose: () => void; onLogin: (s: Session) => void; }) {
  const [stage, setStage] = useState<"phone" | "otp">("phone");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState("");

  return (
    <div className="scrim center" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="dh"><h3>{stage === "phone" ? "Login" : "Verify"}</h3><button className="x" onClick={onClose}>✕</button></div>
        {stage === "phone" ? (
          <>
            <label>Your name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            <label>Mobile number</label>
            <input value={phone} inputMode="numeric" onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" />
            <div style={{ height: 16 }} />
            <button className="btn dark full" disabled={!name || phone.length < 10}
              onClick={() => setStage("otp")}>Send OTP</button>
            <div className="hint">We'll text a one-time code to confirm.</div>
          </>
        ) : (
          <>
            <label>Enter the 6-digit OTP</label>
            <input className="otp" maxLength={6} inputMode="numeric" value={otp}
              onChange={(e) => { setOtp(e.target.value); setErr(""); }} placeholder="••••••" />
            {err && <div className="err">{err}</div>}
            <div style={{ height: 16 }} />
            <button className="btn fill full" disabled={otp.length < 6}
              onClick={() => otp === DEMO_OTP ? onLogin({ name, phone }) : setErr("Wrong code. (Demo OTP is 123456)")}>
              Verify & continue
            </button>
            <div className="hint">Demo OTP: <b>123456</b></div>
          </>
        )}
      </div>
    </div>
  );
}

// --- Checkout --------------------------------------------------------
function Checkout({ session, breakdown, onClose, onPlace }: {
  session: Session;
  breakdown: { grand_total: number };
  onClose: () => void;
  onPlace: (address: string, area: string, pay: "UPI" | "Cash") => void;
}) {
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("KPHB Phase 4");
  const [pay, setPay] = useState<"UPI" | "Cash">("UPI");

  return (
    <div className="scrim center" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="dh"><h3>Delivery details</h3><button className="x" onClick={onClose}>✕</button></div>
        <div className="hint" style={{ textAlign: "left" }}>Delivering to {session.name}</div>
        <label>Full address</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Flat / house, street, landmark" />
        <label>Area</label>
        <input value={area} onChange={(e) => setArea(e.target.value)} />
        <label>Payment</label>
        <div style={{ display: "flex", gap: 10 }}>
          <button className={"btn " + (pay === "UPI" ? "saff" : "line")} style={{ flex: 1 }} onClick={() => setPay("UPI")}>UPI</button>
          <button className={"btn " + (pay === "Cash" ? "saff" : "line")} style={{ flex: 1 }} onClick={() => setPay("Cash")}>Cash</button>
        </div>
        <div style={{ height: 18 }} />
        <button className="btn fill full" disabled={!address}
          onClick={() => onPlace(address, area, pay)}>
          Place order · {inr(breakdown.grand_total)}
        </button>
      </div>
    </div>
  );
}

// --- Order tracking --------------------------------------------------
const FLOW: OrderStatus[] = ["New", "Cutting/Packing", "Out for delivery", "Delivered"];
const FLOW_LABEL: Record<string, string> = {
  "New": "Order placed", "Cutting/Packing": "Cutting fresh & packing",
  "Out for delivery": "Out for delivery", "Delivered": "Delivered",
};

function Tracking({ orders, highlight, onClose }: {
  orders: { id: string; order_no: number; status: OrderStatus; grand_total: number; lines: CartLine[] }[];
  highlight: string | null;
  onClose: () => void;
}) {
  return (
    <div className="scrim center" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "86vh", overflow: "auto" }}>
        <div className="dh">
          <h3>{highlight ? "🎉 Order placed!" : "My orders"}</h3>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        {orders.length === 0 && <p className="hint">No orders yet.</p>}
        {orders.map((o) => {
          const idx = FLOW.indexOf(o.status);
          return (
            <div key={o.id} style={{ marginBottom: 20, paddingBottom: 8, borderBottom: "1px solid rgba(34,25,19,.1)" }}>
              <div className="tl"><b>Order #{o.order_no}</b><span>{inr(o.grand_total)}</span></div>
              <div className="pu" style={{ marginBottom: 10 }}>{o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</div>
              {o.status === "Cancelled" ? (
                <div className="err">Cancelled</div>
              ) : (
                <div className="track">
                  {FLOW.map((s, i) => (
                    <div className={"tstep" + (i <= idx ? " on" : "")} key={s}>
                      <div className="dot">{i <= idx ? "✓" : i + 1}</div>
                      <div className="tt">{FLOW_LABEL[s]}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
