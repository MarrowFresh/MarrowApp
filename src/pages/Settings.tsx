import { useState } from "react";
import { useDB } from "../useStore";
import { store } from "../lib/data";
import type { Settings } from "../lib/types";

export default function SettingsPage() {
  const db = useDB();
  const [s, setS] = useState<Settings>(db.settings);
  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch });

  return (
    <>
      <div className="page-head">
        <div><h1>Settings</h1><div className="sub">Fees & thresholds — all editable, no developer needed</div></div>
        <button className="btn primary" onClick={() => store.saveSettings(s)}>Save settings</button>
      </div>

      <div className="grid2">
        <div className="panel">
          <h2>Delivery & packing</h2>
          <label>Base delivery fee ₹</label>
          <input type="number" value={s.base_delivery_fee}
            onChange={(e) => set({ base_delivery_fee: +e.target.value })} />
          <div style={{ height: 12 }} />
          <div className="row">
            <input type="checkbox" checked={s.packing_fee_enabled}
              onChange={(e) => set({ packing_fee_enabled: e.target.checked })} />
            <span>Charge packing fee</span>
          </div>
          <label style={{ marginTop: 8 }}>Packing fee ₹</label>
          <input type="number" value={s.packing_fee}
            onChange={(e) => set({ packing_fee: +e.target.value })} disabled={!s.packing_fee_enabled} />
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Free-delivery / free-packing thresholds are controlled by the <b>Rules</b> engine
            (e.g. “₹500 or 2kg”). This nudge target:
          </p>
          <label>Free-delivery nudge target ₹</label>
          <input type="number" value={s.free_delivery_amount}
            onChange={(e) => set({ free_delivery_amount: +e.target.value })} />
        </div>

        <div className="panel">
          <h2>Platform fee</h2>
          <div className="row">
            <input type="checkbox" checked={s.platform_fee_enabled}
              onChange={(e) => set({ platform_fee_enabled: e.target.checked })} />
            <span>Charge a platform fee</span>
          </div>
          <label style={{ marginTop: 10 }}>Type</label>
          <select value={s.platform_fee_type} disabled={!s.platform_fee_enabled}
            onChange={(e) => set({ platform_fee_type: e.target.value as "flat" | "percent" })}>
            <option value="flat">Flat ₹</option>
            <option value="percent">Percent %</option>
          </select>
          <label style={{ marginTop: 10 }}>Value</label>
          <input type="number" value={s.platform_fee_value} disabled={!s.platform_fee_enabled}
            onChange={(e) => set({ platform_fee_value: +e.target.value })} />

          <h2 style={{ marginTop: 20 }}>Tax</h2>
          <label>Default tax rate % (fresh meat = 0)</label>
          <input type="number" value={s.default_tax_rate}
            onChange={(e) => set({ default_tax_rate: +e.target.value })} />
        </div>
      </div>
    </>
  );
}
