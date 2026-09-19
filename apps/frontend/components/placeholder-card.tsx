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
    <div className="rounded-2xl border border-dashed border-border bg-surface/60 p-8">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-accent-soft text-accent">
        {icon}
      </div>
      <h2 className="mt-5 text-lg font-medium text-foreground">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
      <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground">
        {feature}
      </p>
    </div>
  );
}