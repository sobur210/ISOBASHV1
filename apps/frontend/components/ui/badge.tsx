import { ReactNode } from "react";

export type BadgeTone = "success" | "warning" | "danger" | "neutral" | "primary";

const tones: Record<BadgeTone, string> = {
  success: "bg-success/15 text-success ring-success/30",
  warning: "bg-warning/15 text-warning ring-warning/30",
  danger: "bg-danger/15 text-danger ring-danger/30",
  neutral: "bg-muted text-muted-foreground ring-foreground/15",
  primary: "bg-primary/15 text-primary ring-primary/30",
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
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}