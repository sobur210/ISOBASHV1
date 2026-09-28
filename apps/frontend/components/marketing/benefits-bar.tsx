import { Section } from "@/components/ui/section";
import { InfinityIcon, ShieldIcon, TrendingUpIcon, WalletIcon } from "@/components/ui/icons";

const items = [
  {
    title: "Multiple AI Models",
    description: "Text, image, video, code and more",
    icon: <InfinityIcon className="h-4 w-4" />,
  },
  {
    title: "Secure & Private",
    description: "Server-side sessions, MFA, full audit trail",
    icon: <ShieldIcon className="h-4 w-4" />,
  },
  {
    title: "Flexible Pricing",
    description: "Plans for every need",
    icon: <WalletIcon className="h-4 w-4" />,
  },
  {
    title: "Always Evolving",
    description: "New capabilities, more providers",
    icon: <TrendingUpIcon className="h-4 w-4" />,
  },
];

export function BenefitsBar() {
  return (
    <Section className="pb-28">
      <div className="edge-light relative overflow-hidden rounded-[28px] border border-border bg-surface p-7 shadow-deep sm:p-10 lg:p-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_0%_0%,color-mix(in_srgb,var(--primary)_16%,transparent),transparent_58%)]"
        />
        <div className="relative grid gap-9 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
          {items.map((item, index) => (
            <div
              key={item.title}
              className={`flex gap-4 ${
                index > 0 ? "lg:border-l lg:border-border lg:pl-8" : "lg:pr-8"
              }`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary-soft text-primary">
                {item.icon}
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-foreground">{item.title}</p>
                <p className="mt-1.5 text-[12.5px] leading-5 text-muted-foreground">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
