import { Badge, BadgeTone } from "@/components/ui/badge";

const dotByTone: Record<BadgeTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-foreground/40",
  primary: "bg-primary",
};

export function StatusChip({ tone, label }: { tone: BadgeTone; label: string }) {
  return (
    <Badge tone={tone} className="capitalize">
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotByTone[tone]}`} />
      {label}
    </Badge>
  );
}