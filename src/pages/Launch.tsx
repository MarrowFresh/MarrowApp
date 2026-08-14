import { useEffect, useRef, useState } from "react";
import { adminApi } from "../lib/apiClient";

// Launch Control.
//
// One button opens the website. There is no schedule: if the first cut isn't
// ready, the site stays behind the Coming Soon screen. Because that is a
// one-way, customer-visible action, it asks before it fires.

type State = {
  status: "ComingSoon" | "Launching" | "Live";
  started_at: string | null;
  countdown_seconds: number;
  reveal_seconds: number;
  elapsed_ms: number;
  server_time: string;
};

const LABEL: Record<State["status"], string> = {
  ComingSoon: "Coming soon",
  Launching: "Launch sequence running",
  Live: "Live",
};

export default function Launch() {
  const [state, setState] = useState<State | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const skewRef = useRef(0); // server time − our clock

  async function load() {
    try {
      const s: State = await adminApi.getLaunch();
      skewRef.current = new Date(s.server_time).getTime() - Date.now();
      setState(s);
      setErr("");
    } catch (e: any) {
      setErr(e?.message || "Could not read the launch state.");
    }
  }

  useEffect(() => {
    load();
    // Slow while waiting, quick while it's actually running — the admin should
    // see it flip to Live without reaching for refresh.
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  // Local ticker for the seconds remaining, corrected by the server's clock.
  useEffect(() => {
    if (state?.status !== "Launching" || !state.started_at) {
      setLeft(null);
      return;
    }
    const total = (state.countdown_seconds + state.reveal_seconds) * 1000;
    const startedAt = new Date(state.started_at).getTime();
    const tick = () => {
      const now = Date.now() + skewRef.current;
      setLeft(Math.max(0, Math.ceil((startedAt + total - now) / 1000)));
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [state?.status, state?.started_at]);

  async function start() {
    setBusy(true);
    try {
      setState(await adminApi.startLaunch().then((r) => r.json()));
      setConfirming(false);
    } catch (e: any) {
      setErr(e?.message || "Launch failed to start.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!confirm("Put the website back behind the Coming Soon screen?")) return;
    setBusy(true);
    try {
      setState(await adminApi.resetLaunch().then((r) => r.json()));
    } catch (e: any) {
      setErr(e?.message || "Could not reset.");
    } finally {
      setBusy(false);
    }
  }

  const status = state?.status ?? "ComingSoon";

  return (
    <div className="page">
      <div className="page-head">
        <h1>Launch control</h1>
      </div>

      {err && <div className="err">{err}</div>}

      <div className="card launch-card">
        <div className="launch-rows">
          <div>
            <span className="k">Website status</span>
            <span className={"chip chip-" + status.toLowerCase()}>{LABEL[status]}</span>
          </div>
          <div>
            <span className="k">Visitors see</span>
            <span className="v">
              {status === "Live" ? "The shop" : status === "Launching" ? "The countdown" : "Coming soon screen"}
            </span>
          </div>
          <div>
            <span className="k">{status === "Launching" ? "Opens in" : "Sequence"}</span>
            <span className="v mono">
              {status === "Launching" && left !== null ? `${left}s` : `${(state?.countdown_seconds ?? 10) + (state?.reveal_seconds ?? 10)} seconds`}
            </span>
          </div>
        </div>

        {status === "ComingSoon" && !confirming && (
          <button className="btn-launch" disabled={busy} onClick={() => setConfirming(true)}>
            🚀 Start launch
          </button>
        )}

        {status === "ComingSoon" && confirming && (
          <div className="launch-confirm">
            <p>
              Everyone with the website open will see the countdown, and the shop opens for
              everybody about {(state?.countdown_seconds ?? 10) + (state?.reveal_seconds ?? 10)}{" "}
              seconds later. Ready?
            </p>
            <div className="launch-confirm-row">
              <button className="btn-launch danger" disabled={busy} onClick={start}>
                {busy ? "Starting…" : "Yes, launch now"}
              </button>
              <button className="btn-quiet" disabled={busy} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {status === "Launching" && (
          <button className="btn-launch" disabled>
            Launch sequence running…
          </button>
        )}

        {status === "Live" && (
          <>
            <button className="btn-launch live" disabled>
              ✓ Website is live
            </button>
            <button className="btn-quiet" disabled={busy} onClick={reset}>
              Put back to Coming soon
            </button>
          </>
        )}

        <p className="launch-note">
          {status === "Live"
            ? "The website is open. Customers can browse and order normally."
            : "The website stays on Coming soon until you press this. Nothing opens on a timer, so nobody can reach the shop before you are ready to cut."}
        </p>
      </div>
    </div>
  );
}
