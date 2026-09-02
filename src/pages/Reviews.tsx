import { useState } from "react";
import { adminApi } from "../lib/apiClient";
import { useResource } from "../lib/useResource";

// What customers actually said.
//
// Ratings have been collected since migration 015, but the only place they
// surfaced was a Telegram ping the moment they arrived — useful in the moment,
// no use a week later when someone asks how the shop is doing. This is that
// week-later view: the average, the spread, and every comment in full.
//
// Low scores are pulled to the top of mind rather than buried in date order,
// because a 2 with a written complaint is the one row worth acting on today.
type Row = Record<string, any>;

const when = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

export default function Reviews() {
  const { data: rows, loading, error } = useResource<Row[]>(adminApi.getReviews, []);
  const [only, setOnly] = useState<"all" | "low" | "comments">("all");

  const rated = rows.filter((r) => r.rating != null);
  const avg = rated.length
    ? rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length
    : 0;

  // 5 → 1, so the bar chart reads top-down the way people think about stars.
  const spread = [5, 4, 3, 2, 1].map((n) => ({
    n,
    count: rated.filter((r) => Number(r.rating) === n).length,
  }));
  const worst = Math.max(1, ...spread.map((s) => s.count));

  const shown = rows.filter((r) =>
    only === "low" ? Number(r.rating) <= 3 :
    only === "comments" ? !!(r.feedback || "").trim() :
    true
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reviews</h1>
          <div className="sub">Ratings and comments customers left after delivery</div>
        </div>
      </div>

      {error && <div className="panel"><span style={{ color: "var(--bad)" }}>{error}</span></div>}

      {loading ? (
        <div className="panel"><p className="muted">Loading…</p></div>
      ) : rows.length === 0 ? (
        <div className="panel">
          <p className="muted">
            No reviews yet. Customers are asked to rate the moment an order is marked
            delivered — the ask goes out while the food is still on the table, because
            an hour later nobody replies.
          </p>
        </div>
      ) : (
        <>
          <div className="panel rv-summary">
            <div className="rv-avg">
              <div className="n">{avg.toFixed(1)}</div>
              <div className="s">{stars(Math.round(avg))}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {rated.length} rating{rated.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="rv-bars">
              {spread.map((s) => (
                <div className="rv-bar" key={s.n}>
                  <span className="lbl">{s.n}★</span>
                  <span className="track">
                    <span className={"fill" + (s.n <= 3 ? " low" : "")}
                      style={{ width: `${(s.count / worst) * 100}%` }} />
                  </span>
                  <span className="cnt">{s.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {([
                ["all", `Everything (${rows.length})`],
                ["low", `Needs attention (${rows.filter((r) => Number(r.rating) <= 3).length})`],
                ["comments", `With a comment (${rows.filter((r) => (r.feedback || "").trim()).length})`],
              ] as const).map(([k, lbl]) => (
                <button key={k} className={"btn sm " + (only === k ? "accent" : "ghost")}
                  onClick={() => setOnly(k)}>{lbl}</button>
              ))}
            </div>

            {shown.length === 0 ? (
              <p className="muted">Nothing here — which is the good outcome for this filter.</p>
            ) : (
              <div className="rv-list">
                {shown.map((r) => {
                  const score = Number(r.rating) || 0;
                  const low = score > 0 && score <= 3;
                  return (
                    <div className={"rv-item" + (low ? " low" : "")} key={r.id}>
                      <div className="rv-top">
                        <span className={"rv-stars" + (low ? " low" : "")}>
                          {score ? stars(score) : "—"}
                        </span>
                        <b>{r.customers?.name || "Customer"}</b>
                        <span className="muted">#{r.order_no}</span>
                        <span className="muted rv-when">{when(r.feedback_at || r.delivered_at)}</span>
                      </div>
                      {(r.feedback || "").trim()
                        ? <p className="rv-text">“{r.feedback}”</p>
                        : <p className="rv-text muted"><i>Rated, no comment left.</i></p>}
                      {r.customers?.phone && (
                        <a className="btn sm ghost"
                          href={`https://wa.me/${String(r.customers.phone).replace(/\D/g, "")}`}
                          target="_blank" rel="noreferrer">
                          {low ? "Call them back" : "Message"} →
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <GoogleLink />
    </>
  );
}

/// Where a happy customer is sent to review the shop publicly.
///
/// Editable rather than hardcoded: a review URL points at one Google listing,
/// and a wrong one sends customers to somebody else's shop.
function GoogleLink() {
  const { data: settings, saving, mutate } = useResource<Row>(adminApi.getSettings, {});
  const [url, setUrl] = useState<string | null>(null);
  const value = url ?? settings?.google_review_url ?? "";

  return (
    <div className="panel">
      <div className="strip"><h2>Google reviews</h2><span className="rule" /></div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Customers who rate <b>4 or 5</b> are invited to say so on Google. Anyone who
        rates lower is not — sending an unhappy customer to a public review page is
        asking for a one-star in writing.
      </p>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: ".4px",
        textTransform: "uppercase", color: "var(--muted)", marginBottom: 5 }}>
        Review link
      </label>
      <div className="row" style={{ gap: 8 }}>
        <input style={{ flex: 1 }} value={value} placeholder="https://g.page/r/…/review"
          onChange={(e) => setUrl(e.target.value)} />
        <button className="btn primary" disabled={saving || url === null}
          onClick={() => mutate(() => adminApi.saveSettings({ google_review_url: value.trim() }))}>
          Save
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Get it from <b>Google Business Profile → Ask for reviews</b>. Leave it empty
        and no Google ask is sent at all.
      </p>
    </div>
  );
}
