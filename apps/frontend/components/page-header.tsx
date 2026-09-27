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
      <div>
        <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">{description}</p>
      </div>
      {status && (
        <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          {status}
        </span>
      )}
    </header>
  );
}