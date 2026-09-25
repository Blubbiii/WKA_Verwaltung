"use client";

/**
 * Onboarding Tour Provider
 *
 * Wraps the dashboard layout to provide tour context.
 * Offers the main tour on the dashboard after the first login.
 */

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useOnboarding } from "@/hooks/useOnboarding";
import type { TourId } from "@/lib/onboarding/tour-config";
import { rundgangAnbieten } from "@/lib/onboarding/rundgang-angebot";

interface OnboardingContextValue {
  startTour: (tourId?: TourId) => void;
  isActive: boolean;
  hasCompletedMainTour: boolean;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function useOnboardingContext() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboardingContext must be used within OnboardingProvider");
  }
  return ctx;
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const onboarding = useOnboarding();

  const pathname = usePathname();
  const t = useTranslations("common.rundgang");
  const angeboten = useRef(false);

  // Offer — not force — the tour, and only on the dashboard. It used to
  // cover whatever page the first login landed on, deep links included.
  useEffect(() => {
    if (angeboten.current) return;
    if (!rundgangAnbieten({ isLoaded: onboarding.isLoaded, shouldAutoTrigger: onboarding.shouldAutoTrigger, pathname })) return;
    angeboten.current = true;
    toast(t("angebot"), {
      id: "rundgang-angebot",
      description: t("angebotText"),
      duration: Infinity,
      action: { label: t("starten"), onClick: () => onboarding.startTour() },
      cancel: { label: t("nichtJetzt"), onClick: () => onboarding.declineTour() },
    });
  }, [onboarding.isLoaded, onboarding.shouldAutoTrigger, pathname, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(
    () => ({
      startTour: onboarding.startTour,
      isActive: onboarding.isActive,
      hasCompletedMainTour: onboarding.hasCompletedMainTour,
    }),
    [onboarding.startTour, onboarding.isActive, onboarding.hasCompletedMainTour]
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}
