import type { ReactNode } from "react";

export function PlaceholderCard({
  icon,
  title,
  description,
  feature,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  feature: string;
}) {
  return (
    <div className="edge-light rounded-2xl border border-dashed border-border-strong bg-surface/50 p-8">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted-foreground">
        {icon}
      </span>
      <h2 className="mt-5 text-[15px] font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
      <p className="mt-2.5 max-w-xl text-[13.5px] leading-6 text-muted-foreground">{description}</p>
      <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
        {feature}
      </p>
    </div>
  );
}
