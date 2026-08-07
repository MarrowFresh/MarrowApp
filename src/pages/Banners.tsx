import { useState } from "react";
import { useDB } from "../useStore";
import { store } from "../lib/data";
import type { Banner } from "../lib/types";

const blank = (): Banner => ({
  id: "", title: "", image_url: "", link_to: "",
  placement: "home_hero", active: true,
});

const PLACEMENTS: Banner["placement"][] = ["home_hero", "carousel", "popup", "strip"];

export default function Banners() {
  const db = useDB();
  const [b, setB] = useState<Banner>(blank());
  const set = (p: Partial<Banner>) => setB({ ...b, ...p });

  const save = () => {
    if (!b.title) return;
    store.upsertBanner({ ...b, id: store.uid() });
    setB(blank());
  };

  const live = (x: Banner) => {
    if (!x.active) return false;
    const today = new Date().toISOString().slice(0, 10);
    if (x.start_date && today < x.start_date) return false;
    if (x.end_date && today > x.end_date) return false;
    return true;
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Banners / Ads</h1>
          <div className="sub">Promo images for the website & customer app — schedule & toggle</div></div>
      </div>

      <div className="panel">
        <h2>Add banner</h2>
        <div className="grid2">
          <div><label>Title</label><input style={{ width: "100%" }} value={b.title}
            onChange={(e) => set({ title: e.target.value })} placeholder="Launch offer — 10% off" /></div>
          <div><label>Image URL (upload to Supabase Storage later)</label>
            <input style={{ width: "100%" }} value={b.image_url}
              onChange={(e) => set({ image_url: e.target.value })} placeholder="https://…/banner.png" /></div>
        </div>
        <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
          <div><label>Links to</label><input value={b.link_to}
            onChange={(e) => set({ link_to: e.target.value })} placeholder="WELCOME10 / product / whatsapp" /></div>
          <div><label>Placement</label>
            <select value={b.placement} onChange={(e) => set({ placement: e.target.value as Banner["placement"] })}>
              {PLACEMENTS.map((p) => <option key={p}>{p}</option>)}
            </select></div>
          <div><label>Start date</label><input type="date" value={b.start_date ?? ""}
            onChange={(e) => set({ start_date: e.target.value || undefined })} /></div>
          <div><label>End date</label><input type="date" value={b.end_date ?? ""}
            onChange={(e) => set({ end_date: e.target.value || undefined })} /></div>
          <div style={{ alignSelf: "end" }}>
            <button className="btn primary" disabled={!b.title} onClick={save}>Add banner</button>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Banners ({db.banners.length})</h2>
        <table>
          <thead><tr><th>Title</th><th>Placement</th><th>Links to</th><th>Schedule</th><th>Live now</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {db.banners.map((x) => (
              <tr key={x.id}>
                <td><b>{x.title}</b></td>
                <td className="muted">{x.placement}</td>
                <td className="muted">{x.link_to || "—"}</td>
                <td className="muted">{x.start_date || "…"} → {x.end_date || "…"}</td>
                <td>{live(x) ? <span className="free">● Live</span> : <span className="muted">○ Hidden</span>}</td>
                <td>
                  <button className={"btn sm " + (x.active ? "accent" : "ghost")}
                    onClick={() => store.upsertBanner({ ...x, active: !x.active })}>
                    {x.active ? "On" : "Off"}
                  </button>
                </td>
                <td><button className="btn sm ghost" onClick={() => store.deleteBanner(x.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
