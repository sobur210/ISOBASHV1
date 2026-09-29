import { PageHeader } from "@/components/page-header";
import { MediaPanel } from "@/components/media-panel";

export default function MediaPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Media"
        title="Media"
        description="Images come from a provider that really renders them. A run is reported complete only when the bytes are stored, and a refusal, a quota error or a missing model is shown as the failure it is."
        status="Phase 13 / 14"
      />
      <MediaPanel />
    </div>
  );
}
