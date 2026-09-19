"use client";

import { AlertTriangleIcon } from "@/components/ui/icons";

export function RouteError({
  error,
  retry,
  label = "This section failed to render.",
}: {
  error: Error & { digest?: string };
  retry: () => void;
  label?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl border border-danger/25 bg-danger/5 p-8">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-danger/15 text-danger">
        <AlertTriangleIcon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{label}</h2>
        <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted-foreground">
          {error.message || "An unexpected error occurred while rendering this page."}
          {error.digest ? ` (digest: ${error.digest})` : ""}
        </p>
      </div>
      <button
        onClick={retry}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
      >
        Try again
      </button>
    </div>
  );
}