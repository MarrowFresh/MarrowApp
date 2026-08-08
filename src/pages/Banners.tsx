import { useState } from "react";
import { adminApi } from "../lib/apiClient";
import { useResource } from "../lib/useResource";
import type { Banner } from "../lib/types";

const blank = (): Banner => ({
  id: "", title: "", image_url: "", link_to: "",
  placement: "home_hero", active: true,
});

const PLACEMENTS: Banner["placement"][] = ["home_hero", "carousel", "popup", "strip"];

export default function Banners() {
  // Banners come from the database, so the storefront shows what's set here.
  const { data: banners, loading, error, saving, mutate } =
    useResource<Banner[]>(adminApi.getBanners as unknown as () => Promise<Banner[]>, []);

  const [b, setB] = useState<Banner>(blank());
  const set = (p: Partial<Banner>) => setB({ ...b, ...p });

  const save = async () => {
    if (!b.title.trim()) return;
    const ok = await mutate(() => adminApi.createBanner({
      title: b.title.trim(),
      image_url: b.image_url || null,
      link_to: b.link_to || null,
      placement: b.placement,
      start_date: b.start_date || null,
      end_date: b.end_date || null,
      active: true,
      sort_order: banners.length + 1,
    }));
    if (ok) setB(blank());
  };

  const toggle = (x: Banner) => mutate(() => adminApi.updateBanner(x.id, { active: !x.active }));

  const turnOff = (x: Banner) => {
    if (window.confirm(`Turn off "${x.title}"?\n\nIt disappears from the site immediately.`))
      mutate(() => adminApi.deactivateBanner(x.id));
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
            <button className="btn primary" disabled={saving || !b.title.trim()} onClick={save}>{saving ? "Saving…" : "Add banner"}</button>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Banners ({banners.length})</h2>
        <table>
          <thead><tr><th>Title</th><th>Placement</th><th>Links to</th><th>Schedule</th><th>Live now</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {banners.map((x) => (
              <tr key={x.id}>
                <td><b>{x.title}</b></td>
                <td className="muted">{x.placement}</td>
                <td className="muted">{x.link_to || "—"}</td>
                <td className="muted">{x.start_date || "…"} → {x.end_date || "…"}</td>
                <td>{live(x) ? <span className="free">● Live</span> : <span className="muted">○ Hidden</span>}</td>
                <td>
                  <button className={"btn sm " + (x.active ? "accent" : "ghost")}
                    disabled={saving} onClick={() => toggle(x)}>
                    {x.active ? "On" : "Off"}
                  </button>
                </td>
                <td>{x.active && (<button className="btn sm ghost" disabled={saving} onClick={() => turnOff(x)}>Turn off</button>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
