import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon } from "@/components/ui/icons";

export function FeatureCard({
  href,
  icon,
  title,
  description,
  phase,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-foreground/10 bg-surface/60 p-6 transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-foreground/10 bg-accent-soft text-accent">
          {icon}
        </div>
        <span className="inline-flex items-center rounded-full border border-foreground/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {phase}
        </span>
      </div>
      <h3 className="mt-4 text-base font-medium text-foreground">{title}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-6 text-muted-foreground">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
        Open surface
        <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}