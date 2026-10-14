import Image from "next/image";

/**
 * The wordmark artwork lives at a per-revision path. `sw.js` serves images
 * cache-first and never revalidates its copy, so a changed file behind an
 * unchanged URL would stay stale in every installed service worker; a new
 * filename is what actually makes existing clients fetch the new artwork.
 * Bump the suffix and rename the file together whenever the logo changes.
 * (A `?v=` query is not an option: this Next version rejects query strings on
 * local image `src` unless `images.localPatterns` is configured.)
 */
const LOGO_SRC = "/logo-v2.png";

/**
 * The brand wordmark. `.logo-on-dark` handles contrast per theme, so
 * callers must not pass their own filter.
 *
 * No height here on purpose. Tailwind emits .h-5 through .h-9 in ascending
 * order at identical specificity, so a height baked into this component beats
 * any *smaller* height a caller passes, regardless of the order of the class
 * attribute — a default `h-7` silently turned the `h-5` in the app and admin
 * shells into 28px. Callers must pass their own height (all six do).
 */
export function BrandLogo({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src={LOGO_SRC}
      alt="ISOBASH"
      width={2134}
      height={737}
      priority={priority}
      className={`logo-on-dark w-auto ${className}`}
    />
  );
}
