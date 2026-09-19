"use client";

import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { SkeletonTextRow } from "@/components/ui/skeleton";
import { AlertTriangleIcon, ChatIcon, CpuIcon, ImageIcon, SearchIcon, SparklesIcon, VideoIcon } from "@/components/ui/icons";
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

  return (
    <Card>
      <CardHeader
        title="AI capabilities"
        subtitle="What ISOBASH can actually do with the providers configured right now."
        icon={<CpuIcon className="h-4 w-4" />}
      />
      <CardBody>
        {error ? (
          <div className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/5 p-4">
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : !capabilities ? (
          <div className="divide-y divide-foreground/5">
            <SkeletonTextRow />
            <SkeletonTextRow />
            <SkeletonTextRow />
            <SkeletonTextRow />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {capabilities.map((capability) => {
              const meta = capabilityMeta[capability.capability] ?? {
                label: capability.capability.replace(/-/g, " "),
                icon: <CpuIcon className="h-4 w-4" />,
              };
              const available = capability.status === "available";
              return (
                <div
                  key={capability.capability}
                  className="flex items-start justify-between gap-3 rounded-xl border border-foreground/10 p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-foreground/5 text-muted-foreground">
                      {meta.icon}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{meta.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {available
                          ? `Available — ${capability.providers.join(", ")}`
                          : capability.detail}
                      </p>
                    </div>
                  </div>
                  <StatusChip tone={available ? "success" : "neutral"} label={available ? "ready" : "off"} />
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}