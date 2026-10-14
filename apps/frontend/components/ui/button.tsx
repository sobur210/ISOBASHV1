import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "accent" | "outline" | "ghost" | "subtle" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "group/btn relative inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  accent: "bg-accent text-primary-foreground hover:brightness-110",
  outline:
    "border border-border-strong bg-transparent text-foreground hover:border-primary/60 hover:bg-primary-soft hover:text-primary",
  ghost: "text-muted-foreground hover:bg-surface-3 hover:text-foreground",
  subtle: "border border-border bg-surface-2 text-foreground hover:border-border-strong hover:bg-surface-3",
  danger: "border border-danger/40 bg-danger/10 text-danger hover:bg-danger hover:text-white",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[12.5px]",
  md: "h-9 px-4 text-[13px]",
  lg: "h-11 px-6 text-sm",
  icon: "h-9 w-9",
};

function classes(variant: Variant, size: Size, className: string) {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`;
}

type SharedProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: SharedProps & ComponentProps<"button">) {
  return <button {...props} className={classes(variant, size, className)} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: SharedProps & ComponentProps<typeof Link>) {
  return (
    <Link {...props} className={classes(variant, size, className)}>
      {children}
    </Link>
  );
}
