import { BotIcon, ChatIcon, ImageIcon, SearchIcon, VideoIcon } from "@/components/ui/icons";

const items = [
  {
    icon: <ChatIcon className="h-4 w-4" />,
    title: "AI Chat",
    description: "Get instant answers and creative ideas",
  },
  {
    icon: <ImageIcon className="h-4 w-4" />,
    title: "Image Generation",
    description: "Create stunning images in seconds",
  },
  {
    icon: <VideoIcon className="h-4 w-4" />,
    title: "Video Generation",
    description: "Turn your ideas into videos",
  },
  {
    icon: <SearchIcon className="h-4 w-4" />,
    title: "Web Research",
    description: "Real-time information with sources",
  },
  {
    icon: <BotIcon className="h-4 w-4" />,
    title: "Custom Agents",
    description: "Build AI assistants for your needs",
  },
];

export function HeroCapabilities() {
  return (
    <ul className="mt-12 grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <li key={item.title} className="flex flex-col gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/25 bg-primary-soft text-primary">
            {item.icon}
          </span>
          <span className="text-[13px] font-semibold text-foreground">{item.title}</span>
          <span className="text-[11.5px] leading-5 text-muted-foreground">{item.description}</span>
        </li>
      ))}
    </ul>
  );
}
