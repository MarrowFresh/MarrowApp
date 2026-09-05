// Product photos are stored as "/img/rohu-fish.jpg" — a path on the customer
// website, where the files actually live. The admin is served from a different
// host (app.marrowfresh.com), so that path resolves against the admin's own
// origin, which serves no /img folder, and every photo renders broken.
//
// Resolve site-relative paths against the website instead. Absolute links
// (Pexels and the like) are already complete and pass through untouched.
const SITE = (import.meta.env.VITE_SITE_ORIGIN || "https://marrowfresh.com").replace(/\/+$/, "");

export function productImage(url?: string | null): string {
  const src = (url || "").trim();
  if (!src) return "";
  if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:")) return src;
  return SITE + (src.startsWith("/") ? src : "/" + src);
}
