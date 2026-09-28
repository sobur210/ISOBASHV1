import {
  BellIcon,
  BotIcon,
  ChatIcon,
  FileIcon,
  FolderIcon,
  GridIcon,
  HomeIcon,
  ImageIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  VideoIcon,
} from "@/components/ui/icons";

const sidebar = [
  { label: "Home", icon: <HomeIcon className="h-3.5 w-3.5" />, active: true },
  { label: "Chat", icon: <ChatIcon className="h-3.5 w-3.5" /> },
  { label: "Agents", icon: <BotIcon className="h-3.5 w-3.5" /> },
  { label: "Image Generation", icon: <ImageIcon className="h-3.5 w-3.5" /> },
  { label: "Video Generation", icon: <VideoIcon className="h-3.5 w-3.5" /> },
  { label: "Research", icon: <SearchIcon className="h-3.5 w-3.5" /> },
  { label: "Files", icon: <FileIcon className="h-3.5 w-3.5" /> },
  { label: "Projects", icon: <FolderIcon className="h-3.5 w-3.5" /> },
  { label: "Settings", icon: <SettingsIcon className="h-3.5 w-3.5" /> },
];

const cards = [
  { title: "Chat", description: "Streamed answers, persisted", icon: <ChatIcon className="h-4 w-4" /> },
  { title: "Generate Image", description: "Visuals from a real provider", icon: <ImageIcon className="h-4 w-4" /> },
  { title: "Generate Video", description: "Text and image to video", icon: <VideoIcon className="h-4 w-4" /> },
  { title: "Research", description: "Citations checked at source", icon: <SearchIcon className="h-4 w-4" /> },
  { title: "Upload Files", description: "Parse and index documents", icon: <FileIcon className="h-4 w-4" /> },
  { title: "Create Agent", description: "Your own AI assistant", icon: <BotIcon className="h-4 w-4" /> },
];

export function DashboardPreview() {
  return (
    <div className="edge-light overflow-hidden rounded-[26px] border border-border-strong bg-surface/80 shadow-deep backdrop-blur-2xl">
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-danger/60" />
          <span className="h-2 w-2 rounded-full bg-warning/60" />
          <span className="h-2 w-2 rounded-full bg-success/60" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-border text-muted-foreground">
            <GridIcon className="h-3 w-3" />
          </span>
          <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-border text-muted-foreground">
            <SearchIcon className="h-3 w-3" />
          </span>
          <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-border text-muted-foreground">
            <BellIcon className="h-3 w-3" />
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[168px_1fr]">
        <nav className="hidden flex-col gap-0.5 border-r border-border p-3 sm:flex">
          {sidebar.map((item) => (
            <span
              key={item.label}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[11.5px] font-medium ${
                item.active ? "bg-primary-soft text-primary" : "text-muted-foreground"
              }`}
            >
              {item.icon}
              {item.label}
            </span>
          ))}
        </nav>

        <div className="p-4 sm:p-5">
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">Good morning, Alex</p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">What would you like to create today?</p>

          <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3.5 py-3">
            <span className="flex-1 text-[12px] text-muted-foreground/70">Tell me what you want to create…</span>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-glow">
              <SendIcon className="h-3 w-3" />
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
            {cards.map((card) => (
              <div
                key={card.title}
                className="rounded-xl border border-border bg-surface-2 p-3 transition-colors hover:border-primary/30"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  {card.icon}
                </span>
                <p className="mt-2.5 text-[11.5px] font-semibold text-foreground">{card.title}</p>
                <p className="mt-1 text-[10.5px] leading-4 text-muted-foreground">{card.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
