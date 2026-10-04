import type { ComponentProps, ReactNode } from "react";
import { AlertTriangleIcon, CheckIcon, RefreshIcon } from "@/components/ui/icons";

/**
 * Admin console primitives.
 *
 * The admin surface is a console, not a marketing page: the job here is to make a
 * dense amount of real state legible. So these deliberately drop the soft, glowing
 * treatment the workspace cards use — flat surfaces, hairline rules, a tighter
 * radius, one accent, and numbers set in tabular figures so columns line up and a
 * change in a count is visible at a glance.
 *
 * Everything resolves through the shared tokens in `app/globals.css`; no raw hex.
 */

/** Panel: the single container the whole console is built from. */
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-border bg-surface ${className}`}
    >
      {children}
    </section>
  );
}

/**
 * Panel header. `meta` is the right-hand slot and stays on one baseline with the
 * title even when it wraps, because the title column is `min-w-0` and truncates.
 */
export function PanelHeader({
  title,
  description,
  meta,
  icon,
  className = "",
}: {
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-border px-5 py-4 ${className}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-xl text-[12.5px] leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {meta ? <div className="flex shrink-0 items-center gap-2">{meta}</div> : null}
    </header>
  );
}

export function PanelBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

export function PanelFooter({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <footer className={`border-t border-border px-5 py-3 ${className}`}>{children}</footer>
  );
}

/** Mono micro-label. The console's only "display" type, so hierarchy stays flat. */
export function SectionLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`font-mono text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase ${className}`}
    >
      {children}
    </p>
  );
}

export type MetricSpec = {
  key: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** For values that are a verdict rather than a count (`0` admins is a warning). */
  tone?: "neutral" | "primary" | "success" | "warning" | "danger";
};

const metricValueTone: Record<NonNullable<MetricSpec["tone"]>, string> = {
  neutral: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

const metricColumns = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
} as const;

/**
 * Metrics divided by hairlines instead of boxed one by one. The `gap-px` over a
 * border-coloured background is the separator, so there is no double rule at the
 * intersections and no stray edge on the last column: a grid of bordered tiles
 * reads as a pile of cards, while this reads as one table of numbers, which is
 * what it is.
 */
export function MetricGrid({
  metrics,
  columns = 3,
  className = "",
}: {
  metrics: MetricSpec[];
  columns?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}) {
  return (
    <dl className={`grid gap-px bg-border ${metricColumns[columns]} ${className}`}>
      {metrics.map((metric) => (
        <div key={metric.key} className="min-w-0 bg-surface px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            {metric.icon ? <span className="shrink-0">{metric.icon}</span> : null}
            <span className="truncate text-[11.5px] leading-4">{metric.label}</span>
          </div>
          <p
            className={`mt-1.5 font-mono text-[22px] leading-7 font-medium tabular-nums tracking-[-0.02em] ${
              metricValueTone[metric.tone ?? "neutral"]
            }`}
          >
            {metric.value}
          </p>
          {metric.hint ? (
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{metric.hint}</p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

/** Definition row for configuration values: label left, monospace value right. */
export function KeyValue({
  label,
  value,
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 border-b border-border/70 py-2 last:border-b-0 ${className}`}
    >
      <dt className="shrink-0 text-[12px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-[12px] text-foreground">
        {value}
      </dd>
    </div>
  );
}

export function KeyValueList({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <dl className={`min-w-0 ${className}`}>{children}</dl>;
}

/** Inline result banner. Sits inside a panel, never floats over the page. */
export function Notice({
  tone,
  children,
  className = "",
}: {
  tone: "success" | "danger" | "warning" | "info";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    success: "border-success/25 bg-success/[0.06] text-foreground",
    danger: "border-danger/30 bg-danger/[0.07] text-foreground",
    warning: "border-warning/30 bg-warning/[0.07] text-foreground",
    info: "border-border bg-surface-2 text-foreground",
  } as const;

  const Icon = tone === "success" ? CheckIcon : AlertTriangleIcon;
  const iconTone = {
    success: "text-success",
    danger: "text-danger",
    warning: "text-warning",
    info: "text-muted-foreground",
  }[tone];

  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[12.5px] leading-5 ${tones[tone]} ${className}`}
    >
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${iconTone}`} />
      <p className="min-w-0 break-words">{children}</p>
    </div>
  );
}

/** Toolbar: filters and actions in one row, wrapping rather than overflowing. */
export function Toolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-end gap-2 ${className}`}>{children}</div>
  );
}

export const Th = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <th
    scope="col"
    className={`px-3 py-2 text-left font-mono text-[10px] font-medium tracking-[0.14em] whitespace-nowrap text-muted-foreground uppercase ${className}`}
  >
    {children}
  </th>
);

export const Td = ({
  children,
  title,
  className = "",
}: {
  children: ReactNode;
  /** Full value for a cell that truncates visually. */
  title?: string;
  className?: string;
}) => (
  <td title={title} className={`px-3 py-2.5 align-middle text-[12.5px] ${className}`}>
    {children}
  </td>
);

export const Tr = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <tr className={`border-b border-border/60 last:border-b-0 ${className}`}>{children}</tr>
);

/** Table shell: scrolls horizontally on small screens instead of squashing columns. */
export function TableWrap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`-mx-5 overflow-x-auto px-5 ${className}`}>
      <table className="w-full min-w-[760px] border-collapse">{children}</table>
    </div>
  );
}

/**
 * Console output block. `tone` follows the command result, not the request, so a
 * failure is obvious in a screenshot without reading the text.
 */
export function Console({
  command,
  tone,
  lines,
  className = "",
}: {
  command: string;
  tone: "ok" | "failed" | "blocked";
  lines: string;
  className?: string;
}) {
  const accent = {
    ok: "bg-success",
    failed: "bg-danger",
    blocked: "bg-warning",
  }[tone];

  return (
    <div className={`overflow-hidden rounded-lg border border-border bg-background ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-3 py-2">
        <span className="flex min-w-0 items-center gap-2 font-mono text-[11.5px] text-foreground">
          <span aria-hidden="true" className={`h-3.5 w-[2px] shrink-0 rounded-full ${accent}`} />
          <span className="truncate">{command}</span>
        </span>
        <span
          className={`font-mono text-[10px] tracking-[0.14em] uppercase ${
            tone === "ok" ? "text-success" : tone === "blocked" ? "text-warning" : "text-danger"
          }`}
        >
          {tone}
        </span>
      </div>
      <pre className="max-h-72 overflow-auto px-3 py-2.5 font-mono text-[11.5px] leading-[1.7] whitespace-pre-wrap text-foreground">
        {lines || "No output."}
      </pre>
    </div>
  );
}

/** Empty state: says what is missing and never implies the data is loading. */
export function EmptyState({
  title,
  description,
  className = "",
}: {
  title: string;
  description: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-dashed border-border px-5 py-8 text-center ${className}`}>
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

/**
 * Row action. Borderless and quiet by default, so a directory row shows three
 * affordances without three boxes competing with the data; `tone` is only set
 * where the action is destructive.
 */
export function ActionButton({
  tone = "neutral",
  icon,
  children,
  className = "",
  ...props
}: {
  tone?: "neutral" | "danger";
  icon?: ReactNode;
} & ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-45 ${
        tone === "danger"
          ? "text-muted-foreground hover:bg-danger/10 hover:text-danger"
          : "text-muted-foreground hover:bg-surface-3 hover:text-foreground"
      } ${className}`}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      {children}
    </button>
  );
}

/** Refresh control shared by every panel that reads live state. */
export function RefreshButton({
  busy,
  onClick,
  children = "Refresh",
}: {
  busy?: boolean;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <ActionButton
      onClick={onClick}
      disabled={busy}
      icon={<RefreshIcon className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />}
    >
      {children}
    </ActionButton>
  );
}