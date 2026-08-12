import { useEffect, useState } from "react";
import { adminApi } from "../lib/apiClient";
import { useResource } from "../lib/useResource";

// Shop settings — read from and written to the database, so a change here takes
// effect immediately for the website AND the WhatsApp bot. (These used to save to
// this browser's localStorage only, which is why edits never changed anything.)
type Row = Record<string, any>;

// Mirrors PricingService.FeeForDistance so the preview matches what a customer
// is actually charged. Kept deliberately tiny — the backend stays authoritative.
function feeAt(km: number, s: Row): string {
  const baseKm = Number(s.base_delivery_km) || 3;
  const baseFee = Number(s.base_delivery_fee) || 0;
  const perKm = Number(s.per_km_fee) || 0;
  const maxKm = Number(s.max_delivery_km) || 0;

  if (maxKm > 0 && km > maxKm) return "not delivered";
  const fee = km <= baseKm || perKm <= 0 ? baseFee : baseFee + Math.ceil(km - baseKm) * perKm;
  return "₹" + fee.toLocaleString("en-IN");
}

export default function SettingsPage() {
  const { data, loading, error, saving, mutate } = useResource<Row | null>(adminApi.getSettings, null);
  const [s, setS] = useState<Row>({});
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  // Seed the form once the row arrives; don't clobber edits in progress.
  useEffect(() => { if (data && !dirty) setS(data); }, [data, dirty]);

  const set = (patch: Row) => { setS((c) => ({ ...c, ...patch })); setDirty(true); setSaved(false); };
  const num = (v: any) => (v === "" || v == null ? 0 : Number(v));

  const save = async () => {
    // Sending 0 for a blank radius would mean "deliver nowhere" — leave the field
    // out entirely so the server keeps whatever it already has.
    const radius = num(s.max_delivery_km);

    const ok = await mutate(() => adminApi.saveSettings({
      ...(radius > 0 ? { max_delivery_km: radius } : {}),
      base_delivery_fee:    num(s.base_delivery_fee),
      base_delivery_km:     num(s.base_delivery_km) > 0 ? num(s.base_delivery_km) : 3,
      per_km_fee:           num(s.per_km_fee),
      free_delivery_amount: num(s.free_delivery_amount),
      free_delivery_weight: num(s.free_delivery_weight),
      packing_fee_enabled:  !!s.packing_fee_enabled,
      packing_fee:          num(s.packing_fee),
      free_packing_amount:  num(s.free_packing_amount),
      free_packing_weight:  num(s.free_packing_weight),
      platform_fee_enabled: !!s.platform_fee_enabled,
      platform_fee_type:    s.platform_fee_type || "flat",
      platform_fee_value:   num(s.platform_fee_value),
      default_tax_rate:     num(s.default_tax_rate),
      min_order_value:      num(s.min_order_value),
    }));
    if (ok) { setDirty(false); setSaved(true); }
  };

  if (loading) return <div className="panel"><p className="muted">Loading settings…</p></div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="sub">Fees &amp; thresholds — applied live to the website and WhatsApp</div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          {saved && !dirty && <span className="free">✓ Saved</span>}
          <button className="btn primary" disabled={saving || !dirty} onClick={save}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>

      {error && <div className="panel" style={{ borderColor: "#f5c6c0" }}>
        <span style={{ color: "#c0392b" }}>{error}</span>
      </div>}

      <div className="grid2">
        <div className="panel">
          <h2>Delivery distance &amp; price</h2>

          <div className="row" style={{ gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label>Price up to…</label>
              <input type="number" step="0.5" style={{ width: 90 }} value={s.base_delivery_km ?? ""}
                onChange={(e) => set({ base_delivery_km: e.target.value })} />
            </div>
            <span className="muted" style={{ paddingBottom: 10 }}>km</span>
            <div>
              <label>…costs ₹</label>
              <input type="number" style={{ width: 110 }} value={s.base_delivery_fee ?? ""}
                onChange={(e) => set({ base_delivery_fee: e.target.value })} />
            </div>
          </div>

          <div className="row" style={{ gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginTop: 12 }}>
            <div>
              <label>Each extra km costs ₹</label>
              <input type="number" style={{ width: 110 }} value={s.per_km_fee ?? ""}
                onChange={(e) => set({ per_km_fee: e.target.value })} />
            </div>
            <div>
              <label>Deliver within (km)</label>
              <input type="number" step="0.5" style={{ width: 110 }} value={s.max_delivery_km ?? ""}
                onChange={(e) => set({ max_delivery_km: e.target.value })} />
            </div>
          </div>

          {/* Show the shopkeeper what they've just built, at real distances. */}
          <div className="fee-preview">
            {[2, Number(s.base_delivery_km) || 3, 5.4, 8].map((km) => (
              <span key={km}>{km} km → <b>{feeAt(km, s)}</b></span>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Part-kilometres round up, so 5.4 km charges 3 extra km. Beyond the limit customers
            are told "we're not in your area yet". Distance is measured to the nearest branch.
          </p>

          <label style={{ marginTop: 14 }}>Free delivery above ₹</label>
          <input type="number" value={s.free_delivery_amount ?? ""}
            onChange={(e) => set({ free_delivery_amount: e.target.value })} />

          <label style={{ marginTop: 10 }}>…or above weight (kg)</label>
          <input type="number" step="0.1" value={s.free_delivery_weight ?? ""}
            onChange={(e) => set({ free_delivery_weight: e.target.value })} />
        </div>

        <div className="panel">
          <h2>Packing</h2>
          <div className="row">
            <input type="checkbox" checked={!!s.packing_fee_enabled}
              onChange={(e) => set({ packing_fee_enabled: e.target.checked })} />
            <span>Charge a packing fee</span>
          </div>
          <label style={{ marginTop: 8 }}>Packing fee ₹</label>
          <input type="number" value={s.packing_fee ?? ""} disabled={!s.packing_fee_enabled}
            onChange={(e) => set({ packing_fee: e.target.value })} />

          <label style={{ marginTop: 10 }}>Free packing above ₹</label>
          <input type="number" value={s.free_packing_amount ?? ""} disabled={!s.packing_fee_enabled}
            onChange={(e) => set({ free_packing_amount: e.target.value })} />

          <label style={{ marginTop: 10 }}>…or above weight (kg)</label>
          <input type="number" step="0.1" value={s.free_packing_weight ?? ""} disabled={!s.packing_fee_enabled}
            onChange={(e) => set({ free_packing_weight: e.target.value })} />
        </div>

        <div className="panel">
          <h2>Platform fee</h2>
          <div className="row">
            <input type="checkbox" checked={!!s.platform_fee_enabled}
              onChange={(e) => set({ platform_fee_enabled: e.target.checked })} />
            <span>Charge a platform fee</span>
          </div>
          <label style={{ marginTop: 10 }}>Type</label>
          <select value={s.platform_fee_type || "flat"} disabled={!s.platform_fee_enabled}
            onChange={(e) => set({ platform_fee_type: e.target.value })}>
            <option value="flat">Flat ₹</option>
            <option value="percent">Percent %</option>
          </select>
          <label style={{ marginTop: 10 }}>Value</label>
          <input type="number" value={s.platform_fee_value ?? ""} disabled={!s.platform_fee_enabled}
            onChange={(e) => set({ platform_fee_value: e.target.value })} />
        </div>

        <div className="panel">
          <h2>Order</h2>
          <label>Default tax rate % <span className="muted">(fresh meat = 0)</span></label>
          <input type="number" step="0.01" value={s.default_tax_rate ?? ""}
            onChange={(e) => set({ default_tax_rate: e.target.value })} />

          <label style={{ marginTop: 10 }}>Minimum order value ₹ <span className="muted">(0 = none)</span></label>
          <input type="number" value={s.min_order_value ?? ""}
            onChange={(e) => set({ min_order_value: e.target.value })} />

          <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
            Free-delivery and free-packing can also be waived by the <b>Rules</b> engine —
            e.g. "2kg of Chicken". Rules and these thresholds both apply; whichever matches first wins.
          </p>
        </div>
      </div>
    </>
  );
}
