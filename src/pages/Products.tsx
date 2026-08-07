import { useState } from "react";
import { useDB } from "../useStore";
import { store } from "../lib/data";
import type { Category, Product } from "../lib/types";

const CATS: Category[] = ["Chicken", "Mutton", "Fish", "Prawns", "Crabs", "Eggs"];
const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

export default function Products() {
  const db = useDB();
  const [draft, setDraft] = useState<Product>({
    id: "", name: "", category: "Chicken", unit: "1kg",
    price: 0, weight_kg: 1, available: true,
  });

  const save = (p: Product) => store.upsertProduct(p);

  return (
    <>
      <div className="page-head">
        <div><h1>Products</h1><div className="sub">Prices, weight & availability — edit anytime</div></div>
      </div>

      <div className="panel">
        <h2>Add product</h2>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <div><label>Name</label><input value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Boneless" /></div>
          <div><label>Category</label>
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })}>
              {CATS.map((c) => <option key={c}>{c}</option>)}
            </select></div>
          <div><label>Unit</label><input style={{ width: 70 }} value={draft.unit}
            onChange={(e) => setDraft({ ...draft, unit: e.target.value })} /></div>
          <div><label>Price ₹</label><input type="number" style={{ width: 90 }} value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: +e.target.value })} /></div>
          <div><label>Weight kg</label><input type="number" step="0.1" style={{ width: 90 }} value={draft.weight_kg}
            onChange={(e) => setDraft({ ...draft, weight_kg: +e.target.value })} /></div>
          <div style={{ alignSelf: "end" }}>
            <button className="btn primary" disabled={!draft.name || draft.price <= 0}
              onClick={() => { save({ ...draft, id: store.newProductId() });
                setDraft({ ...draft, name: "", price: 0 }); }}>Add</button>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Catalogue ({db.products.length})</h2>
        <table>
          <thead><tr><th>Product</th><th>Category</th><th>Unit</th><th>Price</th><th>Weight</th><th>Available</th></tr></thead>
          <tbody>
            {db.products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="muted">{p.category}</td>
                <td>{p.unit}</td>
                <td>
                  <input type="number" style={{ width: 80 }} value={p.price}
                    onChange={(e) => save({ ...p, price: +e.target.value })} />
                </td>
                <td>
                  <input type="number" step="0.1" style={{ width: 70 }} value={p.weight_kg}
                    onChange={(e) => save({ ...p, weight_kg: +e.target.value })} /> kg
                </td>
                <td>
                  <button className={"btn sm " + (p.available ? "accent" : "ghost")}
                    onClick={() => save({ ...p, available: !p.available })}>
                    {p.available ? "In stock" : "Out"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
