import { InfinityIcon, TrendingUpIcon, WalletIcon } from "@/components/marketing/marketing-icons";
import { ShieldIcon } from "@/components/ui/icons";

const items = [
  {
    title: "Multiple AI Models",
    description: "Text, image, video, code and more",
    icon: <InfinityIcon className="h-4 w-4" />,
  },
  {
    title: "Secure & Private",
    description: "Your data, your control",
    icon: <ShieldIcon className="h-4 w-4" />,
  },
  {
    title: "Flexible Pricing",
    description: "Plans for every need",
    icon: <WalletIcon className="h-4 w-4" />,
  },
  {
    title: "Always Evolving",
    description: "New features, more models, greater possibilities",
    icon: <TrendingUpIcon className="h-4 w-4" />,
  },
];

export function BenefitsBar() {
  return (
    <section className="bg-[#F8FAFC] pb-24">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-[#3B82F6]/20 bg-[#0A0F1A] px-6 py-10 shadow-[0_30px_80px_-30px_rgba(10,15,26,0.8)] sm:px-10 lg:px-14">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
            {items.map((item, index) => (
              <div
                key={item.title}
                className={
                  index > 0
                    ? "flex gap-4 lg:border-l lg:border-white/10 lg:pl-8"
                    : "flex gap-4 lg:pr-8"
                }
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#3B82F6]/30 bg-[#3B82F6]/12 text-[#60A5FA]">
                  {item.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-white">{item.title}</p>
                  <p className="mt-1.5 text-[12px] leading-5 text-slate-400">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
