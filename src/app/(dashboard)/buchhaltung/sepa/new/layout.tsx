"use client";

/**
 * R-11 SEPA-Wizard — Layout-Wrapper.
 *
 * Liefert eine konsistente Hülle für alle 4 Wizard-Steps: Header mit Titel +
 * Step-Indicator + Zurück-zu-Liste-Link. Page-Content wird via children
 * gerendert.
 *
 * Klein gehalten — Heavy-Lifting (State + Navigation) liegt in den Step-Pages.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StepIndicator } from "@/components/sepa-wizard/step-indicator";

function deriveStep(pathname: string): 1 | 2 | 3 | 4 {
  if (pathname.endsWith("/step-2")) return 2;
  if (pathname.endsWith("/step-3")) return 3;
  if (pathname.endsWith("/step-4")) return 4;
  return 1;
}

export default function SepaWizardLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("buchhaltung.sepaWizard");
  const pathname = usePathname();
  const step = deriveStep(pathname);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild aria-label={t("backToList")}>
            <Link href="/buchhaltung/zahlungen?tab=sepa">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
        <StepIndicator currentStep={step} />
      </div>

      {/* Step-Content */}
      <div>{children}</div>
    </div>
  );
}
