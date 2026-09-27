import { BrandLogo } from "@/components/brand-logo";
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
  {
    title: "Chat",
    description: "Get answers, brainstorm and solve problems",
    icon: <ChatIcon className="h-4 w-4" />,
  },
  {
    title: "Generate Image",
    description: "Create stunning visuals with AI",
    icon: <ImageIcon className="h-4 w-4" />,
  },
  {
    title: "Generate Video",
    description: "Turn ideas into videos with AI",
    icon: <VideoIcon className="h-4 w-4" />,
  },
  {
    title: "Research",
    description: "Find information with real sources",
    icon: <SearchIcon className="h-4 w-4" />,
  },
  {
    title: "Upload Files",
    description: "Analyze your documents and data",
    icon: <FileIcon className="h-4 w-4" />,
  },
  {
    title: "Create Agent",
    description: "Build your own AI assistant",
    icon: <BotIcon className="h-4 w-4" />,
  },
];

export function DashboardPreview() {
  return (
    <div className="w-full overflow-hidden rounded-[26px] border border-[#3B82F6]/25 bg-[#0B1220]/85 shadow-[0_40px_120px_-20px_rgba(59,130,246,0.45)] backdrop-blur-2xl">
      <div className="flex h-11 items-center justify-between border-b border-white/[0.06] px-4">
        <div className="flex items-center gap-2">
          <BrandLogo className="h-4 w-auto brightness-0 invert" />
          <span className="font-mono text-[10px] font-bold tracking-[0.3em] text-slate-300">ISOBASH</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/10 text-slate-400">
            <GridIcon className="h-3 w-3" />
          </span>
          <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/10 text-slate-400">
            <SearchIcon className="h-3 w-3" />
          </span>
          <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/10 text-slate-400">
            <BellIcon className="h-3 w-3" />
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[164px_1fr]">
        <nav className="hidden flex-col gap-0.5 border-r border-white/[0.06] p-3 sm:flex">
          {sidebar.map((item) => (
            <span
              key={item.label}
              className={
                item.active
                  ? "flex items-center gap-2.5 rounded-lg bg-[#3B82F6]/15 px-2.5 py-2 text-[11.5px] font-medium text-[#60A5FA]"
                  : "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[11.5px] font-medium text-slate-400"
              }
            >
              {item.icon}
              {item.label}
            </span>
          ))}
        </nav>

        <div className="p-4 sm:p-5">
          <p className="text-[15px] font-semibold text-white">Good morning, Alex</p>
          <p className="mt-1 text-[11.5px] text-slate-400">What would you like to create today?</p>

          <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
            <span className="flex-1 text-[12px] text-slate-500">Tell me what you want to create...</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#3B82F6] text-white">
              <SendIcon className="h-3 w-3" />
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
            {cards.map((card) => (
              <div
                key={card.title}
                className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 transition-colors hover:border-[#3B82F6]/30"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#3B82F6]/12 text-[#60A5FA]">
                  {card.icon}
                </span>
                <p className="mt-2.5 text-[11.5px] font-semibold text-white">{card.title}</p>
                <p className="mt-1 text-[10.5px] leading-4 text-slate-500">{card.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
