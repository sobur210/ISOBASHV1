import { CheckIcon, PlayIcon } from "@/components/marketing/marketing-icons";

function OrbitBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.20),transparent_65%)] blur-2xl" />
      <svg viewBox="0 0 800 600" className="absolute left-1/2 top-1/2 h-[130%] w-[130%] -translate-x-1/2 -translate-y-1/2">
        <g fill="none" stroke="#3B82F6" strokeOpacity="0.22">
          <ellipse cx="400" cy="300" rx="380" ry="150" />
          <ellipse cx="400" cy="300" rx="380" ry="150" transform="rotate(28 400 300)" />
          <ellipse cx="400" cy="300" rx="330" ry="110" transform="rotate(-22 400 300)" />
        </g>
        <g fill="#0EA5FF" fillOpacity="0.5">
          <circle cx="120" cy="240" r="3" />
          <circle cx="700" cy="380" r="3" />
          <circle cx="520" cy="120" r="2.5" />
        </g>
      </svg>
    </div>
  );
}

function LandscapeCard() {
  return (
    <div className="absolute left-[-14%] top-[6%] hidden w-[188px] overflow-hidden rounded-2xl border border-white/10 bg-[#0B1220] shadow-[0_24px_60px_-18px_rgba(0,0,0,0.8)] xl:block">
      <div className="relative h-[104px] bg-[linear-gradient(160deg,#0B1B3A_0%,#123A6B_45%,#0EA5FF_100%)]">
        <svg viewBox="0 0 188 104" className="absolute inset-0 h-full w-full">
          <path d="M0 104 46 52l26 26 22-30 34 34 26-22 34 44Z" fill="#0A1220" fillOpacity="0.85" />
          <path d="M0 104 58 70l30 22 34-16 66 28Z" fill="#060A12" fillOpacity="0.9" />
          <circle cx="146" cy="30" r="11" fill="#DBEAFE" fillOpacity="0.85" />
        </svg>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-[11px] font-semibold text-white">Aurora Landscape</p>
        <p className="mt-0.5 text-[9.5px] text-slate-400">Generated in 4.2s</p>
      </div>
    </div>
  );
}

function CharacterCard() {
  return (
    <div className="absolute left-[-10%] bottom-[4%] hidden w-[164px] overflow-hidden rounded-2xl border border-white/10 bg-[#0B1220] shadow-[0_24px_60px_-18px_rgba(0,0,0,0.8)] xl:block">
      <div className="relative h-[92px] bg-[linear-gradient(200deg,#1E1B4B_0%,#312E81_55%,#3B82F6_100%)]">
        <svg viewBox="0 0 164 92" className="absolute inset-0 h-full w-full">
          <circle cx="82" cy="34" r="17" fill="#DBEAFE" fillOpacity="0.9" />
          <path d="M82 56c-22 0-36 14-40 36h80c-4-22-18-36-40-36Z" fill="#E0E7FF" fillOpacity="0.85" />
          <circle cx="75" cy="33" r="2.4" fill="#1E293B" />
          <circle cx="89" cy="33" r="2.4" fill="#1E293B" />
        </svg>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-[11px] font-semibold text-white">Character Design</p>
        <p className="mt-0.5 text-[9.5px] text-slate-400">Style reference</p>
      </div>
    </div>
  );
}

function VideoCard() {
  return (
    <div className="absolute right-[-12%] top-[-7%] hidden w-[196px] overflow-hidden rounded-2xl border border-white/10 bg-[#0B1220] shadow-[0_24px_60px_-18px_rgba(0,0,0,0.8)] xl:block">
      <div className="relative h-[108px] bg-[linear-gradient(140deg,#0F172A_0%,#1E3A8A_60%,#0EA5FF_100%)]">
        <svg viewBox="0 0 196 108" className="absolute inset-0 h-full w-full">
          <path d="M0 84c40-22 74 8 108-6s58-30 88-14v44H0Z" fill="#060A12" fillOpacity="0.75" />
        </svg>
        <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#0B1220] shadow-lg">
          <PlayIcon className="h-4 w-4 translate-x-[1px]" />
        </span>
        <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[9.5px] text-white">
          0:24
        </span>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-[11px] font-semibold text-white">Text to Video</p>
        <p className="mt-0.5 text-[9.5px] text-slate-400">Queued · processing</p>
      </div>
    </div>
  );
}

function ResearchCard() {
  return (
    <div className="absolute right-[-9%] bottom-[2%] hidden w-[214px] overflow-hidden rounded-2xl border border-[#3B82F6]/25 bg-[#0B1220]/95 shadow-[0_24px_60px_-18px_rgba(0,0,0,0.8)] backdrop-blur-xl xl:block">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3.5 py-2.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[#0EA5FF]" />
        <p className="text-[11px] font-semibold text-white">Research Results</p>
      </div>
      <div className="space-y-2.5 px-3.5 py-3">
        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#60A5FA]">Key Findings</p>
          <p className="mt-1 text-[10px] leading-4 text-slate-400">3 verified results summarised</p>
        </div>
        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#60A5FA]">Sources</p>
          <ul className="mt-1 space-y-1">
            <li className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <CheckIcon className="h-2.5 w-2.5 text-emerald-400" /> docs.example.com
            </li>
            <li className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <CheckIcon className="h-2.5 w-2.5 text-emerald-400" /> research.example.org
            </li>
          </ul>
        </div>
        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#60A5FA]">Summary</p>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/10" />
          <div className="mt-1 h-1.5 w-4/5 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  );
}

export function FloatingPreviewCards({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <OrbitBackdrop />
      <div className="relative lg:px-14 lg:py-12">
        {children}
      </div>
      <LandscapeCard />
      <CharacterCard />
      <VideoCard />
      <ResearchCard />
    </div>
  );
}
