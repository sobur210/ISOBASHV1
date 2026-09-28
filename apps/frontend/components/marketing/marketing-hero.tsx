import { ButtonLink } from "@/components/ui/button";
import { AuroraBackdrop } from "@/components/marketing/aurora-backdrop";
import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { FloatingPreviewCards } from "@/components/marketing/floating-cards";
import { ArrowRightIcon, PlayIcon } from "@/components/ui/icons";

const trustPoints = [
  "No vendor lock-in",
  "Runs offline",
  "Nothing simulated",
];

export function MarketingHero() {
  return (
    <section className="relative isolate overflow-hidden">
      <AuroraBackdrop />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-16 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:px-8 lg:pb-28 lg:pt-24">
        <div className="animate-rise">
          <span className="glass inline-flex items-center gap-2.5 rounded-full py-1.5 pr-4 pl-1.5 text-[12.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.16em] text-primary uppercase">
              <span className="animate-pulse-ring h-1.5 w-1.5 rounded-full bg-primary" />
              Live
            </span>
            Local-first · Cloud-ready
          </span>

          <h1 className="mt-7 text-[2.75rem] leading-[1.02] font-bold tracking-[-0.04em] text-balance text-foreground sm:text-6xl lg:text-[4.35rem]">
            Create. Research. Build.
            <span className="text-gradient mt-1.5 block">All with AI.</span>
          </h1>

          <p className="mt-7 max-w-[560px] text-[15.5px] leading-8 text-pretty text-muted-foreground sm:text-[16.5px]">
            ISOBASH brings the best models, creative tools, live web research and automation into one
            workspace — routed per request across local and cloud providers, and honest about what it
            cannot do.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3.5">
            <ButtonLink href="/register" size="lg" className="group">
              Start creating free
              <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
            <ButtonLink href="/app/chat" size="lg" variant="outline">
              <PlayIcon className="h-3.5 w-3.5" />
              Open the workspace
            </ButtonLink>
          </div>

          <ul className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
            {trustPoints.map((point) => (
              <li key={point} className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <span className="h-1 w-1 rounded-full bg-accent" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="animate-rise min-w-0 [animation-delay:120ms]">
          <FloatingPreviewCards>
            <DashboardPreview />
          </FloatingPreviewCards>
        </div>
      </div>
    </section>
  );
}
