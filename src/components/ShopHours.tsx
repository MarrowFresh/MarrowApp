import { useEffect, useState } from "react";
import { adminApi, type ShopStatus } from "../lib/apiClient";

// When the shop takes orders, and the switch to stop now.
//
// Closed never means "go away". An order placed at eleven at night is taken as
// a pre-order for the next opening — the customer who wants mutton tonight will
// still want it at seven, and turning them away loses the sale to whoever is
// still answering. What changes is what the website and the bot promise.
/// The three buttons answer one question: what decides whether orders are
/// being taken — the clock, or you?
///
/// The labels say which, because "Follow the hours" meant nothing to the shop
/// on its own. Automatic is where this sits nearly every day; the other two are
/// for the exceptional one, and they stay put until someone changes them back.
const MODES = (open: string, close: string): {
  id: ShopStatus["mode"]; label: string; hint: string;
}[] => [
  {
    id: "auto",
    label: `Automatic — ${nice(open)} to ${nice(close)}`,
    hint: "Opens and closes itself by the clock. Leave it here on an ordinary day.",
  },
  {
    id: "open",
    label: "Stay open — ignore the clock",
    hint: "A late night, a festival. Keeps taking orders past closing time until you switch back.",
  },
  {
    id: "closed",
    label: "Stop now — until I say otherwise",
    hint: "Sold out, a power cut. Stops orders even though the clock says you're open.",
  },
];

/// "06:00" → "6:00 am". A shop reads the clock the way it speaks it.
function nice(hhmm: string): string {
  const [h, m] = (hhmm || "").split(":").map(Number);
  if (!isFinite(h)) return hhmm;
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m || 0).padStart(2, "0")} ${suffix}`;
}

export default function ShopHours() {
  const [s, setS] = useState<ShopStatus | null>(null);
  const [draft, setDraft] = useState<{ open_time: string; close_time: string; note: string }>({
    open_time: "", close_time: "", note: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = (row: ShopStatus) => {
    setS(row);
    setDraft({ open_time: row.open_time, close_time: row.close_time, note: row.note || "" });
  };

  useEffect(() => {
    adminApi.getShopStatus()
      .then(load)
      .catch((e) => setErr(e?.message || "Could not read the shop's hours"));
  }, []);

  const apply = async (patch: Parameters<typeof adminApi.saveShopHours>[0]) => {
    setBusy(true); setErr(null); setSaved(false);
    try {
      load(await adminApi.saveShopHours(patch));
      setSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  if (err && !s) return <section className="panel"><p style={{ color: "var(--bad)" }}>{err}</p></section>;
  if (!s) return <section className="panel"><p className="muted">Loading…</p></section>;

  const reopens = s.opens_at
    ? new Date(s.opens_at).toLocaleString("en-IN", {
        weekday: "short", hour: "numeric", minute: "2-digit", hour12: true,
      })
    : null;

  return (
    <section className="panel">
      <div className="strip">
        <h2>Taking orders</h2>
        <span className="rule" />
        <span className={"sh-pill " + (s.open ? "on" : "off")}>
          {s.open ? "OPEN" : "CLOSED"}
        </span>
      </div>

      <div className={"sh-now " + (s.open ? "on" : "off")}>
        {s.open
          ? <>Customers can order now. Closing at <b>{s.close_time}</b>.</>
          : <>Orders are being taken as pre-orders{reopens ? <> for <b>{reopens}</b></> : null}.
             <div className="sh-say">Customers see: “{s.message}”</div></>}
      </div>

      <div className="sh-ask">What decides whether you're taking orders?</div>

      <div className="sh-modes">
        {MODES(draft.open_time || s.open_time, draft.close_time || s.close_time).map((m) => (
          <button key={m.id} className="sh-mode" aria-checked={s.mode === m.id} role="radio"
            disabled={busy} onClick={() => apply({ mode: m.id })}>
            <span className="dot" />
            <span className="t"><b>{m.label}</b><span>{m.hint}</span></span>
          </button>
        ))}
      </div>

      <div className="sh-times">
        <div>
          <label>Opens</label>
          <input type="time" value={draft.open_time}
            onChange={(e) => { setDraft({ ...draft, open_time: e.target.value }); setSaved(false); }} />
        </div>
        <div>
          <label>Closes</label>
          <input type="time" value={draft.close_time}
            onChange={(e) => { setDraft({ ...draft, close_time: e.target.value }); setSaved(false); }} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label>What to tell customers while closed</label>
          <input value={draft.note} maxLength={120} placeholder="We're closed for the night."
            onChange={(e) => { setDraft({ ...draft, note: e.target.value }); setSaved(false); }} />
        </div>
        <button className="btn primary" disabled={busy}
          onClick={() => apply({
            openTime: draft.open_time, closeTime: draft.close_time, note: draft.note,
          })}>
          {busy ? "Saving…" : saved ? "✓ Saved" : "Save hours"}
        </button>
      </div>

      <div className="sh-hint">
        <b>Closing does not turn customers away.</b> While you are shut, every product shows as
        pre-order and the order still arrives, marked for the next opening — so the night&rsquo;s
        orders are waiting when you start cutting, instead of someone ringing back in the
        morning. Hours are shop time.
      </div>

      {err && <p style={{ color: "var(--bad)", marginTop: 10, fontSize: 13 }}>{err}</p>}
    </section>
  );
}
