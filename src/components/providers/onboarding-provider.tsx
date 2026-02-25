"use client";

/**
 * Onboarding Tour Provider
 *
 * Wraps the dashboard layout to provide tour context.
 * Auto-triggers the main tour on first login.
 */

import { createContext, useContext, useEffect, useMemo } from "react";
import { useOnboarding } from "@/hooks/useOnboarding";
import type { TourId } from "@/lib/onboarding/tour-config";

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

  // Auto-trigger on first login (1s delay for page to render)
  useEffect(() => {
    if (onboarding.isLoaded && onboarding.shouldAutoTrigger) {
      const timer = setTimeout(() => {
        onboarding.startTour();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [onboarding.isLoaded, onboarding.shouldAutoTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

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
