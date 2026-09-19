"use client";

import { useEffect } from "react";
import { RouteError } from "@/components/route-error";

export default function AdminError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <RouteError error={error} retry={retry} label="The admin console could not be displayed." />;
}