import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { ChatIcon, SparklesIcon } from "@/components/ui/icons";

export default function ChatPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Chat"
        title="Conversations"
        description="A route boundary for real AI conversations and streaming responses across providers and models."
        status="Phase 10"
      />
      <PlaceholderCard
        icon={<ChatIcon className="h-5 w-5" />}
        title="No conversations yet"
        description="Real conversations with persisted history, streaming, and model routing arrive in the chat phase. No fake responses are rendered at this stage."
        feature="Integrated in Phase 10 — AI engine"
      />
      <PlaceholderCard
        icon={<SparklesIcon className="h-5 w-5" />}
        title="Provider-agnostic responses"
        description="Responses will route through the AI engine currently running locally on Ollama, with cloud adapters added as providers are configured."
        feature="Phase 2 bridge already live"
      />
    </div>
  );
}