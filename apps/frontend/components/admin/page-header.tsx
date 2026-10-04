export function AdminPageHeader({
  eyebrow,
  title,
  description,
  meta,
}: {
  eyebrow: string;
  title: string;
  description: string;
  meta?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border pb-5">
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-medium tracking-[0.18em] text-primary uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-[1.65rem] leading-tight font-semibold tracking-[-0.03em] text-foreground">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-pretty text-muted-foreground">
          {description}
        </p>
      </div>
      {meta ? <div className="flex shrink-0 items-center gap-2">{meta}</div> : null}
    </header>
  );
}