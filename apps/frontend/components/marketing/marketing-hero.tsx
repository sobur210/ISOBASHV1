import { ButtonLink } from "@/components/ui/button";
import { ArrowRightIcon, CheckIcon } from "@/components/ui/icons";
import { HeroBackdrop } from "@/components/marketing/hero-backdrop";

const trustPoints = [
  "No vendor lock-in",
  "Runs offline",
  "Nothing simulated",
  "Multi-provider routing",
];

function TrustPoint({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
        <CheckIcon className="h-3 w-3" />
      </span>
      {label}
    </li>
  );
}

export function MarketingHero() {
  return (
    <section className="relative isolate flex min-h-[calc(100svh-80px)] flex-col justify-center overflow-hidden">
      <HeroBackdrop />

      <div className="relative z-10 mx-auto w-full max-w-[1280px] px-4 py-16 sm:px-8 sm:py-20 lg:px-10 lg:py-24">
        <div className="animate-rise mx-auto flex max-w-4xl flex-col items-center text-center">
          <h1 className="text-[2.3rem] font-bold leading-[1] tracking-[-0.045em] text-foreground sm:text-[3.3rem] lg:text-[4.4rem] lg:leading-[0.98]">
            Create, Research,{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(100deg, var(--primary), color-mix(in srgb, var(--accent) 62%, var(--primary)))",
                WebkitBackgroundClip: "text",
              }}
            >
              Build.
            </span>
          </h1>

          <p className="mt-4 text-[1.1rem] font-medium leading-snug tracking-[-0.015em] text-foreground/90 sm:text-[1.3rem] lg:text-[1.55rem]">
            Anything You Imagine.
          </p>

          <p className="mt-6 max-w-[620px] text-[16px] font-medium leading-8 text-pretty text-foreground light:text-black sm:text-[17px]">
            ISOBASH brings powerful AI models, creative tools, live web research and automation into
            one workspace.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <ButtonLink
              href="/register"
              size="lg"
              className="group h-12 rounded-full bg-blue-600 px-7 text-[15px] font-semibold text-white shadow-[0_18px_42px_-20px_rgba(37,99,235,0.8)] hover:bg-blue-500"
            >
              Start creating free
              <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
            <ButtonLink
              href="/app/chat"
              size="lg"
              variant="outline"
              className="group h-12 rounded-full border border-border-strong bg-white/80 px-7 text-[15px] font-semibold text-slate-800 shadow-[0_12px_38px_-24px_rgba(15,23,42,0.25)] hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            >
              Open workspace
              <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
          </div>

          <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-[12.5px] font-medium text-muted-foreground sm:text-[13px]">
            {trustPoints.map((point) => (
              <TrustPoint key={point} label={point} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}