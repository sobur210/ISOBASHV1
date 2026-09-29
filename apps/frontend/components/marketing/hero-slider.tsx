"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";

export const HERO_SLIDES = [
  {
    id: 1,
    url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=2000&q=80",
    gradient: "from-blue-600/30 via-indigo-900/40 to-cyan-500/20",
    lightGradient: "from-blue-200/50 via-indigo-100/60 to-cyan-200/40",
    title: "Fluid AI & Neural Intelligence",
    tagline: "Adaptive AI Models & Workspaces",
  },
  {
    id: 2,
    url: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=2000&q=80",
    gradient: "from-purple-600/30 via-sky-900/40 to-blue-600/20",
    lightGradient: "from-purple-200/50 via-sky-100/60 to-blue-200/40",
    title: "Global Mesh & Autonomous Agents",
    tagline: "Local & Cloud Autonomous Execution",
  },
  {
    id: 3,
    url: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=2000&q=80",
    gradient: "from-cyan-600/30 via-teal-900/40 to-indigo-600/20",
    lightGradient: "from-cyan-200/50 via-teal-100/60 to-indigo-200/40",
    title: "Cyber Automation & Deep Research",
    tagline: "Live Synthesis & Web Intelligence",
  },
  {
    id: 4,
    url: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=2000&q=80",
    gradient: "from-emerald-600/30 via-blue-900/40 to-violet-600/20",
    lightGradient: "from-emerald-200/50 via-blue-100/60 to-violet-200/40",
    title: "High Performance Engine",
    tagline: "Zero Vendor Lock-in & Privacy First",
  },
];

export function HeroBackgroundSlider({
  currentIndex,
}: {
  currentIndex: number;
}) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {/* Animated Slides with double layer: Instant CSS mesh gradient + Unsplash imagery */}
      {HERO_SLIDES.map((slide, index) => {
        const isActive = index === currentIndex;
        return (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-all duration-1000 ease-in-out ${
              isActive
                ? "opacity-100 scale-105"
                : "opacity-0 scale-100"
            }`}
            style={{ willChange: "opacity, transform" }}
          >
            {/* Instant CSS gradient layer */}
            <div
              className={`absolute inset-0 bg-gradient-to-br transition-all duration-1000 ${slide.gradient}`}
            />

            {/* Background image layer */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slide.url}
              alt={slide.title}
              className="h-full w-full object-cover object-center filter brightness-90 saturate-125 transition-transform duration-7000 ease-out opacity-70"
            />
          </div>
        );
      })}

      {/* Dynamic Contrast Vignette Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/40 to-background" />

      {/* Grid line overlay */}
      <div className="absolute inset-0 grid-bg grid-fade opacity-25 mix-blend-overlay" />
    </div>
  );
}

export function HeroSideNavButtons({
  onNext,
  onPrev,
  currentIndex,
}: {
  onNext: () => void;
  onPrev: () => void;
  currentIndex: number;
}) {
  return (
    <>
      {/* Previous Slide Button */}
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous background image"
        title="Previous background image"
        className="absolute left-3 sm:left-6 lg:left-10 top-1/2 -translate-y-1/2 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-2/80 backdrop-blur-md text-foreground transition-all duration-300 hover:bg-primary/20 hover:border-primary/60 hover:text-primary hover:scale-110 active:scale-95 shadow-lift cursor-pointer"
      >
        <ChevronLeftIcon className="h-6 w-6" />
      </button>

      {/* Next Slide Button */}
      <button
        type="button"
        onClick={onNext}
        aria-label="Next background image"
        title="Next background image"
        className="absolute right-3 sm:right-6 lg:right-10 top-1/2 -translate-y-1/2 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-primary/50 bg-primary/20 backdrop-blur-md text-primary transition-all duration-300 hover:bg-primary hover:text-primary-foreground hover:scale-110 active:scale-95 shadow-glow cursor-pointer"
      >
        <ChevronRightIcon className="h-6 w-6" />
      </button>

      {/* Active Slide Indicator Dots */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-1.5 rounded-full border border-border bg-surface/80 backdrop-blur-md shadow-lift">
        {HERO_SLIDES.map((_, i) => (
          <span
            key={i}
            className={`h-2.5 rounded-full transition-all duration-500 ${
              i === currentIndex
                ? "w-7 bg-primary shadow-glow"
                : "w-2.5 bg-muted-foreground/40"
            }`}
          />
        ))}
      </div>
    </>
  );
}

