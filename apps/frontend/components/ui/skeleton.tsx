import type { ReactNode } from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden rounded-lg bg-foreground/[0.07] ${className}`}
    >
      <div className="absolute inset-0 -translate-x-full animate-pulse bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent motion-reduce:animate-none" />
    </div>
  );
}

export function SkeletonTextRow({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className={index === 0 ? "h-3.5 w-2/5" : "h-3 w-4/5"} />
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 4, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-3.5">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 6, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`grid gap-5 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="edge-light rounded-2xl border border-border bg-surface p-6 shadow-soft">
          <Skeleton className="h-11 w-11 rounded-xl" />
          <Skeleton className="mt-5 h-4 w-2/5" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonHeader({ className = "" }: { className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      <Skeleton className="h-2.5 w-16" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-3.5 w-full max-w-xl" />
    </div>
  );
}

export function SkeletonPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`edge-light rounded-2xl border border-border bg-surface p-5 shadow-soft ${className}`}>
      {children}
    </div>
  );
}
