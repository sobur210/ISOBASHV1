import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { ImageIcon, VideoIcon } from "@/components/ui/icons";

export default function MediaPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Media"
        title="Media"
        description="A route boundary for real image and video jobs, provider status, moderation, and generated media."
        status="Phase 13 / 14"
      />
      <PlaceholderCard
        icon={<ImageIcon className="h-5 w-5" />}
        title="No media yet"
        description="Image generation, understanding, and editing will run through real provider adapters with generation jobs and history."
        feature="Integrated in Phase 13 — image"
      />
      <PlaceholderCard
        icon={<VideoIcon className="h-5 w-5" />}
        title="Video engine reserved"
        description="Text-to-video, image-to-video, and animation will use queued jobs with real progress against a named cloud provider."
        feature="Integrated in Phase 14 — video"
      />
    </div>
  );
}