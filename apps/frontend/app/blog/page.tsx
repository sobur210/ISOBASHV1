import type { Metadata } from "next";
import { AuroraBackdrop } from "@/components/marketing/aurora-backdrop";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { FileIcon } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Blog",
  description: "Product notes and engineering write-ups from the ISOBASH team.",
};

export default function BlogPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNavbar />

      <main className="flex-1">
        <section className="relative isolate overflow-hidden">
          <AuroraBackdrop />
          <div className="relative mx-auto w-full max-w-4xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary-soft px-3 py-1.5 font-mono text-[10.5px] font-semibold tracking-[0.2em] text-primary uppercase">
              Blog
            </span>
            <h1 className="mt-6 text-4xl font-bold tracking-[-0.04em] text-balance sm:text-[3.5rem] sm:leading-[1.05]">
              Notes from the build.
            </h1>
            <p className="mt-6 max-w-xl text-[15.5px] leading-8 text-pretty text-muted-foreground">
              Product decisions, architecture write-ups and the occasional post-mortem — published when
              they are actually finished.
            </p>
          </div>
        </section>

        <Section className="pb-28">
          <div className="edge-light flex flex-col items-center rounded-[28px] border border-dashed border-border-strong bg-surface/60 px-8 py-20 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-2 text-muted-foreground">
              <FileIcon className="h-6 w-6" />
            </span>
            <h2 className="mt-6 text-lg font-semibold tracking-[-0.01em] text-foreground">
              No posts published yet
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[13.5px] leading-6 text-muted-foreground">
              We are still building ISOBASH phase by phase. Product notes and engineering write-ups will
              appear here once they are published — nothing is listed before it is real.
            </p>
            <ButtonLink href="/" variant="outline" className="mt-8">
              Back to ISOBASH
            </ButtonLink>
          </div>
        </Section>
      </main>

      <MarketingFooter />
    </div>
  );
}
