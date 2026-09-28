import { BenefitsBar } from "@/components/marketing/benefits-bar";
import { CtaSection } from "@/components/marketing/cta-section";
import { FeatureSection } from "@/components/marketing/feature-section";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNavbar />
      <main className="flex-1">
        <MarketingHero />
        <FeatureSection />
        <BenefitsBar />
        <CtaSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
