import { CheckIcon, PlayIcon } from "@/components/ui/icons";

/** Concentric orbit rings that make the preview feel suspended. */
function OrbitBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg viewBox="0 0 800 600" className="absolute left-1/2 top-1/2 h-[135%] w-[135%] -translate-x-1/2 -translate-y-1/2">
        <g fill="none" stroke="currentColor" strokeOpacity="0.16" className="text-primary">
          <ellipse cx="400" cy="300" rx="380" ry="150" />
          <ellipse cx="400" cy="300" rx="380" ry="150" transform="rotate(28 400 300)" />
          <ellipse cx="400" cy="300" rx="330" ry="110" transform="rotate(-22 400 300)" />
        </g>
        <g fill="currentColor" className="text-accent" fillOpacity="0.6">
          <circle cx="120" cy="240" r="3" />
          <circle cx="700" cy="380" r="3" />
          <circle cx="520" cy="120" r="2.5" />
        </g>
      </svg>
    </div>
  );
}

function FloatCard({
  className = "",
  delay = "",
  children,
}: {
  className?: string;
  delay?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`edge-light animate-float-slow absolute overflow-hidden rounded-2xl border border-border-strong bg-surface/90 shadow-deep backdrop-blur-xl ${delay} ${className}`}
    >
      {children}
    </div>
  );
}

function LandscapeCard() {
  return (
    <FloatCard className="top-[4%] left-[-15%] hidden w-[190px] xl:block">
      <div className="relative h-[106px] bg-[linear-gradient(160deg,#0b1b3a_0%,#123a6b_45%,#22d3ee_100%)]">
        <svg viewBox="0 0 190 106" className="absolute inset-0 h-full w-full">
          <path d="M0 106 46 52l26 26 22-30 34 34 26-22 36 46Z" fill="#04070f" fillOpacity="0.85" />
          <path d="M0 106 58 70l30 22 34-16 68 30Z" fill="#02040a" fillOpacity="0.9" />
          <circle cx="148" cy="30" r="11" fill="#dbeafe" fillOpacity="0.85" />
        </svg>
      </div>
      <div className="px-3.5 py-3">
        <p className="text-[11px] font-semibold text-foreground">Aurora Landscape</p>
        <p className="mt-0.5 text-[9.5px] text-muted-foreground">Generated in 4.2s</p>
      </div>
    </FloatCard>
  );
}

function CharacterCard() {
  return (
    <FloatCard className="bottom-[3%] left-[-12%] hidden w-[168px] xl:block" delay="[animation-delay:-3.5s]">
      <div className="relative h-[94px] bg-[linear-gradient(200deg,#1e1b4b_0%,#312e81_55%,#4d8dff_100%)]">
        <svg viewBox="0 0 168 94" className="absolute inset-0 h-full w-full">
          <circle cx="84" cy="34" r="17" fill="#dbeafe" fillOpacity="0.9" />
          <path d="M84 56c-22 0-36 14-40 36h80c-4-22-18-36-40-36Z" fill="#e0e7ff" fillOpacity="0.85" />
          <circle cx="77" cy="33" r="2.4" fill="#1e293b" />
          <circle cx="91" cy="33" r="2.4" fill="#1e293b" />
        </svg>
      </div>
      <div className="px-3.5 py-3">
        <p className="text-[11px] font-semibold text-foreground">Character Design</p>
        <p className="mt-0.5 text-[9.5px] text-muted-foreground">Style reference</p>
      </div>
    </FloatCard>
  );
}

function VideoCard() {
  return (
    <FloatCard className="top-[-8%] right-[-13%] hidden w-[198px] xl:block" delay="[animation-delay:-6s]">
      <div className="relative h-[110px] bg-[linear-gradient(140deg,#0f172a_0%,#1e3a8a_60%,#22d3ee_100%)]">
        <svg viewBox="0 0 198 110" className="absolute inset-0 h-full w-full">
          <path d="M0 86c40-22 74 8 108-6s58-30 90-14v44H0Z" fill="#02040a" fillOpacity="0.75" />
        </svg>
        <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#04070f] shadow-lg">
          <PlayIcon className="h-4 w-4 translate-x-[1px]" />
        </span>
        <span className="absolute right-2 bottom-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[9.5px] text-white">
          0:24
        </span>
      </div>
      <div className="px-3.5 py-3">
        <p className="text-[11px] font-semibold text-foreground">Text to Video</p>
        <p className="mt-0.5 text-[9.5px] text-muted-foreground">Queued · processing</p>
      </div>
    </FloatCard>
  );
}

function ResearchCard() {
  return (
    <FloatCard className="right-[-10%] bottom-[1%] hidden w-[218px] xl:block" delay="[animation-delay:-9s]">
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        <p className="text-[11px] font-semibold text-foreground">Research Results</p>
      </div>
      <div className="space-y-2.5 px-3.5 py-3">
        <div>
          <p className="font-mono text-[9px] font-semibold tracking-[0.14em] text-accent uppercase">Key findings</p>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">3 verified results summarised</p>
        </div>
        <div>
          <p className="font-mono text-[9px] font-semibold tracking-[0.14em] text-accent uppercase">Sources</p>
          <ul className="mt-1 space-y-1">
            <li className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <CheckIcon className="h-2.5 w-2.5 text-success" /> docs.example.com
            </li>
            <li className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <CheckIcon className="h-2.5 w-2.5 text-success" /> research.example.org
            </li>
          </ul>
        </div>
        <div>
          <p className="font-mono text-[9px] font-semibold tracking-[0.14em] text-accent uppercase">Summary</p>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-foreground/10" />
          <div className="mt-1 h-1.5 w-4/5 rounded-full bg-foreground/10" />
        </div>
      </div>
    </FloatCard>
  );
}

export function FloatingPreviewCards({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <OrbitBackdrop />
      <div className="relative lg:px-16 lg:py-14">{children}</div>
      <LandscapeCard />
      <CharacterCard />
      <VideoCard />
      <ResearchCard />
    </div>
  );
}
