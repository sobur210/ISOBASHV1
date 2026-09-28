import Image from "next/image";

/**
 * The brand wordmark. `.logo-on-dark` handles contrast per theme, so
 * callers must not pass their own filter.
 */
export function BrandLogo({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/logo.png"
      alt="ISOBASH"
      width={2051}
      height={767}
      priority={priority}
      className={`logo-on-dark h-7 w-auto ${className}`}
    />
  );
}
