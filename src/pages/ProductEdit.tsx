import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { adminApi } from "../lib/apiClient";
import { STATUS, statusOf, applyStatus, type ProductStatus } from "../lib/productStatus";

// Everything about one product, on one screen.
//
// The Products table can only reach a price and a couple of switches, which is
// why "≈ 300g cleaned & deveined" could never be corrected: weight_basis,
// cleaning and the rest are columns nothing could write. This is the screen
// that writes them.
//
// The preview on the right is the point of the layout. "70" and "Dressed" mean
// nothing on their own; "≈ 600–700g dressed" is what the customer reads, so it
// is shown while you type rather than discovered after saving.
type Row = Record<string, any>;

const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN");

// How a product is sold decides what a pack even means: grams cut to order,
// grams before cutting, or a count of pieces.
const SOLD_BY = [
  { id: "weight", label: "Weight", hint: "Cut to the weight ordered — what you see is what you get." },
  { id: "gross",  label: "Live / gross", hint: "The customer is charged before cutting." },
  { id: "piece",  label: "Pieces", hint: "The pack is a count. The grams say roughly what that count weighs." },
];

/// "≈ 600–700g dressed", or "" when nothing is lost.
///
/// Deliberately identical to the backend's NetWeightNote and the website's
/// netWeightNote — three copies of one sentence is how they drift apart, so if
/// this changes, all three change together.
export function netNote(soldBy: string, cleaning: string, min: any, max: any): string {
  const lo = Number(min);
  if (soldBy === "weight" || !isFinite(lo) || lo <= 0) return "";
  const hi = Number(max);
  const weight = isFinite(hi) && hi > lo ? `${lo}–${hi}g` : `${lo}g`;
  return `≈ ${weight} ${(cleaning || "cleaned").trim().toLowerCase()}`;
}

export default function ProductEdit() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const [p, setP] = useState<Row | null>(null);
  const [variants, setVariants] = useState<Row[]>([]);
  const [subs, setSubs] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<ProductStatus>("available");

  useEffect(() => {
    let alive = true;
    Promise.all([adminApi.getProduct(id), adminApi.getSubcategories().catch(() => [])])
      .then(([row, s]) => {
        if (!alive) return;
        const vs: Row[] = (row.product_variants || [])
          .slice()
          .sort((a: Row, b: Row) => (a.sort_order || 0) - (b.sort_order || 0));
        setP(row);
        setVariants(vs);
        setStatus(statusOf(row));
        setSubs(s as Row[]);
      })
      .catch((e) => alive && setErr(e?.message || "Could not load this product"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  if (loading) return <div className="panel"><p className="muted">Loading…</p></div>;
  if (!p) return <div className="panel"><p style={{ color: "var(--bad)" }}>{err || "Not found"}</p></div>;

  const set = (patch: Row) => { setP((c) => ({ ...c!, ...patch })); setSaved(false); };
  const setVar = (i: number, patch: Row) => {
    setVariants((v) => v.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    setSaved(false);
  };

  const soldBy: string = p.sold_by || (p.weight_basis === "gross" ? "gross" : "weight");
  const isPiece = soldBy === "piece";

  // A number the shop cleared should save as null, not as 0 — zero pieces and
  // "not applicable" are different claims.
  const num = (v: any) => (v === "" || v === null || v === undefined ? null : Number(v));

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await applyStatus({ ...p, product_variants: variants }, status);

      await adminApi.updateProduct(id, {
        name: (p.name || "").trim(),
        category: p.category,
        subcategory_id: p.subcategory_id || null,
        unit: p.unit || null,
        short_description: p.short_description || null,
        description: p.description || null,
        image_url: p.image_url || null,
        badges: p.badges || [],
        preorder_note: p.preorder_note || null,
        sold_by: soldBy,
        // weight_basis is what older readers still look at, so keep the two in
        // step rather than leaving a stale value behind.
        weight_basis: soldBy === "gross" ? "gross" : "net",
        cleaning: p.cleaning || null,
        bestseller: !!p.bestseller,
        recommended: !!p.recommended,
        today_special: !!p.today_special,
        seo_title: p.seo_title || null,
        seo_description: p.seo_description || null,
        sort_order: num(p.sort_order) ?? 99,
      });

      for (const v of variants) {
        await adminApi.updateVariant(v.id, {
          label: (v.label || "").trim(),
          weight_g: num(v.weight_g) ?? 0,
          pieces: isPiece ? num(v.pieces) : null,
          net_min_g: num(v.net_min_g),
          net_max_g: num(v.net_max_g),
          price: Number(v.price),
          mrp: num(v.mrp) && Number(v.mrp) > Number(v.price) ? Number(v.mrp) : null,
          // "Sold out" at product level means all of them, so it overrides the
          // per-pack switches rather than letting the two disagree.
          available: status === "soldout" ? false : v.available !== false,
        });
      }
      setSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const categories = Array.from(
    new Map(subs.filter((s) => s.categories).map((s) => [s.categories.name, s.categories])).values()
  );
  const subsForCategory = subs.filter((s) => s.categories?.name === p.category);
  const preview = variants.find((v) => v.available !== false) || variants[0] || {};

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            <a href="#/products" style={{ color: "var(--terracotta)" }}>Products</a> › {p.category}
          </div>
          <h1>{p.name}</h1>
          <div className="sub">Everything the customer sees — website, WhatsApp and the app.</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={() => navigate("/products")}>Cancel</button>
          <button className="btn primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save changes"}
          </button>
        </div>
      </div>

      {err && <div className="panel"><span style={{ color: "var(--bad)" }}>{err}</span></div>}

      <div className="pe-cols">
        <div className="pe-main">

          <section className="panel">
            <div className="strip"><h2>Identity</h2><span className="rule" /></div>
            <div className="pe-grid two">
              <div><label>Product name</label>
                <input value={p.name || ""} onChange={(e) => set({ name: e.target.value })} /></div>
              <div><label>Unit shown to customers</label>
                <input value={p.unit || ""} onChange={(e) => set({ unit: e.target.value })} />
                <div className="pe-hint">The wording beside the price, e.g. “per 500g”.</div></div>
              <div><label>Category</label>
                <select value={p.category || ""} onChange={(e) => set({ category: e.target.value, subcategory_id: "" })}>
                  {categories.map((c: any) => <option key={c.name}>{c.name}</option>)}
                </select></div>
              <div><label>Sub-category</label>
                <select value={p.subcategory_id || ""} onChange={(e) => set({ subcategory_id: e.target.value })}>
                  <option value="">— none —</option>
                  {subsForCategory.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <div className="pe-hint">Drives the shop’s filter chips.</div></div>
              <div style={{ gridColumn: "1/-1" }}>
                <label>Web address</label>
                <input value={"/product/" + (p.slug || "")} readOnly className="pe-locked" />
                <div className="pe-hint">
                  Fixed on purpose — changing it breaks every link and search result already pointing here.
                  Renaming the product is safe.
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            {/* One question, four answers. Three separate switches could
                contradict each other — a product could be Hidden AND pre-order,
                which is two answers at once. */}
            <div className="strip"><h2>Status</h2><span className="rule" /></div>
            <div className="st-list" role="radiogroup" aria-label="Product status">
              {STATUS.map((s) => (
                <button key={s.id} type="button" role="radio" className="st-opt"
                  aria-checked={status === s.id}
                  onClick={() => { setStatus(s.id); setSaved(false); }}>
                  <span className="dot" />
                  <span className="t"><b>{s.label}</b><span>{s.hint}</span></span>
                </button>
              ))}
            </div>
            {status === "soldout" && (
              <div className="pe-hint">
                Saving this switches <b>every</b> pack to sold out. To mark just one
                size — the 250g but not the 500g — leave this on <b>Available now</b>
                and use the Sold out button on that pack below.
              </div>
            )}
            {p.preorder && (
              <div style={{ marginTop: 14 }}>
                <label>What the customer is told</label>
                <input value={p.preorder_note || ""}
                  placeholder="We source these to order rather than keeping them on ice."
                  onChange={(e) => set({ preorder_note: e.target.value })} />
                <div className="pe-hint">
                  Shown under the Pre-order heading on the website, and in the bot's reply.
                  Leave it empty for the default.
                </div>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="strip"><h2>Weight &amp; cutting</h2><span className="rule" /></div>
            <div className="pe-grid two">
              <div>
                <label>Sold by</label>
                <div className="pe-seg">
                  {SOLD_BY.map((m) => (
                    <button key={m.id} type="button" aria-pressed={soldBy === m.id}
                      onClick={() => set({ sold_by: m.id })}>{m.label}</button>
                  ))}
                </div>
                <div className="pe-hint">{SOLD_BY.find((m) => m.id === soldBy)?.hint}</div>
              </div>
              <div>
                <label>What we do to it</label>
                <input value={p.cleaning || ""} placeholder="Dressed"
                  onChange={(e) => set({ cleaning: e.target.value })}
                  disabled={soldBy === "weight"} />
                <div className="pe-hint">e.g. Dressed · Cleaned &amp; deveined · Descaled &amp; cut</div>
              </div>
            </div>
            {soldBy !== "weight" && (
              <div className="pe-legend">
                → How much a customer actually gets is set <b>per pack</b>, in grams, in
                {" "}<b>Packs &amp; prices</b> below — a 1kg bird and a 1.5kg bird don’t lose the same amount.
              </div>
            )}
          </section>

          <section className="panel">
            <div className="strip"><h2>Description</h2><span className="rule" /></div>
            <div className="pe-grid">
              <div>
                <label>Short description <span className="pe-opt">— one line, on cards and in WhatsApp</span></label>
                <input value={p.short_description || ""} maxLength={72}
                  onChange={(e) => set({ short_description: e.target.value })} />
                <div className="pe-hint">
                  {(p.short_description || "").length}/72 — WhatsApp cuts the row off after that.
                </div>
              </div>
              <div>
                <label>Full description <span className="pe-opt">— the product page only</span></label>
                <textarea rows={4} value={p.description || ""}
                  onChange={(e) => set({ description: e.target.value })} />
              </div>
              <div>
                <label>Badges <span className="pe-opt">— comma separated</span></label>
                <input value={(p.badges || []).join(", ")}
                  onChange={(e) => set({
                    badges: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })} />
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="strip"><h2>Photo</h2><span className="rule" /></div>
            <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <label>Image address</label>
                <input value={p.image_url || ""} placeholder="/img/chicken-live.jpg"
                  onChange={(e) => set({ image_url: e.target.value })} />
                <div className="pe-hint">A link, or a file already in the site’s /img folder. Landscape, 800px or wider.</div>
              </div>
              <div className="pe-thumb">
                {p.image_url
                  ? <img src={p.image_url} alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                  : <span>no photo</span>}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="strip"><h2>Packs &amp; prices</h2><span className="rule" /></div>
            <div className="pe-tbl">
              <table>
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>{isPiece ? "Pieces" : "Weight (g)"}</th>
                    <th>Selling price</th>
                    <th>Was</th>
                    <th className="pe-grp">Customer gets<span>from (g)</span></th>
                    <th className="pe-grp"><span>to (g)</span></th>
                    <th>Sold</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v, i) => {
                    const off = Number(v.mrp) > Number(v.price)
                      ? Math.round(((v.mrp - v.price) / v.mrp) * 100) : 0;
                    return (
                      <tr key={v.id}>
                        <td><input style={{ width: 100 }} value={v.label || ""}
                          onChange={(e) => setVar(i, { label: e.target.value })} /></td>
                        <td><input type="number" style={{ width: 84 }}
                          value={isPiece ? (v.pieces ?? "") : (v.weight_g ?? "")}
                          onChange={(e) => setVar(i, isPiece ? { pieces: e.target.value } : { weight_g: e.target.value })} /></td>
                        <td><input type="number" style={{ width: 84 }} value={v.price ?? ""}
                          onChange={(e) => setVar(i, { price: e.target.value })} /></td>
                        <td>
                          <input type="number" style={{ width: 84 }} placeholder="—" value={v.mrp ?? ""}
                            onChange={(e) => setVar(i, { mrp: e.target.value })} />
                          {off > 0 && <div className="pe-off">{off}% off</div>}
                        </td>
                        <td className="pe-newcell"><input type="number" style={{ width: 80 }} placeholder="—"
                          value={v.net_min_g ?? ""} disabled={soldBy === "weight"}
                          onChange={(e) => setVar(i, { net_min_g: e.target.value })} /></td>
                        <td className="pe-newcell"><input type="number" style={{ width: 80 }} placeholder="—"
                          value={v.net_max_g ?? ""} disabled={soldBy === "weight"}
                          onChange={(e) => setVar(i, { net_max_g: e.target.value })} /></td>
                        <td>
                          <button className={"btn sm " + (v.available !== false ? "accent" : "ghost")}
                            onClick={() => setVar(i, { available: v.available === false })}>
                            {v.available !== false ? "On" : "Sold out"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {soldBy !== "weight" && (
              <div className="pe-legend">
                → <b>Customer gets</b> is the real weight after cutting. Leave both empty when nothing is lost.
                Fill only <b>from</b> for a single reliable figure, and the customer sees <b>≈ 600g</b> rather than a range.
              </div>
            )}
          </section>

          <section className="panel">
            <div className="strip"><h2>Where it appears</h2><span className="rule" /></div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {([
                ["bestseller", "Bestseller"],
                ["recommended", "Recommended"],
                ["today_special", "Today’s special"],
              ] as const).map(([k, lbl]) => (
                <button key={k} className={"btn sm " + (p[k] ? "accent" : "ghost")}
                  onClick={() => set({ [k]: !p[k] })}>
                  {lbl}
                </button>
              ))}
            </div>
            <div className="pe-hint" style={{ marginTop: 10 }}>
              Where the product is promoted. Whether it is <i>sold</i> at all is the Status
              above — these are just badges.
            </div>
            <div style={{ marginTop: 14, maxWidth: 160 }}>
              <label>Position in list</label>
              <input type="number" value={p.sort_order ?? 99}
                onChange={(e) => set({ sort_order: e.target.value })} />
            </div>
          </section>

          <section className="panel">
            <div className="strip"><h2>Search listing</h2><span className="rule" /></div>
            <div className="pe-grid">
              <div><label>Google title</label>
                <input value={p.seo_title || ""} onChange={(e) => set({ seo_title: e.target.value })} /></div>
              <div><label>Google description</label>
                <textarea rows={2} value={p.seo_description || ""}
                  onChange={(e) => set({ seo_description: e.target.value })} /></div>
            </div>
          </section>

          <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginBottom: 24 }}>
            <button className="btn" onClick={() => navigate("/products")}>Cancel</button>
            <button className="btn primary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : saved ? "✓ Saved" : "Save changes"}
            </button>
          </div>
        </div>

        {/* The preview is why the fields above are legible. */}
        <aside className="pe-rail">
          <div className="pe-railh">What the customer sees</div>

          <div className="pe-pv">
            <div className="pe-pvcap">Website &amp; app</div>
            <div className="pe-pvbody">
              <div className="pe-wname">{p.name}</div>
              <div className="pe-wdesc">{p.short_description}</div>
              <div className="pe-wprice">
                <span className="now">{inr(preview.price)}</span>
                {Number(preview.mrp) > Number(preview.price) && (
                  <>
                    <span className="was">{inr(preview.mrp)}</span>
                    <span className="pill">
                      {Math.round(((preview.mrp - preview.price) / preview.mrp) * 100)}% OFF
                    </span>
                  </>
                )}
              </div>
              {netNote(soldBy, p.cleaning, preview.net_min_g, preview.net_max_g) && (
                <div className="pe-wnet">{netNote(soldBy, p.cleaning, preview.net_min_g, preview.net_max_g)}</div>
              )}
            </div>
          </div>

          <div className="pe-pv">
            <div className="pe-pvcap">WhatsApp menu</div>
            <div className="pe-pvbody">
              <div className="pe-wa">
                <div className="t">{p.name} · {preview.label}</div>
                <div className="d">
                  {[p.short_description,
                    inr(preview.price) + (Number(preview.mrp) > Number(preview.price) ? ` (was ${inr(preview.mrp)})` : "") + " / " + (preview.label || ""),
                    netNote(soldBy, p.cleaning, preview.net_min_g, preview.net_max_g),
                  ].filter(Boolean).join(" · ").slice(0, 72)}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
