import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/icons";
import { PlayIcon } from "@/components/marketing/marketing-icons";
import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { FloatingPreviewCards } from "@/components/marketing/floating-cards";
import { HeroCapabilities } from "@/components/marketing/hero-capabilities";

export function MarketingHero() {
  return (
    <section className="relative overflow-hidden bg-[#070B14]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_-8%,rgba(59,130,246,0.28),transparent_65%)]"
      />
      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-16 px-4 pb-24 pt-16 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:pb-32 lg:pt-24">
        <div>
          <h1 className="text-[2.6rem] font-bold leading-[1.04] tracking-[-0.035em] text-white sm:text-6xl lg:text-[4.1rem]">
            Create. Research. Build.
            <span className="mt-1 block text-[#3B82F6]">All with AI.</span>
          </h1>
          <p className="mt-7 max-w-[560px] text-[15px] leading-7 text-slate-400 sm:text-base">
            ISOBASH brings together the most powerful AI models, creative tools, research capabilities and
            automation &mdash; in one place. Turn your ideas into reality with text, images, videos, and more.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-full bg-[#3B82F6] px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_14px_40px_-10px_rgba(59,130,246,0.7)] transition-colors hover:bg-[#2563EB]"
            >
              Start Creating Free
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
            <Link
              href="/app/chat"
              className="inline-flex items-center gap-2 rounded-full border border-[#3B82F6]/50 bg-transparent px-7 py-3.5 text-[15px] font-semibold text-[#93C5FD] transition-colors hover:border-[#3B82F6] hover:text-white"
            >
              <PlayIcon className="h-3.5 w-3.5" />
              Watch Demo
            </Link>
          </div>
          <HeroCapabilities />
        </div>

        <div className="min-w-0">
          <FloatingPreviewCards>
            <DashboardPreview />
          </FloatingPreviewCards>
        </div>
      </div>
    </section>
  );
}
