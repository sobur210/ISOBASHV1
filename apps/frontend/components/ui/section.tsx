import type { ReactNode } from "react";

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={`inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary-soft px-3 py-1.5 font-mono text-[10.5px] font-semibold tracking-[0.2em] text-primary uppercase ${className}`}
    >
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = "center",
  className = "",
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  const alignment = align === "center" ? "mx-auto items-center text-center" : "items-start text-left";
  return (
    <div className={`flex max-w-2xl flex-col ${alignment} ${className}`}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2
        className={`mt-5 text-3xl font-bold tracking-[-0.035em] text-balance sm:text-[2.6rem] sm:leading-[1.08] ${className ? "" : "text-foreground"}`}
      >
        {title}
      </h2>
      {lede ? (
        <p className="mt-5 max-w-xl text-[15px] leading-7 text-pretty text-muted-foreground">{lede}</p>
      ) : null}
    </div>
  );
}

export function Section({
  id,
  className = "",
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`relative scroll-mt-24 ${className}`}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );
}
