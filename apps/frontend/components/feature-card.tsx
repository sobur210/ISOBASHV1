import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon } from "@/components/ui/icons";

/**
 * A surface entry on the workspace dashboard. Deliberately flatter than the
 * marketing cards: this is a launcher, not a pitch, so the only motion is the
 * arrow and the border.
 */
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
      className="group flex flex-col rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-primary">
          {icon}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] tracking-[0.1em] whitespace-nowrap uppercase ${
            live ? "bg-success/10 text-success" : "bg-surface-2 text-muted-foreground"
          }`}
        >
          {live ? (
            <span aria-hidden="true" className="animate-pulse-ring h-1.5 w-1.5 rounded-full bg-success" />
          ) : null}
          {phase}
        </span>
      </div>

      <h3 className="mt-4 text-[13.5px] font-semibold tracking-[-0.01em] text-foreground">{title}</h3>
      <p className="mt-1.5 flex-1 text-[12.5px] leading-5 text-muted-foreground">{description}</p>

      <span className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors group-hover:text-primary">
        Open
        <ArrowRightIcon className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}