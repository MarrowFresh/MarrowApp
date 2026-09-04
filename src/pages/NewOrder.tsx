import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi, quoteOrder, createAdminOrder } from "../lib/apiClient";

// Orders the shop takes on the phone.
//
// This screen used to carry its own hardcoded product list and its own pricing
// engine, neither connected to anything. Chicken Curry Cut read ₹200 here while
// a customer paid ₹129, and mutton was out by ₹388. Two pricing engines always
// drift; the fix is to have one.
//
// So: the catalogue comes from the database, and every total comes from
// /api/checkout/quote — the same endpoint the website uses. The shop can still
// override a line price, the delivery fee or the total, and each override is
// shown while typing and recorded on the order.
type Row = Record<string, any>;

const inr = (n: number) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");

interface CartLine {
  key: string;
  productId: string;
  variantId: string;
  name: string;
  variant: string;
  category: string;
  qty: number;
  price: number;      // what will be charged
  listPrice: number;  // what the catalogue says
  weightKg: number;
}

export default function NewOrder() {
  const navigate = useNavigate();

  const [products, setProducts] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({}); // product id → variant id

  const [cart, setCart] = useState<CartLine[]>([]);
  const [coupon, setCoupon] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("KPHB Phase 4");
  const [km, setKm] = useState("2.5");
  const [pay, setPay] = useState<"upi" | "cash">("upi");

  const [feeOverride, setFeeOverride] = useState<string>("");
  const [adjustment, setAdjustment] = useState<string>("");
  const [note, setNote] = useState("");

  const [quote, setQuote] = useState<Row | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Only sellable things. A hidden or pre-order product cannot be put in a
  // basket on the website either, so it must not be here.
  useEffect(() => {
    adminApi.getProducts()
      .then((rows: Row[]) => setProducts(
        rows.filter((p) => p.available !== false && !p.preorder)
      ))
      .catch((e) => setErr(e?.message || "Could not load the catalogue"))
      .finally(() => setLoading(false));
  }, []);

  const packsOf = (p: Row): Row[] =>
    (p.product_variants || [])
      .filter((v: Row) => v.hidden !== true && v.available !== false && Number(v.price) > 0)
      .sort((a: Row, b: Row) => (a.sort_order || 0) - (b.sort_order || 0));

  const sellable = products.filter((p) => packsOf(p).length > 0);
  const cats = [...new Set(sellable.map((p) => p.category))].sort();

  const list = sellable.filter((p) =>
    (!cat || p.category === cat) &&
    (!q.trim() || `${p.category} ${p.name}`.toLowerCase().includes(q.trim().toLowerCase()))
  );

  const add = (p: Row) => {
    const packs = packsOf(p);
    const v = packs.find((x) => x.id === picked[p.id]) || packs[0];
    if (!v) return;

    const key = `${p.id}::${v.id}`;
    setCart((c) => {
      const at = c.findIndex((l) => l.key === key);
      if (at >= 0) return c.map((l, i) => (i === at ? { ...l, qty: l.qty + 1 } : l));
      return [...c, {
        key,
        productId: p.id,
        variantId: v.id,
        name: p.name,
        variant: v.label,
        category: p.category,
        qty: 1,
        price: Number(v.price),
        listPrice: Number(v.price),
        // weight_g is grams; the pricing engine works in kilos.
        weightKg: (Number(v.weight_g) || 0) / 1000,
      }];
    });
  };

  const setLine = (key: string, patch: Partial<CartLine>) =>
    setCart((c) => c.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => setCart((c) => c.filter((l) => l.key !== key));

  // Ask the server for the money. Debounced, because every keystroke in a price
  // box would otherwise be a request.
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (cart.length === 0) { setQuote(null); return; }
    setQuoting(true);
    timer.current = window.setTimeout(async () => {
      try {
        setQuote(await quoteOrder({
          items: cart.map((l) => ({
            product_id: l.productId, name: l.name, variant: l.variant, qty: l.qty,
          })),
          customer: { name, phone },
          coupon_code: coupon.trim() || null,
          distance_km: Number(km) || 0,
        }));
        setErr(null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not price this order");
      } finally {
        setQuoting(false);
      }
    }, 350);
    return () => window.clearTimeout(timer.current);
  }, [cart, coupon, km, phone, name]);

  // The server prices the catalogue; overridden line prices are applied here so
  // the shop sees the effect immediately. The server recomputes on submit and
  // its answer is the one that is stored.
  const totals = useMemo(() => {
    const sub = cart.reduce((s, l) => s + l.qty * l.price, 0);
    const listSub = cart.reduce((s, l) => s + l.qty * l.listPrice, 0);
    const q = quote || {};
    // The quote priced the catalogue; scale its discount if lines were repriced.
    const discount = Number(q.discount || 0);
    const fee = feeOverride !== "" ? Number(feeOverride) : Number(q.delivery_fee || 0);
    const packing = Number(q.packing_fee || 0);
    const platform = Number(q.platform_fee || 0);
    const tax = Number(q.tax_total || 0);
    const adj = Number(adjustment) || 0;
    const grand = Math.max(0, sub - discount + fee + packing + platform + tax + adj);
    return { sub, listSub, discount, fee, packing, platform, tax, adj, grand,
             serverFee: Number(q.delivery_fee || 0) };
  }, [cart, quote, feeOverride, adjustment]);

  const overrides = [
    ...cart.filter((l) => l.price !== l.listPrice).map(
      (l) => `${l.name} (${l.variant}) ${inr(l.listPrice)}→${inr(l.price)}`),
    ...(feeOverride !== "" && Number(feeOverride) !== totals.serverFee
      ? [`delivery ${inr(totals.serverFee)}→${inr(Number(feeOverride))}`] : []),
    ...(totals.adj !== 0 ? [`adjustment ${totals.adj > 0 ? "+" : "−"}${inr(Math.abs(totals.adj))}`] : []),
  ];

  const place = async () => {
    if (cart.length === 0) return;
    if (!window.confirm(
      `Place this order for ${inr(totals.grand)}?` +
      (overrides.length ? `\n\nOverrides recorded:\n• ${overrides.join("\n• ")}` : "")
    )) return;

    setPlacing(true); setErr(null);
    try {
      const r = await createAdminOrder({
        lines: cart.map((l) => ({
          variant_id: l.variantId, product_id: l.productId, name: l.name, variant: l.variant,
          qty: l.qty, price: l.price, list_price: l.listPrice,
          weight_kg: l.weightKg, category: l.category,
        })),
        name, phone, address, area,
        distance_km: Number(km) || 0,
        coupon_code: coupon.trim() || null,
        payment_method: pay,
        delivery_fee: feeOverride !== "" ? Number(feeOverride) : null,
        adjustment: Number(adjustment) || 0,
        note: note.trim() || null,
      });
      navigate(`/orders/${r.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not place the order");
    } finally {
      setPlacing(false);
    }
  };

  if (loading) return <div className="panel"><p className="muted">Loading the catalogue…</p></div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>New Order</h1>
          <div className="sub">
            For orders taken on the phone — same catalogue, same prices, same coupons as the website.
          </div>
        </div>
      </div>

      {err && <div className="panel"><span style={{ color: "var(--bad)" }}>{err}</span></div>}

      <div className="no-cols">
        <div>
          <section className="panel">
            <div className="strip"><h2>Add items</h2><span className="rule" />
              <span className="t">{list.length} product{list.length === 1 ? "" : "s"}</span></div>

            <input value={q} placeholder="Search chicken, prawns, boneless…"
              onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />

            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              <button className={"btn sm " + (cat === "" ? "accent" : "ghost")} onClick={() => setCat("")}>All</button>
              {cats.map((c) => (
                <button key={c} className={"btn sm " + (cat === c ? "accent" : "ghost")}
                  onClick={() => setCat(c)}>{c}</button>
              ))}
            </div>

            <div className="no-plist">
              {list.map((p) => {
                const packs = packsOf(p);
                return (
                  <div className="no-pitem" key={p.id}>
                    <span className="n"><b>{p.name}</b><span>{p.category}</span></span>
                    <select value={picked[p.id] || packs[0].id}
                      onChange={(e) => setPicked((s) => ({ ...s, [p.id]: e.target.value }))}>
                      {packs.map((v) => (
                        <option key={v.id} value={v.id}>{v.label} · {inr(v.price)}</option>
                      ))}
                    </select>
                    <button className="btn sm primary" onClick={() => add(p)}>Add</button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <div className="strip"><h2>Cart</h2><span className="rule" />
              <span className="t">tap a price to change it</span></div>

            {cart.length === 0 ? (
              <p className="muted">Nothing added yet.</p>
            ) : (
              <div className="pe-tbl">
                <table>
                  <thead>
                    <tr><th>Item</th><th>Qty</th><th>Price each</th><th style={{ textAlign: "right" }}>Line</th><th /></tr>
                  </thead>
                  <tbody>
                    {cart.map((l) => (
                      <tr key={l.key}>
                        <td><b>{l.name}</b><div className="muted" style={{ fontSize: 11 }}>{l.variant}</div></td>
                        <td>
                          <div className="row" style={{ gap: 4, alignItems: "center" }}>
                            <button className="btn sm ghost" onClick={() =>
                              l.qty <= 1 ? remove(l.key) : setLine(l.key, { qty: l.qty - 1 })}>−</button>
                            <b style={{ minWidth: 20, textAlign: "center" }}>{l.qty}</b>
                            <button className="btn sm ghost" onClick={() => setLine(l.key, { qty: l.qty + 1 })}>+</button>
                          </div>
                        </td>
                        <td>
                          <input type="number" style={{ width: 84, textAlign: "right" }} value={l.price}
                            onChange={(e) => setLine(l.key, { price: Number(e.target.value) || 0 })} />
                          {l.price !== l.listPrice && (
                            <div className="muted" style={{ fontSize: 10.5, textDecoration: "line-through" }}>
                              was {inr(l.listPrice)}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {inr(l.qty * l.price)}
                        </td>
                        <td>
                          <button className="btn sm danger" onClick={() => remove(l.key)}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="strip"><h2>Customer</h2><span className="rule" /></div>
            <div className="pe-grid two">
              <div><label>Name</label>
                <input value={name} placeholder="Walk-in" onChange={(e) => setName(e.target.value)} /></div>
              <div><label>Phone</label>
                <input value={phone} placeholder="98765 43210" onChange={(e) => setPhone(e.target.value)} />
                <div className="pe-hint">Needed for the WhatsApp confirmation and for order history.</div></div>
              <div style={{ gridColumn: "1/-1" }}><label>Delivery address</label>
                <input value={address} placeholder="Flat / house, street, landmark"
                  onChange={(e) => setAddress(e.target.value)} /></div>
              <div><label>Area</label>
                <input value={area} onChange={(e) => setArea(e.target.value)} /></div>
              <div><label>Distance from shop (km)</label>
                <input type="number" step="0.1" value={km} onChange={(e) => setKm(e.target.value)} />
                <div className="pe-hint">Sets the delivery band. A phone order has no GPS pin, so this is typed.</div></div>
            </div>
          </section>
        </div>

        <aside className="no-rail">
          <section className="panel">
            <div className="strip"><h2>Bill</h2><span className="rule" />
              {quoting && <span className="t">pricing…</span>}</div>

            <div className="row" style={{ gap: 8, marginBottom: 12 }}>
              <input value={coupon} placeholder="Coupon code" style={{ textTransform: "uppercase" }}
                onChange={(e) => setCoupon(e.target.value)} />
            </div>
            {quote?.coupon_error && (
              <div className="pe-hint" style={{ color: "var(--bad)", marginTop: -6 }}>{quote.coupon_error}</div>
            )}
            {quote?.coupon && !quote?.coupon_error && (
              <div className="pe-hint" style={{ color: "var(--ok)", marginTop: -6 }}>✓ {quote.coupon} applied</div>
            )}

            <div className="no-brow"><span>Subtotal</span><b>{inr(totals.sub)}</b></div>
            {totals.discount > 0 && (
              <div className="no-brow ok"><span>{quote?.coupon || "Discount"}</span>
                <b>−{inr(totals.discount)}</b></div>
            )}
            <div className="no-brow">
              <span>Delivery</span>
              <input type="number" style={{ width: 84, textAlign: "right" }}
                value={feeOverride !== "" ? feeOverride : String(totals.serverFee)}
                onChange={(e) => setFeeOverride(e.target.value)} />
            </div>
            {totals.packing > 0 && <div className="no-brow"><span>Packing</span><b>{inr(totals.packing)}</b></div>}
            {totals.platform > 0 && <div className="no-brow"><span>Platform fee</span><b>{inr(totals.platform)}</b></div>}
            {totals.tax > 0 && <div className="no-brow"><span>Tax</span><b>{inr(totals.tax)}</b></div>}
            {totals.adj !== 0 && (
              <div className="no-brow"><span>Adjustment <span className="po-pill">OVERRIDE</span></span>
                <b>{totals.adj > 0 ? "+" : "−"}{inr(Math.abs(totals.adj))}</b></div>
            )}
            <div className="no-brow grand"><span>Total</span><span>{inr(totals.grand)}</span></div>

            <div style={{ marginTop: 14 }}>
              <label>Adjust the total</label>
              <input type="number" value={adjustment} placeholder="0"
                onChange={(e) => setAdjustment(e.target.value)} />
              <div className="pe-hint">
                A goodwill discount, a round-off, a delivery you're absorbing. Negative takes money off.
              </div>
            </div>

            {overrides.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <label>Why</label>
                <input value={note} placeholder="Regular customer, rounded down"
                  onChange={(e) => setNote(e.target.value)} />
                <div className="pe-hint">
                  {overrides.length} override{overrides.length === 1 ? "" : "s"} on this order —
                  recorded with your name.
                </div>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <label>Payment</label>
              <div className="pe-seg">
                <button type="button" aria-pressed={pay === "upi"} onClick={() => setPay("upi")}>UPI</button>
                <button type="button" aria-pressed={pay === "cash"} onClick={() => setPay("cash")}>Cash</button>
              </div>
            </div>

            <button className="btn primary" style={{ width: "100%", marginTop: 16 }}
              disabled={cart.length === 0 || placing} onClick={place}>
              {placing ? "Placing…" : `Place order · ${inr(totals.grand)}`}
            </button>
            <div className="pe-hint">
              The customer gets the same WhatsApp confirmation as a website order.
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
