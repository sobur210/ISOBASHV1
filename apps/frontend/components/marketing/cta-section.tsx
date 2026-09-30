import { AuroraBackdrop } from "@/components/marketing/aurora-backdrop";
import { ButtonLink } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/ui/icons";

export function CtaSection() {
  return (
    <section className="relative isolate overflow-hidden">
      <AuroraBackdrop />

      <div className="relative mx-auto w-full max-w-4xl px-4 py-24 text-center sm:px-6 sm:py-32 lg:px-8">
        <h2 className="text-3xl font-bold tracking-[-0.035em] text-balance sm:text-[3.25rem] sm:leading-[1.05]">
          <span className="text-foreground">Your AI. Your Agents.</span>
          <span className="text-gradient mt-1.5 block">Your Workspace.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-[15.5px] leading-7 text-pretty text-muted-foreground">
          Create an account and work in the real platform, running on your own machine, with your own
          providers, and nothing simulated.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3.5">
          <ButtonLink href="/register" size="lg" className="group">
            Get started free
            <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </ButtonLink>
          <ButtonLink href="/app/chat" size="lg" variant="outline">
            Sign in
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
