"use client";

import { useEffect, useState } from "react";
import { StatusChip } from "@/components/ui/status-chip";
import { Notice, Panel, PanelBody, PanelHeader } from "@/components/admin/ui";
import {
  ChatIcon,
  CpuIcon,
  ImageIcon,
  SearchIcon,
  SparklesIcon,
  VideoIcon,
} from "@/components/ui/icons";
import { SkeletonTextRow } from "@/components/ui/skeleton";
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

/**
 * What ISOBASH can actually do with the providers configured right now. An
 * unavailable capability keeps its row and shows the reason, because "off" and
 * "missing" are different answers and hiding the row would claim the first.
 */
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

  const available = capabilities?.filter((capability) => capability.status === "available").length ?? 0;

  return (
    <Panel>
      <PanelHeader
        title="AI capabilities"
        description="What this deployment can do with the providers configured right now."
        icon={<CpuIcon className="h-4 w-4" />}
        meta={
          capabilities ? (
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {available}/{capabilities.length} ready
            </span>
          ) : null
        }
      />
      <PanelBody className="px-0 py-0">
        {error ? (
          <div className="px-5 py-4">
            <Notice tone="danger">{error}</Notice>
          </div>
        ) : !capabilities ? (
          <div className="grid gap-x-5 gap-y-4 px-5 py-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonTextRow key={index} />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {capabilities.map((capability) => {
              const meta = capabilityMeta[capability.capability] ?? {
                label: capability.capability.replace(/-/g, " "),
                icon: <CpuIcon className="h-4 w-4" />,
              };
              const isAvailable = capability.status === "available";
              return (
                <li
                  key={capability.capability}
                  className="flex items-center justify-between gap-4 px-5 py-2.5 transition-colors hover:bg-surface-2/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`shrink-0 ${isAvailable ? "text-primary" : "text-muted-foreground/60"}`}
                    >
                      {meta.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium text-foreground">{meta.label}</p>
                      <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                        {isAvailable ? capability.providers.join(", ") : capability.detail}
                      </p>
                    </div>
                  </div>
                  <StatusChip
                    tone={isAvailable ? "success" : "neutral"}
                    label={isAvailable ? "ready" : "unavailable"}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </PanelBody>
    </Panel>
  );
}