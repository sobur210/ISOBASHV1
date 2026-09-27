import Image from "next/image";

export function BrandLogo({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/logo.png"
      alt="ISOBASH"
      width={2051}
      height={767}
      priority={priority}
      className={`h-8 w-auto ${className}`}
    />
  );
}
