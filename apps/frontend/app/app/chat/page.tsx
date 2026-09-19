import { PageHeader } from "@/components/page-header";
import { ChatPanel } from "@/components/chat-panel";

export default function ChatPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Chat"
        title="Conversations"
        description="Real, persisted conversations streamed live from the AI engine. Messages are stored in PostgreSQL, not simulated."
      />
      <ChatPanel />
    </div>
  );
}