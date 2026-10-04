export function PageHeader({
  eyebrow,
  title,
  description,
  status,
}: {
  eyebrow: string;
  title: string;
  description: string;
  status?: string;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border pb-5">
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-medium tracking-[0.18em] text-primary uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-[1.65rem] leading-tight font-semibold tracking-[-0.03em] text-balance text-foreground">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-pretty text-muted-foreground">
          {description}
        </p>
      </div>
      {status ? (
        <span className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
          {status}
        </span>
      ) : null}
    </header>
  );
}

/** Section rule inside a page: a small heading that owns the block beneath it. */
export function PageSection({
  id,
  title,
  meta,
  children,
  className = "",
}: {
  id?: string;
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id={id}
          className="font-mono text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase"
        >
          {title}
        </h2>
        {meta ? <span className="font-mono text-[11px] text-muted-foreground">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}