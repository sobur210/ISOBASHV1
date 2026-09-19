"use client";

import { useEffect } from "react";
import { RouteError } from "@/components/route-error";

export default function WorkspaceError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <RouteError error={error} retry={retry} label="The workspace could not be displayed." />;
}