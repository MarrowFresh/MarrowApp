/// The real Marrow Fresh mark, from the same files the website and the mobile
/// app ship.
///
/// Every shell here used to draw its own brand: a letter "M" in a circle beside
/// the words "Marrow Fresh" in Playfair. That is a placeholder, not a logo — it
/// looked like the brand only by coincidence, and drifted a little more with
/// every screen someone added. This is the one component that renders it, so
/// there is nowhere left for a second version to appear.
///
/// `onDark` picks the light artwork. The sidebar and the delivery header are
/// espresso; the login card and customer header are cream.
export function Logo({
  onDark = false,
  height = 34,
  lockup = false,
}: {
  onDark?: boolean;
  height?: number;
  lockup?: boolean;
}) {
  const src = lockup
    ? onDark ? "/logo-lockup-light.png" : "/logo-lockup.png"
    : onDark ? "/logo-mark-light.svg" : "/logo-mark.svg";

  return (
    <img
      src={src}
      alt="Marrow Fresh"
      height={height}
      style={{ height, width: "auto", display: "block" }}
      // The logo is decoration next to a heading that already says the name;
      // loading it must never delay the page it sits on.
      loading="eager"
      decoding="async"
    />
  );
}
