import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi } from "../lib/apiClient";
import { useResource } from "../lib/useResource";

// Products and their pack sizes, straight from the database — the same rows the
// website and the WhatsApp bot read. Editing a price here changes what customers
// pay on the next request.
//
// Grouped by category because that's how the shop thinks: "what are we charging
// for mutton today" is a real question, "product #7" is not.
type Row = Record<string, any>;
type Variant = Record<string, any>;
type Product = Record<string, any>;

const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN");

export default function Products() {
  const { data: products, loading, error, saving, mutate, refresh } =
    useResource<Product[]>(adminApi.getProducts, []);

  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);

  // Price edits are staged per variant so a half-typed number is never saved.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const stage = (id: string, v: string) => setEdits((e) => ({ ...e, [id]: v }));

  const savePrice = async (v: Variant) => {
    const raw = edits[v.id];
    const price = Number(raw);
    if (raw === undefined || !isFinite(price) || price <= 0) return;
    if (await mutate(() => adminApi.updateVariant(v.id, { price })))
      setEdits((e) => { const { [v.id]: _drop, ...rest } = e; return rest; });
  };

  // The struck-through "was" price. Staged separately from the selling price so
  // typing one never risks saving a half-finished other.
  const [mrpEdits, setMrpEdits] = useState<Record<string, string>>({});
  const stageMrp = (id: string, v: string) => setMrpEdits((e) => ({ ...e, [id]: v }));

  const saveMrp = async (v: Variant) => {
    const raw = mrpEdits[v.id];
    if (raw === undefined) return;
    // An empty box means "no discount" — send null, don't refuse to save.
    const mrp = raw.trim() === "" ? null : Number(raw);
    if (mrp !== null && (!isFinite(mrp) || mrp <= Number(v.price))) {
      window.alert(
        `"Was" must be higher than the selling price of ${inr(v.price)}.\n\n` +
        `Leave it empty if this pack isn't discounted.`
      );
      return;
    }
    if (await mutate(() => adminApi.updateVariant(v.id, { mrp })))
      setMrpEdits((e) => { const { [v.id]: _drop, ...rest } = e; return rest; });
  };

  const toggleVariant = (v: Variant) =>
    mutate(() => adminApi.updateVariant(v.id, { available: !v.available }));

  const toggleProduct = (p: Product) =>
    mutate(() => adminApi.updateProduct(p.id, { available: !p.available }));

  // Deleting is for a pack that shouldn't exist; "Sold out" is for one that's
  // temporarily unavailable. Past orders keep their own copy of the price.
  const deletePack = (p: Product, v: Variant) => {
    if (window.confirm(
      `Delete the "${v.label || v.weight_g + "g"}" pack of ${p.name}?\n\n` +
      `Customers won't see it again. Past orders are unaffected.\n\n` +
      `To hide it temporarily instead, use "Sold out".`
    )) mutate(() => adminApi.deleteVariant(v.id));
  };

  // A product created with one pack could not be removed at all: the per-pack
  // Delete refuses the last pack (it would leave a product with nothing to buy)
  // and there was no product-level equivalent. This is that equivalent.
  const removeProduct = (p: Product) => {
    if (!window.confirm(
      `Remove ${p.name} from the shop?\n\n` +
      `It disappears from the website and WhatsApp straight away. Past orders ` +
      `keep their own copy, so nothing in your history changes.\n\n` +
      `You can put it back later with the "Hidden" button.`
    )) return;
    mutate(() => adminApi.updateProduct(p.id, { available: false }));
  };

  // Names were fixed at creation, so a typo meant deleting and starting again.
  const renameProduct = async (p: Product) => {
    const next = window.prompt("Product name", p.name);
    if (next === null) return;
    const name = next.trim();
    if (name === "" || name === p.name) return;
    await mutate(() => adminApi.updateProduct(p.id, { name }));
  };

  // Adding a pack to a product that already exists.
  const [addPackFor, setAddPackFor] = useState<string | null>(null);
  const [pack, setPack] = useState<Row>({ label: "", weight_g: 1000, price: "", mrp: "" });

  const addPack = async (productId: string) => {
    if (!(Number(pack.price) > 0 && Number(pack.weight_g) > 0)) return;
    const ok = await mutate(() => adminApi.addVariant(productId, {
      label: pack.label || `${pack.weight_g}g`,
      weight_g: Number(pack.weight_g),
      price: Number(pack.price),
      mrp: Number(pack.mrp) > Number(pack.price) ? Number(pack.mrp) : null,
    }));
    if (ok) { setAddPackFor(null); setPack({ label: "", weight_g: 1000, price: "", mrp: "" }); }
  };

  // Group by category, keeping the order the API returned (sort_order).
  const grouped = new Map<string, Product[]>();
  for (const p of products) {
    const cat = p.category || "Uncategorised";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(p);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Products</h1>
          <div className="sub">Prices &amp; availability — live on the website and WhatsApp</div>
        </div>
        <button className="btn primary" onClick={() => setAdding((a) => !a)}>
          {adding ? "✕ Close" : "＋ Add product"}
        </button>
      </div>

      {error && <div className="panel"><span style={{ color: "#c0392b" }}>{error}</span></div>}

      {adding && <AddProduct onAdded={() => { setAdding(false); refresh(); }} onCancel={() => setAdding(false)} />}

      {loading ? (
        <div className="panel"><p className="muted">Loading products…</p></div>
      ) : products.length === 0 ? (
        <div className="panel"><p className="muted">No products yet — add your first one above.</p></div>
      ) : (
        [...grouped.entries()].map(([category, items]) => (
          <div className="panel" key={category}>
            <div className="strip">
              <h2>{category}</h2>
              <span className="rule" />
              <span className="t">{items.length} product{items.length === 1 ? "" : "s"}</span>
            </div>

            <table>
              <thead>
                <tr><th>Product</th><th>Pack</th><th>Selling price</th><th>Was (optional)</th><th>Pack</th><th>Product</th></tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const variants: Variant[] = (p.product_variants || [])
                    .slice()
                    .sort((a: Variant, b: Variant) => (a.sort_order || 0) - (b.sort_order || 0));

                  const productCell = (
                    <td rowSpan={Math.max(1, variants.length)}>
                      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                        <button className={"btn sm " + (p.available ? "accent" : "ghost")}
                          disabled={saving} onClick={() => toggleProduct(p)}>
                          {p.available ? "On sale" : "Hidden"}
                        </button>
                        <button className="btn sm ghost" disabled={saving}
                          onClick={() => setAddPackFor(addPackFor === p.id ? null : p.id)}>
                          ＋ Pack
                        </button>
                        {/* Rename is the quick path; Edit is everything else —
                            description, photo, what the customer really gets. */}
                        <button className="btn sm ghost" disabled={saving}
                          onClick={() => navigate(`/products/${p.id}`)}
                          title="Description, photo, cut weights, badges">
                          ✎ Edit
                        </button>
                        <button className="btn sm ghost" disabled={saving}
                          onClick={() => renameProduct(p)} title="Change the name customers see">
                          ✏️ Rename
                        </button>
                        {p.available && (
                          <button className="btn sm ghost" disabled={saving}
                            onClick={() => removeProduct(p)} title="Take it off the shop">
                              🗑 Remove
                          </button>
                        )}
                      </div>
                    </td>
                  );

                  const rows = variants.length === 0 ? [(
                    <tr key={p.id}>
                      <td><b>{p.name}</b></td>
                      <td colSpan={4} className="muted"><i>no packs — add one before it can be sold</i></td>
                      {productCell}
                    </tr>
                  )] : variants.map((v, i) => {
                    const staged = edits[v.id];
                    const changed = staged !== undefined && Number(staged) !== Number(v.price);
                    return (
                      <tr key={v.id}>
                        {i === 0 && (
                          <td rowSpan={variants.length}>
                            <b>{p.name}</b>
                            <div className="muted" style={{ fontSize: 11 }}>from {inr(p.price)}</div>
                          </td>
                        )}
                        <td className="muted nowrap">{v.label || `${v.weight_g}g`}</td>
                        <td>
                          <div className="row" style={{ gap: 6 }}>
                            <input type="number" style={{ width: 96 }} value={staged ?? v.price}
                              onChange={(e) => stage(v.id, e.target.value)} />
                            {changed && (
                              <button className="btn sm primary" disabled={saving} onClick={() => savePrice(v)}>
                                Save
                              </button>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="row" style={{ gap: 6, alignItems: "center" }}>
                            <input type="number" style={{ width: 96 }} placeholder="—"
                              title="Shown struck through beside the price. Leave empty for no discount."
                              value={mrpEdits[v.id] ?? (v.mrp ?? "")}
                              onChange={(e) => stageMrp(v.id, e.target.value)} />
                            {mrpEdits[v.id] !== undefined &&
                             mrpEdits[v.id] !== String(v.mrp ?? "") && (
                              <button className="btn sm primary" disabled={saving} onClick={() => saveMrp(v)}>
                                Save
                              </button>
                            )}
                            {/* Show the shop the same number the customer will see. */}
                            {Number(v.mrp) > Number(v.price) && (
                              <span className="muted nowrap" style={{ fontSize: 11 }}>
                                {Math.round(((v.mrp - v.price) / v.mrp) * 100)}% off
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="row" style={{ gap: 6 }}>
                            <button className={"btn sm " + (v.available ? "accent" : "ghost")}
                              disabled={saving} onClick={() => toggleVariant(v)}>
                              {v.available ? "Available" : "Sold out"}
                            </button>
                            {/* Only when another pack remains — a product with no
                                packs looks fine here and fails at checkout. */}
                            {variants.length > 1 && (
                              <button className="btn sm danger" disabled={saving}
                                title="Delete this pack" onClick={() => deletePack(p, v)}>
                                🗑 Delete
                              </button>
                            )}
                          </div>
                        </td>
                        {i === 0 && productCell}
                      </tr>
                    );
                  });

                  if (addPackFor === p.id) {
                    rows.push(
                      <tr key={p.id + "-addpack"} className="addpack-row">
                        <td colSpan={6}>
                          <div className="row" style={{ gap: 10, flexWrap: "wrap", padding: "4px 0" }}>
                            <span className="muted" style={{ fontSize: 12.5 }}>
                              New pack for <b>{p.name}</b>
                            </span>
                            <input style={{ width: 100 }} placeholder="1kg" value={pack.label}
                              onChange={(e) => setPack((c: Row) => ({ ...c, label: e.target.value }))} />
                            <input type="number" style={{ width: 110 }} placeholder="grams" value={pack.weight_g}
                              onChange={(e) => setPack((c: Row) => ({ ...c, weight_g: e.target.value }))} />
                            <input type="number" style={{ width: 110 }} placeholder="₹ price" value={pack.price}
                              onChange={(e) => setPack((c: Row) => ({ ...c, price: e.target.value }))} />
                            <input type="number" style={{ width: 130 }} placeholder="₹ was (optional)"
                              title="Struck through beside the price. Leave empty for no discount."
                              value={pack.mrp}
                              onChange={(e) => setPack((c: Row) => ({ ...c, mrp: e.target.value }))} />
                            <button className="btn sm primary" disabled={saving} onClick={() => addPack(p.id)}>
                              {saving ? "Saving…" : "Add pack"}
                            </button>
                            <button className="btn sm ghost" onClick={() => setAddPackFor(null)}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return rows;
                })}
              </tbody>
            </table>
          </div>
        ))
      )}

      <p className="muted" style={{ fontSize: 12 }}>
        <b>Sold out</b> hides one pack temporarily · <b>🗑 Delete</b> removes a pack for good ·
        <b> Hidden</b> takes the whole product off the shop. None of them change past orders.
      </p>
    </>
  );
}

/* ── Add a product ─────────────────────────────────────────────────────────
   A product and its pack sizes are created together: the storefront and the
   bot both price from variants, so a product without them looks fine here and
   breaks at checkout. */
function AddProduct({ onAdded, onCancel }: { onAdded: () => void; onCancel: () => void }) {
  const [subs, setSubs] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [f, setF] = useState<Row>({
    name: "", category: "", subcategory_id: "", unit: "500g", short_description: "", image_url: "",
  });
  const [variants, setVariants] = useState<Row[]>([{ label: "500g", weight_g: 500, price: "", mrp: "" }]);

  useEffect(() => { adminApi.getSubcategories().then(setSubs).catch(() => setSubs([])); }, []);

  // Category comes from the subcategory list, so the text column and the foreign
  // key can never disagree — the website filters on the text one.
  const categories = Array.from(
    new Map(subs.filter((s) => s.categories).map((s) => [s.categories.name, s.categories] as [string, any])).values()
  );
  const subsForCategory = subs.filter((s) => s.categories?.name === f.category);

  const set = (p: Row) => setF((c) => ({ ...c, ...p }));
  const setVar = (i: number, p: Row) => setVariants((v) => v.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const canSave =
    f.name.trim() !== "" && f.category !== "" &&
    variants.length > 0 && variants.every((v) => Number(v.price) > 0 && Number(v.weight_g) > 0);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await adminApi.createProduct({
        name: f.name.trim(),
        category: f.category,
        subcategory_id: f.subcategory_id || null,
        unit: f.unit || "500g",
        short_description: f.short_description || null,
        image_url: f.image_url || null,
        variants: variants.map((v) => ({
          label: v.label || `${v.weight_g}g`,
          weight_g: Number(v.weight_g),
          price: Number(v.price),
          mrp: Number(v.mrp) > Number(v.price) ? Number(v.mrp) : null,
        })),
      });
      onAdded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add the product");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h2>New product</h2>
      {err && <p style={{ color: "#c0392b", fontSize: 13 }}>{err}</p>}

      <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
        <div><label>Name</label>
          <input style={{ width: 190 }} value={f.name} placeholder="Boneless"
            onChange={(e) => set({ name: e.target.value })} /></div>

        <div><label>Category</label>
          <select value={f.category} onChange={(e) => set({ category: e.target.value, subcategory_id: "" })}>
            <option value="">— select —</option>
            {categories.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select></div>

        <div><label>Subcategory</label>
          <select value={f.subcategory_id} disabled={!f.category}
            onChange={(e) => set({ subcategory_id: e.target.value })}>
            <option value="">— none —</option>
            {subsForCategory.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></div>

        <div><label>Unit label</label>
          <input style={{ width: 90 }} value={f.unit} onChange={(e) => set({ unit: e.target.value })} /></div>
      </div>

      <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-end", gap: 12, marginTop: 12 }}>
        <div style={{ flex: "1 1 280px" }}><label>Short description</label>
          <input style={{ width: "100%" }} value={f.short_description} placeholder="Tender goat, bone-in pieces."
            onChange={(e) => set({ short_description: e.target.value })} /></div>
        <div style={{ flex: "1 1 280px" }}><label>Image URL</label>
          <input style={{ width: "100%" }} value={f.image_url} placeholder="https://…/photo.jpg"
            onChange={(e) => set({ image_url: e.target.value })} /></div>
      </div>

      <h3 style={{ margin: "20px 0 4px", fontSize: 15 }}>Pack sizes</h3>
      <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        What the customer actually buys. The cheapest pack becomes the "from" price on the website.
      </p>

      {variants.map((v, i) => (
        <div className="row" key={i} style={{ gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <div><label>Label</label>
            <input style={{ width: 100 }} value={v.label} placeholder="500g"
              onChange={(e) => setVar(i, { label: e.target.value })} /></div>
          <div><label>Weight (g)</label>
            <input type="number" style={{ width: 110 }} value={v.weight_g}
              onChange={(e) => setVar(i, { weight_g: e.target.value })} /></div>
          <div><label>Price ₹</label>
            <input type="number" style={{ width: 110 }} value={v.price}
              onChange={(e) => setVar(i, { price: e.target.value })} /></div>
          <div><label>Was ₹ <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
            <input type="number" style={{ width: 110 }} value={v.mrp} placeholder="—"
              title="Shown struck through beside the price. Leave empty for no discount."
              onChange={(e) => setVar(i, { mrp: e.target.value })} /></div>
          {variants.length > 1 && (
            <button className="btn sm danger" style={{ alignSelf: "flex-end" }}
              onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))}>🗑</button>
          )}
        </div>
      ))}

      <button className="btn sm ghost"
        onClick={() => setVariants((v) => [...v, { label: "", weight_g: 1000, price: "", mrp: "" }])}>
        ＋ Add pack size
      </button>

      <div className="row" style={{ marginTop: 20, gap: 10 }}>
        <button className="btn primary" disabled={busy || !canSave} onClick={save}>
          {busy ? "Saving…" : "Save product"}
        </button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
