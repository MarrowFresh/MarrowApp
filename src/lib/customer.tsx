// Customer identity helpers shared by the Orders list and the order-detail page.
//
// WhatsApp numbers arrive from the bot as bare digits with the country code
// ("919154217648"). We show them grouped and give the admin one-tap call / chat
// links so they can reach the customer without retyping the number.

type CustomerLike = {
  customer_phone?: string | null;
  is_new_customer?: boolean;
  customer_order_seq?: number;
  customer_order_count?: number;
};

// "919154217648" → "+91 91542 17648". Anything unexpected is returned as-is.
export function formatPhone(raw?: string | null): string {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 5)} ${d.slice(5)}`;
  return raw || "";
}

export const telHref = (raw?: string | null) => `tel:+${(raw || "").replace(/\D/g, "")}`;
export const waHref  = (raw?: string | null) => `https://wa.me/${(raw || "").replace(/\D/g, "")}`;

// NEW for a first-time customer, otherwise how many orders they've placed.
export function CustomerBadge({ order }: { order: CustomerLike }) {
  if (order.is_new_customer === undefined) return null;

  if (order.is_new_customer) {
    return <span className="pill New" title="First order from this customer">✨ NEW</span>;
  }

  const seq = order.customer_order_seq ?? 0;
  const total = order.customer_order_count ?? 0;
  return (
    <span className="pill Delivered" title={`${total} orders placed to date`}>
      ↩ Order #{seq}
    </span>
  );
}

// Phone line with call + WhatsApp links. Renders nothing without a number.
export function CustomerPhone({ phone, compact = false }: { phone?: string | null; compact?: boolean }) {
  if (!phone) return null;
  return (
    <span className="muted" style={{ fontSize: compact ? 11 : 13 }}>
      <a href={telHref(phone)} style={{ color: "inherit" }}>{formatPhone(phone)}</a>
      {" · "}
      <a href={waHref(phone)} target="_blank" rel="noreferrer" title="Open chat in WhatsApp">💬</a>
    </span>
  );
}
