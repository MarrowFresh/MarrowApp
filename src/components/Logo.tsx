// The same brand lockup the website ships — wings mark plus the MARROW / FRESH
// wordmark, transparent PNG, from the identical files in public/.
//
// This deliberately mirrors MarrowFresh.Frontend/src/components/Logo.jsx rather
// than inventing a variant: the admin, the delivery app and the storefront are
// the same business, and a second treatment of the logo is how a brand starts
// looking like two.
//
// dark=false → espresso artwork, for light grounds like the login card.
// dark=true  → cream artwork, for dark grounds like the sidebar and the
//              delivery header, where the espresso wordmark would disappear.
//
// The width/height attrs are the artwork's intrinsic size. They pin the aspect
// ratio so nothing jumps while the image loads; height comes from the style.
export function Logo({ size = 40, dark = true }: { size?: number; dark?: boolean }) {
  return (
    <img
      src={dark ? "/logo-lockup-light.png" : "/logo-lockup.png"}
      alt="Marrow Fresh"
      width="620"
      height="163"
      style={{ height: size, width: "auto", display: "block" }}
      decoding="async"
    />
  );
}
