import type { Metadata } from "next";
import Link from "next/link";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";

export const metadata: Metadata = {
  title: "Blog | ISOBASH",
  description: "Product notes and engineering write-ups from the ISOBASH team.",
};

export default function BlogPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#070B14]">
      <MarketingNavbar />
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-white/[0.06]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_-10%,rgba(59,130,246,0.24),transparent_65%)]"
          />
          <div className="relative mx-auto w-full max-w-4xl px-4 py-24 sm:px-6 lg:px-8">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-[#3B82F6]">Blog</p>
            <h1 className="mt-5 text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">
              Notes from the build.
            </h1>
          </div>
        </section>

        <section>
          <div className="mx-auto w-full max-w-4xl px-4 py-24 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-10 text-center">
              <h2 className="text-[15px] font-semibold text-white">No posts published yet</h2>
              <p className="mx-auto mt-3 max-w-md text-[13.5px] leading-6 text-slate-400">
                We are still building ISOBASH phase by phase. Product notes and engineering write-ups will appear
                here once they are published &mdash; nothing is listed before it is real.
              </p>
              <Link
                href="/"
                className="mt-7 inline-block rounded-full border border-[#3B82F6]/50 px-6 py-3 text-[14px] font-semibold text-[#93C5FD] transition-colors hover:border-[#3B82F6] hover:text-white"
              >
                Back to ISOBASH
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
