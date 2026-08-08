import { useState } from "react";
import { adminApi } from "../lib/apiClient";
import { useResource } from "../lib/useResource";

// Products and their variants, straight from the database — the same rows the
// website and the WhatsApp bot read. Editing a price here changes what customers
// pay on the next request.
//
// The old version of this screen edited a localStorage copy with a flat
// price-per-product, which matched neither the real schema (products have many
// variants) nor the data customers actually saw.
type Variant = Record<string, any>;
type Product = Record<string, any>;

const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN");

export default function Products() {
  const { data: products, loading, error, saving, mutate } =
    useResource<Product[]>(adminApi.getProducts, []);

  // Edits are staged per variant so a mistyped digit isn't saved mid-keystroke.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const stage = (id: string, v: string) => setEdits((e) => ({ ...e, [id]: v }));

  const savePrice = async (v: Variant) => {
    const raw = edits[v.id];
    const price = Number(raw);
    if (raw === undefined || !isFinite(price) || price <= 0) return;
    if (await mutate(() => adminApi.updateVariant(v.id, { price })))
      setEdits((e) => { const { [v.id]: _drop, ...rest } = e; return rest; });
  };

  const toggleVariant = (v: Variant) =>
    mutate(() => adminApi.updateVariant(v.id, { available: !v.available }));

  const toggleProduct = (p: Product) =>
    mutate(() => adminApi.updateProduct(p.id, { available: !p.available }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Products</h1>
          <div className="sub">Prices &amp; availability — live on the website and WhatsApp</div>
        </div>
      </div>

      {error && <div className="panel"><span style={{ color: "#c0392b" }}>{error}</span></div>}

      <div className="panel">
        {loading ? <p className="muted">Loading products…</p> : products.length === 0 ? (
          <p className="muted">No products found.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Product</th><th>Category</th><th>Pack</th><th>Price</th><th>Pack status</th><th>Product</th></tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const variants: Variant[] = (p.product_variants || [])
                  .slice()
                  .sort((a: Variant, b: Variant) => (a.sort_order || 0) - (b.sort_order || 0));

                if (variants.length === 0) {
                  return (
                    <tr key={p.id}>
                      <td><b>{p.name}</b></td>
                      <td className="muted">{p.category}</td>
                      <td colSpan={3} className="muted"><i>no packs configured</i></td>
                      <td>
                        <button className={"btn sm " + (p.available ? "accent" : "ghost")}
                          disabled={saving} onClick={() => toggleProduct(p)}>
                          {p.available ? "On sale" : "Hidden"}
                        </button>
                      </td>
                    </tr>
                  );
                }

                return variants.map((v, i) => {
                  const staged = edits[v.id];
                  const changed = staged !== undefined && Number(staged) !== Number(v.price);
                  return (
                    <tr key={v.id}>
                      {i === 0 && (
                        <>
                          <td rowSpan={variants.length}><b>{p.name}</b></td>
                          <td rowSpan={variants.length} className="muted">{p.category}</td>
                        </>
                      )}
                      <td className="muted">{v.label || `${v.weight_g}g`}</td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <input
                            type="number"
                            style={{ width: 100 }}
                            value={staged ?? v.price}
                            onChange={(e) => stage(v.id, e.target.value)}
                          />
                          {changed && (
                            <button className="btn sm primary" disabled={saving} onClick={() => savePrice(v)}>
                              Save
                            </button>
                          )}
                        </div>
                        {!changed && <div className="muted" style={{ fontSize: 11 }}>{inr(v.price)}</div>}
                      </td>
                      <td>
                        <button className={"btn sm " + (v.available ? "accent" : "ghost")}
                          disabled={saving} onClick={() => toggleVariant(v)}>
                          {v.available ? "Available" : "Sold out"}
                        </button>
                      </td>
                      {i === 0 && (
                        <td rowSpan={variants.length}>
                          <button className={"btn sm " + (p.available ? "accent" : "ghost")}
                            disabled={saving} onClick={() => toggleProduct(p)}>
                            {p.available ? "On sale" : "Hidden"}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        )}

        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          Marking a pack <b>Sold out</b> hides just that size; <b>Hidden</b> removes the whole product
          from the shop. Neither deletes anything — past orders keep their prices.
        </p>
      </div>

      <div className="panel">
        <h2>Adding a new product</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          New products need a category and subcategory, and at least one pack size, so they're
          created in Supabase for now. This screen handles the daily work — price changes and
          sold-out toggles. Ask me to build the full add-product form when you need it.
        </p>
      </div>
    </>
  );
}
