import type { ComponentProps, ReactNode } from "react";

const control =
  "w-full rounded-xl border border-border bg-surface-2 px-4 text-sm text-foreground transition-colors placeholder:text-muted-foreground/70 hover:border-border-strong focus:border-primary/60 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-primary/12 disabled:cursor-not-allowed disabled:opacity-50";

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${control} h-11 ${className}`} />;
}

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${control} resize-none py-3 leading-6 ${className}`} />;
}

export function Select({ className = "", children, ...props }: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={`${control} h-10 cursor-pointer appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9 font-medium capitalize ${className}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238494b4' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        ...props.style,
      }}
    >
      {children}
    </select>
  );
}
