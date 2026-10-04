import { useEffect, useState } from "react";
import { adminApi } from "../lib/apiClient";

// One message to everyone, on WhatsApp's terms.
//
// WhatsApp only allows a freely-typed message within 24 hours of the customer's
// last message — for a campaign that is almost nobody. Everyone else can only be
// reached with a template Meta approved in advance. So this screen composes a
// template, not free text, and says why rather than letting sends fail silently.
type Row = Record<string, any>;

const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN");

// Meta's India marketing rate, near enough for a number worth seeing before you
// press send.
const PER_MESSAGE = 0.78;

export default function Broadcast() {
  const [aud, setAud] = useState<Row | null>(null);
  const [tpls, setTpls] = useState<Row[]>([]);
  const [tplError, setTplError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [audience, setAudience] = useState<"all" | "customers" | "leads" | "picked">("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [tplName, setTplName] = useState("");
  // Only used when Meta's template list could not be read (WhatsApp:WabaId
  // unset). Then nothing here knows the template at all, so the shop pastes the
  // wording it had approved: the blanks count themselves from it, and the
  // preview finally shows something. It is never sent — Meta fills in its own
  // stored copy — it is how the shop sees what it is about to send.
  const [manualBody, setManualBody] = useState("");
  const [image, setImage] = useState("");
  const [vars, setVars] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Row | null>(null);

  useEffect(() => {
    Promise.all([
      adminApi.getBroadcastAudience(),
      adminApi.getBroadcastTemplates().catch(() => ({ templates: [], error: "Could not load templates." })),
    ])
      .then(([a, t]: any[]) => {
        setAud(a);
        setTpls((t.templates || []).filter((x: Row) => x.status === "APPROVED"));
        setTplError(t.error || null);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="panel"><p className="muted">Loading…</p></div>;

  const tpl = tpls.find((t) => t.name === tplName);
  // The wording, whether Meta supplied it or the shop pasted it.
  const body = tpl?.body || manualBody;
  // How many {{n}} blanks it has — the highest marker in the wording.
  const varCount = tpl
    ? (tpl.variables ?? 0)
    : [...manualBody.matchAll(/\{\{\s*(\d+)\s*\}\}/g)]
        .reduce((max, m) => Math.max(max, Number(m[1])), 0);
  const count =
    audience === "customers" ? aud?.customers ?? 0 :
    audience === "leads" ? aud?.leads ?? 0 :
    audience === "picked" ? picked.length :
    aud?.total ?? 0;

  // The body with its {{n}} blanks filled, which is what actually arrives.
  const preview = body
    .replace(/\{\{\s*(\d+)\s*\}\}/g, (_m: string, n: string) => vars[Number(n) - 1] || "…");

  const send = async () => {
    if (!tplName) return window.alert("Choose a template first.");
    if (!window.confirm(
      `Send "${tplName}" to ${count} ${count === 1 ? "person" : "people"}?\n\n` +
      `Roughly ${inr(Math.round(count * PER_MESSAGE))} in WhatsApp charges. This cannot be undone.`
    )) return;

    setSending(true); setResult(null);
    try {
      const r = await adminApi.sendBroadcast({
        templateName: tplName,
        language: tpl?.language || "en",
        imageUrl: image || null,
        variables: vars.slice(0, varCount),
        audience,
        phones: audience === "picked" ? picked : null,
      });
      setResult(r);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Broadcast</h1>
          <div className="sub">One message to your customers and leads on WhatsApp</div>
        </div>
      </div>

      <div className="panel bc-warn">
        <b>Why templates.</b> WhatsApp only allows a freely-typed message within 24 hours of
        a customer's last message — right now that's <b>{aud?.window_open ?? 0} of {aud?.total ?? 0}</b>{" "}
        contacts. Everyone else can only be reached with a template Meta approved in advance,
        so the message below is a template with blanks you fill in.
      </div>

      {result && (
        <div className="panel" style={{ borderLeft: "3px solid " + (result.failed ? "var(--bad)" : "var(--ok)") }}>
          <b>{result.sent} sent{result.failed ? `, ${result.failed} failed` : ""}.</b>
          {result.errors?.length > 0 && (
            <ul style={{ margin: "8px 0 0 18px", fontSize: 13, color: "var(--muted)" }}>
              {result.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="bc-cols">
        <div>
          <section className="panel">
            <div className="strip"><h2>Who gets it</h2><span className="rule" /></div>
            <div className="bc-aud">
              {([
                ["all", "Everyone", "Customers and leads who have ever messaged us", aud?.total],
                ["customers", "Customers only", "Have placed at least one order", aud?.customers],
                ["leads", "Leads only", "Messaged us but never ordered", aud?.leads],
                ["picked", "Pick people", "Choose individually below", picked.length],
              ] as const).map(([k, label, sub, n]) => (
                <button key={k} className="bc-opt" aria-checked={audience === k} role="radio"
                  onClick={() => setAudience(k as any)}>
                  <span className="dot" />
                  <span className="t"><b>{label}</b><span>{sub}</span></span>
                  <span className="n">{n ?? 0}</span>
                </button>
              ))}
            </div>

            {audience === "picked" && (
              <div className="bc-pick">
                {(aud?.contacts || []).map((c: Row) => (
                  <label className="row" key={c.phone}>
                    <input type="checkbox" checked={picked.includes(c.phone)}
                      onChange={(e) => setPicked((p) =>
                        e.target.checked ? [...p, c.phone] : p.filter((x) => x !== c.phone))} />
                    {c.name || c.phone}
                    <span className={"tag " + (c.segment === "customer" ? "c" : "")}>{c.segment}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="bc-hint">
              Your own test numbers are always excluded, and so is anyone who replied STOP.
            </div>
          </section>

          <section className="panel">
            <div className="strip"><h2>Message</h2><span className="rule" /></div>

            {tplError && <div className="bc-hint" style={{ marginBottom: 12 }}>{tplError}</div>}

            {tpls.length > 0 ? (
              <div>
                {tpls.map((t) => (
                  <button key={t.name} className="bc-tpl" aria-checked={tplName === t.name} role="radio"
                    onClick={() => { setTplName(t.name); setVars([]); }}>
                    <span className="dot" />
                    <span className="t">
                      <b>{t.name}</b>
                      <span>{t.has_image ? "Image · " : ""}{t.variables} blank{t.variables === 1 ? "" : "s"} · {t.category}</span>
                    </span>
                    <span className="st ok">{t.status}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <label>Template name</label>
                <input value={tplName} placeholder="weekend_offer"
                  onChange={(e) => setTplName(e.target.value)} />
                <div className="bc-hint">
                  Exactly as it appears in Meta Business Manager — same spelling, same
                  underscores, all lower case.
                </div>
                <label style={{ marginTop: 12 }}>The approved message</label>
                <textarea rows={6} value={manualBody}
                  placeholder={"Today you get {{1}} off on orders above ₹{{2}}.\nUse code {{3}} at checkout."}
                  onChange={(e) => setManualBody(e.target.value)} />
                <div className="bc-hint">
                  Paste the body exactly as Meta approved it, <code>{"{{1}}"}</code> markers
                  and all. This is not what gets sent — WhatsApp uses its own copy — it is
                  how the blanks below are worked out and how the preview knows what to show.
                  Set <b>WhatsApp:WabaId</b> and all of this arrives from Meta on its own.
                </div>
              </div>
            )}

            <div className="bc-grid" style={{ marginTop: 16 }}>
              {(!tpl || tpl.has_image) && (
                <div>
                  <label>Picture</label>
                  <input value={image} placeholder="https://…/weekend-offer.jpg"
                    onChange={(e) => setImage(e.target.value)} />
                  <div className="bc-hint">
                    A public link — WhatsApp fetches it, so it cannot be a local file.
                    Landscape, 1.91:1.
                  </div>
                </div>
              )}
              {Array.from({ length: varCount }).map((_, i) => (
                <div key={i}>
                  <label>Blank {i + 1}</label>
                  <input value={vars[i] || ""} maxLength={60}
                    onChange={(e) => setVars((v) => { const n = [...v]; n[i] = e.target.value; return n; })} />
                </div>
              ))}
            </div>
          </section>

          <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginBottom: 24 }}>
            <button className="btn primary" disabled={sending || !tplName || count === 0} onClick={send}>
              {sending ? `Sending to ${count}…` : `Send to ${count} ${count === 1 ? "person" : "people"}`}
            </button>
          </div>
        </div>

        <aside className="bc-rail">
          <div className="bc-railh">How it arrives</div>
          <div className="bc-phone">
            <div className="bc-bubble">
              {(!tpl || tpl.has_image) && (
                <div className="img">{image ? <img src={image} alt="" /> : <span>no picture yet</span>}</div>
              )}
              <div className="txt">
                {preview
                  ? preview.split("\n").map((l: string, i: number) => <div key={i}>{l || " "}</div>)
                  : <span style={{ opacity: .6 }}>Choose a template to see it here.</span>}
              </div>
              <div className="time">now</div>
            </div>
          </div>

          <div className="bc-cost">
            <span>{count} marketing message{count === 1 ? "" : "s"}</span>
            <b>≈ {inr(Math.round(count * PER_MESSAGE))}</b>
          </div>

          <div className="panel" style={{ margin: 0, padding: "14px 15px" }}>
            <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
              <b style={{ color: "var(--ink)" }}>Before you send</b><br />
              Meta charges per marketing conversation, and people who block or report drag your
              quality rating down — a red rating cuts how many people you may message at all.
              <br /><br />
              One of these a week, always with a reason: an offer, a new product. Never just to
              say hello.
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
