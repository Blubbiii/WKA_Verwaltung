"use client";

import { GraduationCap } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useOnboardingContext } from "@/components/providers/onboarding-provider";
import { useTranslations } from "next-intl";

export function TourTriggerMenuItem() {
  const { startTour } = useOnboardingContext();
  const t = useTranslations("onboarding");

  return (
    <DropdownMenuItem onClick={() => startTour()} className="cursor-pointer">
      <GraduationCap className="mr-2 h-4 w-4" />
      {t("startTour")}
    </DropdownMenuItem>
  );
}
