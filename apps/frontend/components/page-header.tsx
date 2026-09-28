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
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="font-mono text-[10.5px] font-medium tracking-[0.22em] text-primary uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.035em] text-balance sm:text-[2.35rem]">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-[14.5px] leading-7 text-pretty text-muted-foreground">
          {description}
        </p>
      </div>
      {status ? (
        <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5 font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          {status}
        </span>
      ) : null}
    </header>
  );
}
