import type { ReactNode } from "react";

export type BadgeTone = "success" | "warning" | "danger" | "neutral" | "primary" | "accent";

const tones: Record<BadgeTone, string> = {
  success: "bg-success/12 text-success ring-success/25",
  warning: "bg-warning/12 text-warning ring-warning/25",
  danger: "bg-danger/12 text-danger ring-danger/25",
  neutral: "bg-muted text-muted-foreground ring-border",
  primary: "bg-primary/12 text-primary ring-primary/25",
  accent: "bg-accent/12 text-accent ring-accent/25",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-[0.08em] uppercase ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
