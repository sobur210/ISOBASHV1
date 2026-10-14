import Image from "next/image";
import { ButtonLink } from "@/components/ui/button";
import { ArrowRightIcon, CheckIcon } from "@/components/ui/icons";
import { HeroCube } from "@/components/marketing/hero-cube";

const featureLabels = ["AI-powered creation", "Research", "Coding and building"];

function FeatureLabel({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
        <CheckIcon className="h-3 w-3" />
      </span>
      {label}
    </li>
  );
}

/**
 * The landing hero: a left-aligned text block beside the animated 3D sculpture.
 * No badge, no circuit lines and no floating panels — the sculpture is the only
 * decoration, so the headline and the call to action lead.
 */
export function MarketingHero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <Image
          src="/bg.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-background/50" />
      </div>
      <div className="mx-auto grid w-full max-w-[1280px] items-center gap-14 px-4 py-16 sm:px-8 sm:py-20 lg:min-h-[calc(100svh-80px)] lg:grid-cols-[minmax(0,1.04fr)_minmax(0,1fr)] lg:gap-10 lg:px-10 lg:py-24">
        <div className="animate-rise order-2 max-w-2xl lg:order-1">
          <h1 className="text-balance font-bold leading-[1.02] tracking-[-0.045em] text-foreground text-[2.4rem] sm:text-[3.2rem] lg:text-[4.1rem] lg:leading-[0.99]">
            Think bigger. Create more. <span className="text-primary">Get things done.</span>
          </h1>

          <p className="mt-4 text-[1.1rem] font-medium leading-snug tracking-[-0.015em] text-foreground/90 sm:text-[1.3rem] lg:text-[1.5rem]">
            Your ideas, powered by AI.
          </p>

          <p className="mt-6 max-w-[560px] text-pretty text-[16px] font-medium leading-8 text-muted-foreground sm:text-[17px]">
            From writing and coding to creative projects, research, and everyday problem-solving,
            ISOBASH brings powerful AI tools together to help you turn ideas into results.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <ButtonLink href="/register" size="lg" className="group h-12 px-7 text-[15px] font-semibold">
              Start creating free
              <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
            <ButtonLink
              href="#features"
              size="lg"
              variant="subtle"
              className="group h-12 px-7 text-[15px] font-semibold"
            >
              Explore ISOBASH
              <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
          </div>

          <ul className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px] font-medium text-muted-foreground">
            {featureLabels.map((label) => (
              <FeatureLabel key={label} label={label} />
            ))}
          </ul>
        </div>

        <div aria-hidden="true" className="relative order-1 h-[320px] w-full sm:h-[400px] lg:order-2 lg:h-[520px] xl:h-[540px]">
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(54% 54% at 58% 46%, color-mix(in srgb, var(--primary) 12%, transparent) 0%, transparent 64%)",
            }}
          />
          <div className="h-full w-full lg:translate-x-4 xl:translate-x-6">
            <HeroCube />
          </div>
        </div>
      </div>
    </section>
  );
}
