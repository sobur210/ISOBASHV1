"use client";

import { AlertTriangleIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

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
    <div className="edge-light flex flex-col items-start gap-5 rounded-2xl border border-danger/25 bg-danger/5 p-8">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-danger/25 bg-danger/10 text-danger">
        <AlertTriangleIcon className="h-5 w-5" />
      </span>
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">{label}</h2>
        <p className="mt-2 max-w-xl text-[13.5px] leading-6 text-muted-foreground">
          {error.message || "An unexpected error occurred while rendering this page."}
          {error.digest ? ` (digest: ${error.digest})` : ""}
        </p>
      </div>
      <Button onClick={retry}>Try again</Button>
    </div>
  );
}
