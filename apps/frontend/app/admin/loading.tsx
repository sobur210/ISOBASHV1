import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 border-b border-border pb-5">
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3.5 w-full max-w-2xl" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-5 py-4">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="mt-2 h-3 w-64" />
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="bg-surface px-4 py-4">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="mt-2.5 h-6 w-12" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-xl border border-border bg-surface p-5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}