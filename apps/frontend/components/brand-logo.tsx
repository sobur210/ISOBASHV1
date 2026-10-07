import Image from "next/image";

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
      src="/logo.png"
      alt="ISOBASH"
      width={2051}
      height={767}
      priority={priority}
      className={`logo-on-dark w-auto ${className}`}
    />
  );
}
