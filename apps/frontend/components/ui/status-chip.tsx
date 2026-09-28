import { Badge, type BadgeTone } from "@/components/ui/badge";

const dotByTone: Record<BadgeTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-muted-foreground/50",
  primary: "bg-primary",
  accent: "bg-accent",
};

/** Tone-matched pulse, so a live "ok" reads as alive rather than static. */
const pulseByTone: Record<BadgeTone, string> = {
  success: "animate-pulse-ring",
  warning: "",
  danger: "",
  neutral: "",
  primary: "animate-pulse-ring",
  accent: "animate-pulse-ring",
};

export function StatusChip({ tone, label }: { tone: BadgeTone; label: string }) {
  return (
    <Badge tone={tone} className="normal-case tracking-normal">
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${dotByTone[tone]} ${pulseByTone[tone]}`}
      />
      {label}
    </Badge>
  );
}
