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
  const live = phase === "Live now";

  return (
    <Link
      href={href}
      className="group edge-light relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-lift"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 -right-14 h-40 w-40 rounded-full bg-primary/15 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
      />

      <div className="relative flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary-soft text-primary transition-transform duration-300 group-hover:scale-105">
          {icon}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.1em] uppercase ${
            live
              ? "border border-success/30 bg-success/10 text-success"
              : "border border-border bg-surface-2 text-muted-foreground"
          }`}
        >
          {live ? <span className="animate-pulse-ring h-1.5 w-1.5 rounded-full bg-success" /> : null}
          {phase}
        </span>
      </div>

      <h3 className="relative mt-5 text-[15px] font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </h3>
      <p className="relative mt-2 flex-1 text-[13.5px] leading-6 text-muted-foreground">{description}</p>

      <span className="relative mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary">
        Open surface
        <ArrowRightIcon className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
      </span>
    </Link>
  );
}
