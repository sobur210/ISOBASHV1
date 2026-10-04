import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="space-y-7">
      <div className="space-y-2 border-b border-border pb-5">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3.5 w-full max-w-2xl" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-2.5 w-16" />
        <div className="grid gap-5 xl:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="border-b border-border px-5 py-4">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="mt-2 h-3 w-56" />
              </div>
              <div className="divide-y divide-border">
                {Array.from({ length: 4 }).map((__, row) => (
                  <div key={row} className="flex items-center gap-3 px-5 py-3">
                    <Skeleton className="h-4 w-4 rounded-md" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-2.5 w-16" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="space-y-3 rounded-xl border border-border bg-surface p-5">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}