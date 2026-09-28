import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "accent" | "outline" | "ghost" | "subtle" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "group/btn relative inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-glow hover:bg-primary-hover hover:shadow-lift",
  accent:
    "bg-accent text-primary-foreground shadow-[0_14px_36px_-16px_var(--accent)] hover:brightness-110",
  outline:
    "border border-border-strong bg-transparent text-foreground hover:border-primary/60 hover:bg-primary-soft hover:text-primary",
  ghost: "text-muted-foreground hover:bg-surface-3 hover:text-foreground",
  subtle: "border border-border bg-surface-2 text-foreground hover:border-border-strong hover:bg-surface-3",
  danger: "border border-danger/40 bg-danger/10 text-danger hover:bg-danger hover:text-white",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[13px]",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-7 text-[15px]",
  icon: "h-10 w-10",
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
