"use client";

import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { SkeletonTextRow } from "@/components/ui/skeleton";
import {
  AlertTriangleIcon,
  ChatIcon,
  CpuIcon,
  ImageIcon,
  SearchIcon,
  SparklesIcon,
  VideoIcon,
} from "@/components/ui/icons";
import { getJson } from "@/lib/api";

type CapabilityStatus = {
  capability: string;
  status: "available" | "unavailable";
  providers: string[];
  detail: string;
};

const capabilityMeta: Record<string, { label: string; icon: React.ReactNode }> = {
  language: { label: "Language", icon: <ChatIcon className="h-4 w-4" /> },
  vision: { label: "Vision", icon: <ImageIcon className="h-4 w-4" /> },
  embeddings: { label: "Embeddings", icon: <SparklesIcon className="h-4 w-4" /> },
  "image-generation": { label: "Image generation", icon: <ImageIcon className="h-4 w-4" /> },
  "video-generation": { label: "Video generation", icon: <VideoIcon className="h-4 w-4" /> },
  research: { label: "Web research", icon: <SearchIcon className="h-4 w-4" /> },
};

export function CapabilitiesPanel() {
  const [capabilities, setCapabilities] = useState<CapabilityStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getJson<CapabilityStatus[]>("/ai/capabilities", controller.signal)
      .then((data) => {
        setCapabilities(data);
        setError(null);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "The API is unreachable.");
      });
    return () => controller.abort();
  }, []);

  const available = capabilities?.filter((c) => c.status === "available").length ?? 0;

  return (
    <Card>
      <CardHeader
        title="AI capabilities"
        subtitle="What ISOBASH can actually do with the providers configured right now."
        icon={<CpuIcon className="h-4 w-4" />}
        action={
          capabilities ? (
            <span className="font-mono text-[11px] text-muted-foreground">
              {available}/{capabilities.length} ready
            </span>
          ) : null
        }
      />
      <CardBody className="pt-1">
        {error ? (
          <div className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/5 p-4">
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : !capabilities ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonTextRow key={index} />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {capabilities.map((capability) => {
              const meta = capabilityMeta[capability.capability] ?? {
                label: capability.capability.replace(/-/g, " "),
                icon: <CpuIcon className="h-4 w-4" />,
              };
              const isAvailable = capability.status === "available";
              return (
                <div
                  key={capability.capability}
                  className={`flex items-start justify-between gap-3 rounded-xl border p-4 transition-colors ${
                    isAvailable ? "border-border bg-surface-2" : "border-dashed border-border"
                  }`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        isAvailable ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {meta.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium text-foreground">{meta.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {isAvailable ? capability.providers.join(", ") : capability.detail}
                      </p>
                    </div>
                  </div>
                  <StatusChip tone={isAvailable ? "success" : "neutral"} label={isAvailable ? "ready" : "off"} />
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
