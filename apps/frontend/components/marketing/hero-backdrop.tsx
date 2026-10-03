/**
 * Hero backdrop for the marketing hero.
 *
 * Composition only: a clean vertical wash, a pale-blue atmospheric glow along
 * the lower third, blueprint grid, thin interface hairlines that grow in from
 * the left and right edges, floating glass panels, an angled developer panel
 * in the lower left and abstract glass/circuitry structures in the lower
 * right. The centre is kept clear so the headline stays dominant.
 *
 * Every colour resolves through a design token, so the same geometry renders
 * as white/pale-blue in light mode and deep navy with blue glow in dark mode.
 * The centre veil is what guarantees the headline contrast in either theme.
 */

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

function GlassPanel({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`glass rounded-[2rem] ${className ?? ""}`}
      style={{ ...style, boxShadow: "0 40px 90px -50px rgb(var(--shadow-rgb) / 0.9)" }}
    />
  );
}

export function HeroBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
    >
      {/* Base wash: page background bleeding into the surface tone at the foot. */}
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

      {/* Blueprint grid, strongest at the edges so the middle stays quiet. */}
      <div
        className="grid-bg absolute inset-0 opacity-40"
        style={{
          maskImage: "radial-gradient(ellipse 92% 70% at 50% 46%, transparent 34%, #000 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 92% 70% at 50% 46%, transparent 34%, #000 100%)",
        }}
      />

      {/* Architectural glass panels pushing in from the edges. */}
      <GlassPanel
        className="absolute -left-24 top-[8%] h-[38%] w-[30%] rotate-[-8deg] opacity-60"
      />
      <GlassPanel
        className="absolute -right-28 top-[4%] h-[34%] w-[26%] rotate-[10deg] opacity-55"
      />
      <GlassPanel
        className="absolute -left-16 bottom-[18%] h-[30%] w-[20%] rotate-[6deg] opacity-45"
      />

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

      {/* Centre veil. Guarantees the headline keeps its contrast against any of
          the structures above, without dimming the edges. */}
      <div
        className="absolute inset-x-0 top-0 h-full"
        style={{
          background:
            "radial-gradient(58% 52% at 50% 44%, color-mix(in srgb, var(--background) 88%, transparent) 0%, transparent 78%)",
        }}
      />
    </div>
  );
}