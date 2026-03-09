import type { MarketingConfig, SectionId } from "@/lib/marketing/types";
import { DEFAULT_SECTION_ORDER } from "@/lib/marketing/defaults";
import { HeroSection } from "@/components/marketing/sections/hero-section";
import { TrustBar } from "@/components/marketing/sections/trust-bar";
import { BentoFeatures } from "@/components/marketing/sections/bento-features";
import { ProductShowcase } from "@/components/marketing/sections/product-showcase";
import { StatsSection } from "@/components/marketing/sections/stats-section";
import { WorkflowSection } from "@/components/marketing/sections/workflow-section";
import { ModulesSection } from "@/components/marketing/sections/modules-section";
import { PricingSection } from "@/components/marketing/sections/pricing-section";
import { TestimonialsSection } from "@/components/marketing/sections/testimonials-section";
import { CtaSection } from "@/components/marketing/sections/cta-section";
import { ScrollReveal } from "@/components/marketing/ui/scroll-reveal";

interface MarketingLandingProps {
  config?: MarketingConfig;
}

export function MarketingLanding({ config }: MarketingLandingProps) {
  const sections = config?.sections ?? DEFAULT_SECTION_ORDER;

  const renderSection = (id: SectionId) => {
    switch (id) {
      case "hero":
        return <HeroSection config={config?.hero} />;
      case "trustBar":
        return <TrustBar />;
      case "features":
        return (
          <ScrollReveal>
            <BentoFeatures features={config?.features} />
          </ScrollReveal>
        );
      case "showcase":
        return (
          <ScrollReveal>
            <ProductShowcase />
          </ScrollReveal>
        );
      case "stats":
        return (
          <ScrollReveal>
            <StatsSection items={config?.stats?.items} />
          </ScrollReveal>
        );
      case "workflow":
        return (
          <ScrollReveal>
            <WorkflowSection
              title={config?.workflow?.title}
              subtitle={config?.workflow?.subtitle}
              steps={config?.workflow?.steps}
            />
          </ScrollReveal>
        );
      case "modules":
        return (
          <ScrollReveal>
            <ModulesSection
              title={config?.modules?.title}
              subtitle={config?.modules?.subtitle}
              items={config?.modules?.items}
            />
          </ScrollReveal>
        );
      case "pricing":
        return (
          <ScrollReveal>
            <PricingSection pricingConfig={config?.pricing} />
          </ScrollReveal>
        );
      case "testimonials":
        return (
          <ScrollReveal>
            <TestimonialsSection
              title={config?.testimonials?.title}
              items={config?.testimonials?.items}
            />
          </ScrollReveal>
        );
      case "cta":
        return <CtaSection />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col">
      {sections
        .filter((s) => s.enabled)
        .map((s) => (
          <div key={s.id}>{renderSection(s.id)}</div>
        ))}
    </div>
  );
}
