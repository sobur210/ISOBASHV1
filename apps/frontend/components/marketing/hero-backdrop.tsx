"use client";

/**
 * Hero backdrop for the marketing hero.
 *
 * A five-state slideshow. One state is the structural composition - a clean
 * vertical wash, a pale-blue atmospheric glow along the lower third, a masked
 * blueprint grid, floating glass panels, thin interface hairlines growing in
 * from the left and right edges, an angled developer panel bottom-left and
 * abstract glass/circuitry bottom-right. The other four are the photographic
 * atmospheres, cross-faded on a slow drift.
 *
 * Deliberately absent: any AI badge, chip, floating logo card or standalone
 * emblem in the lower right.
 *
 * The photography is local (`/hero/*.jpg`) rather than hot-linked, and every
 * wash resolves through a design token so the same geometry reads
 * white/pale-blue in light mode and deep navy with blue glow in dark mode.
 * The per-slide scrim and the centre veil are what keep the headline
 * measurable against any frame in the rotation.
 */

type Slide = {
  id: string;
  /** Absent on the composition slide, which is drawn from tokens alone. */
  src?: string;
  alt: string;
};

export const HERO_SLIDES: Slide[] = [
  { id: "composition", alt: "ISOBASH workspace" },
  { id: "neural", src: "/hero/hero-neural.jpg", alt: "Fluid neural field" },
  { id: "mesh", src: "/hero/hero-mesh.jpg", alt: "Global mesh network" },
  { id: "matrix", src: "/hero/hero-matrix.jpg", alt: "Code and data matrix" },
  { id: "engine", src: "/hero/hero-engine.jpg", alt: "High performance engine" },
];

const HAIRLINES = [
  { side: "left", top: "30%", width: "30%" },
  { side: "right", top: "24%", width: "26%" },
  { side: "left", top: "72%", width: "22%" },
  { side: "right", top: "64%", width: "32%" },
] as const;

/** Monospace "token" bars for the developer panel. Widths are percentages. */
const CODE_ROWS = [
  { indent: 0, width: 38, tone: "primary" },
  { indent: 12, width: 26, tone: "muted" },
  { indent: 12, width: 44, tone: "accent" },
  { indent: 24, width: 32, tone: "muted" },
  { indent: 12, width: 20, tone: "violet" },
  { indent: 0, width: 30, tone: "muted" },
  { indent: 12, width: 42, tone: "primary" },
  { indent: 24, width: 24, tone: "muted" },
  { indent: 12, width: 36, tone: "accent" },
] as const;

const TONE: Record<(typeof CODE_ROWS)[number]["tone"], string> = {
  primary: "var(--primary)",
  accent: "var(--accent)",
  violet: "var(--violet)",
  muted: "color-mix(in srgb, var(--muted-foreground) 34%, transparent)",
};

/** Abstract traces for the lower-right circuitry. No emblem, no badge. */
const TRACES = [
  "M120 300 H300 L360 240 H520",
  "M120 340 H260 L320 400 H470 L520 350 H640",
  "M120 220 H220 L280 160 H430",
  "M420 300 V200 L480 140 H600",
  "M470 400 V440 H610",
] as const;

function DeveloperPanel() {
  return (
    <div
      className="absolute -bottom-24 -left-28 w-[540px] max-w-[68vw]"
      style={{
        transform: "perspective(1600px) rotateY(17deg) rotateX(4deg)",
        transformOrigin: "left bottom",
      }}
    >
      {/* Blue illumination spilling from the panel. */}
      <div
        className="animate-float-slow absolute -inset-16 -z-10"
        style={{
          background:
            "radial-gradient(60% 60% at 30% 60%, color-mix(in srgb, var(--primary) 26%, transparent) 0%, transparent 70%)",
        }}
      />
      <div className="glass overflow-hidden rounded-2xl shadow-deep">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="h-2 w-2 rounded-full bg-primary/60" />
          <span className="h-2 w-2 rounded-full bg-accent/50" />
          <span className="h-2 w-2 rounded-full bg-violet/40" />
          <span className="ml-3 h-1.5 w-24 rounded-full bg-muted-foreground/20" />
        </div>
        <div className="flex flex-col gap-2.5 px-5 py-5">
          {CODE_ROWS.map((row, index) => (
            <div
              key={index}
              className="flex items-center"
              style={{ paddingLeft: `${row.indent}%` }}
            >
              <span
                className="h-2 rounded-full"
                style={{
                  width: `${row.width}%`,
                  backgroundColor: TONE[row.tone],
                  opacity: 0.75,
                }}
              />
            </div>
          ))}
        </div>
        <div
          className="h-16"
          style={{
            background:
              "linear-gradient(180deg, transparent, color-mix(in srgb, var(--primary) 18%, transparent))",
          }}
        />
      </div>
    </div>
  );
}

function Circuitry() {
  return (
    <svg
      viewBox="0 0 760 520"
      className="absolute -right-16 bottom-[-6%] h-auto w-[760px] max-w-[62vw] opacity-70"
      fill="none"
      aria-hidden="true"
    >
      {/* Soft halo pass, then the crisp pass on top: a cheap, filter-free glow. */}
      <g stroke="var(--primary)" strokeOpacity="0.18" strokeWidth="7" strokeLinecap="round">
        {TRACES.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g stroke="var(--primary)" strokeOpacity="0.75" strokeWidth="1.4" strokeLinecap="round">
        {TRACES.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g fill="var(--accent)" fillOpacity="0.9">
        <circle cx="360" cy="240" r="3.5" />
        <circle cx="520" cy="350" r="3.5" />
        <circle cx="280" cy="160" r="3" />
        <circle cx="480" cy="140" r="3" />
      </g>
      <g fill="var(--primary)" fillOpacity="0.55">
        <circle cx="300" cy="300" r="4" />
        <circle cx="320" cy="400" r="4" />
        <circle cx="220" cy="220" r="3" />
        <circle cx="470" cy="400" r="3" />
      </g>
    </svg>
  );
}

function GlassPanel({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`glass rounded-[2rem] ${className ?? ""}`}
      style={{ ...style, boxShadow: "0 40px 90px -50px rgb(var(--shadow-rgb) / 0.9)" }}
    />
  );
}

/** Atmospheric glow and blueprint grid: present on every slide. */
function CommonAtmosphere() {
  return (
    <>
      <div
        className="grid-bg absolute inset-0 opacity-40"
        style={{
          maskImage: "radial-gradient(ellipse 92% 70% at 50% 46%, transparent 34%, #000 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 92% 70% at 50% 46%, transparent 34%, #000 100%)",
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-full"
        style={{
          background:
            "radial-gradient(58% 52% at 50% 44%, color-mix(in srgb, var(--background) 88%, transparent) 0%, transparent 78%)",
        }}
      />
    </>
  );
}

/** The token-drawn composition: the "one there now", kept as slide zero. */
function CompositionSlide({ active }: { active: boolean }) {
  return (
    <div
      className={`absolute inset-0 transition-opacity duration-[1400ms] ease-in-out ${
        active ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-surface" />

      {/* Atmospheric glow hugging the lower portion of the hero. */}
      <div
        className="animate-float-slow absolute inset-x-0 bottom-0 h-[72%]"
        style={{
          background:
            "radial-gradient(72% 100% at 50% 104%, color-mix(in srgb, var(--primary) 22%, transparent) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[58%]"
        style={{
          background:
            "radial-gradient(58% 92% at 76% 106%, color-mix(in srgb, var(--accent) 18%, transparent) 0%, transparent 72%)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[48%]"
        style={{
          background:
            "radial-gradient(52% 88% at 20% 108%, color-mix(in srgb, var(--primary) 14%, transparent) 0%, transparent 74%)",
        }}
      />

      <CommonAtmosphere />

      {/* Architectural glass panels pushing in from the edges. */}
      <GlassPanel className="absolute -left-24 top-[8%] h-[38%] w-[30%] rotate-[-8deg] opacity-60" />
      <GlassPanel className="absolute -right-28 top-[4%] h-[34%] w-[26%] rotate-[10deg] opacity-55" />
      <GlassPanel className="absolute -left-16 bottom-[18%] h-[30%] w-[20%] rotate-[6deg] opacity-45" />

      {/* Thin futuristic interface lines emerging from the left and right edges. */}
      {HAIRLINES.map((line) => (
        <div
          key={`${line.side}-${line.top}`}
          className="absolute h-px"
          style={{
            [line.side]: 0,
            top: line.top,
            width: line.width,
            background:
              line.side === "left"
                ? "linear-gradient(90deg, color-mix(in srgb, var(--primary) 60%, transparent), transparent)"
                : "linear-gradient(270deg, color-mix(in srgb, var(--primary) 60%, transparent), transparent)",
          }}
        />
      ))}

      {/* Light trails across the lower band. */}
      <div
        className="absolute -bottom-24 left-[18%] h-56 w-[46%] rotate-[-6deg] opacity-50"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in srgb, var(--primary) 22%, transparent), transparent)",
          filter: "blur(28px)",
        }}
      />
      <div
        className="absolute -bottom-32 right-[8%] h-48 w-[40%] rotate-[4deg] opacity-40"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 24%, transparent), transparent)",
          filter: "blur(34px)",
        }}
      />

      <DeveloperPanel />
      <Circuitry />
    </div>
  );
}

/**
 * A photographic atmosphere. Two washes rather than a `brightness` cut: a
 * `background`-token scrim to sit the photo in the current theme, and an
 * edge-darkening pass so the open sides stay readable.
 */
function PhotoSlide({
  slide,
  active,
}: {
  slide: Slide;
  active: boolean;
}) {
  if (!slide.src) return null;
  return (
    <div
      className={`absolute inset-0 transition-opacity duration-[1400ms] ease-in-out ${
        active ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={slide.src}
        alt={slide.alt}
        className="hero-drift h-full w-full object-cover object-center"
        loading="lazy"
        decoding="async"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--background) 82%, transparent) 0%, color-mix(in srgb, var(--background) 52%, transparent) 45%, color-mix(in srgb, var(--background) 88%, transparent) 100%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, color-mix(in srgb, var(--background) 70%, transparent) 0%, transparent 28%, transparent 72%, color-mix(in srgb, var(--background) 70%, transparent) 100%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 46% at 50% 100%, color-mix(in srgb, var(--primary) 20%, transparent) 0%, transparent 72%)",
        }}
      />
      <CommonAtmosphere />
    </div>
  );
}

export function HeroBackdrop({ currentIndex }: { currentIndex: number }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
    >
      {/* Ken Burns for the photo frames. Declared locally because
       * app/globals.css is the untouched token source of truth and has no
       * drift keyframes; style-src allows 'unsafe-inline'. */}
      <style>{`
        @keyframes hero-drift {
          from { transform: scale(1.04) translate3d(0, 0, 0); }
          to   { transform: scale(1.14) translate3d(-1.5%, -1%, 0); }
        }
        .hero-drift { animation: hero-drift 24s ease-in-out infinite alternate; }
        @media (prefers-reduced-motion: reduce) {
          .hero-drift { animation: none; transform: scale(1.06); }
        }
      `}</style>

      {/* Base wash sits under every slide so a cross-fade never flashes the page. */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-surface" />

      {HERO_SLIDES.map((slide, index) =>
        slide.src ? (
          <PhotoSlide key={slide.id} slide={slide} active={index === currentIndex} />
        ) : (
          <CompositionSlide key={slide.id} active={index === currentIndex} />
        ),
      )}
    </div>
  );
}

/** Discreet position readout for the rotation. */
export function HeroSlideDots({ currentIndex }: { currentIndex: number }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex items-center justify-center gap-2">
      {HERO_SLIDES.map((slide, index) => (
        <span
          key={slide.id}
          className={`h-1.5 rounded-full transition-all duration-500 ${
            index === currentIndex ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/35"
          }`}
        />
      ))}
    </div>
  );
}