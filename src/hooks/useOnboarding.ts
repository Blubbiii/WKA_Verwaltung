"use client";

/**
 * useOnboarding Hook
 *
 * Orchestrates the product tour using driver.js.
 * Fetches/saves onboarding state from the API.
 * Filters steps by user role and current page.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { driver, type Driver, type Config } from "driver.js";
import "driver.js/dist/driver.css";
import "@/styles/driver-theme.css";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { getMainTourSteps, type TourStep } from "@/lib/onboarding/tour-definitions";
import {
  TOUR_IDS,
  CURRENT_TOUR_VERSION,
  DEFAULT_ONBOARDING_STATE,
  type OnboardingState,
  type TourId,
} from "@/lib/onboarding/tour-config";

const ROLE_HIERARCHY: Record<string, number> = {
  VIEWER: 0,
  MANAGER: 1,
  ADMIN: 2,
  SUPERADMIN: 3,
};

export interface UseOnboardingResult {
  startTour: (tourId?: TourId) => void;
  isActive: boolean;
  isLoaded: boolean;
  hasCompletedMainTour: boolean;
  shouldAutoTrigger: boolean;
}

export function useOnboarding(): UseOnboardingResult {
  const { data: session } = useSession();
  const pathname = usePathname();
  const locale = useLocale();
  const driverRef = useRef<Driver | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(
    DEFAULT_ONBOARDING_STATE
  );

  // Fetch onboarding state on mount
  useEffect(() => {
    if (!session?.user) return;

    fetch("/api/user/onboarding")
      .then((res) => (res.ok ? res.json() : DEFAULT_ONBOARDING_STATE))
      .then((data: OnboardingState) => {
        setOnboardingState(data);
        setIsLoaded(true);
      })
      .catch(() => {
        setIsLoaded(true);
      });
  }, [session?.user]);

  // Save state to API
  const saveState = useCallback(async (update: Partial<OnboardingState>) => {
    try {
      const res = await fetch("/api/user/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      if (res.ok) {
        const data = await res.json();
        setOnboardingState(data);
      }
    } catch {
      // Silent fail — non-critical
    }
  }, []);

  // Filter steps based on role and current page
  const getFilteredSteps = useCallback((): TourStep[] => {
    const allSteps = getMainTourSteps(locale === "en" ? "en" : "de");
    const userRole = (session?.user as { role?: string })?.role || "VIEWER";
    const userRoleLevel = ROLE_HIERARCHY[userRole] ?? 0;

    return allSteps.filter((step) => {
      // Filter by role
      if (step.minRole) {
        const requiredLevel = ROLE_HIERARCHY[step.minRole] ?? 0;
        if (userRoleLevel < requiredLevel) return false;
      }
      // Filter by page — skip steps that require a different page
      if (step.requiresPage && pathname !== step.requiresPage) return false;
      return true;
    });
  }, [locale, session, pathname]);

  const startTour = useCallback(
    (tourId: TourId = TOUR_IDS.MAIN) => {
      // Destroy existing instance
      if (driverRef.current) {
        driverRef.current.destroy();
      }

      const steps = getFilteredSteps();
      if (steps.length === 0) return;

      const totalSteps = steps.length;

      const config: Config = {
        steps,
        animate: true,
        smoothScroll: true,
        allowClose: true,
        showProgress: true,
        progressText: "{{current}} / {{total}}",
        nextBtnText: locale === "de" ? "Weiter" : "Next",
        prevBtnText: locale === "de" ? "Zurück" : "Previous",
        doneBtnText: locale === "de" ? "Fertig" : "Done",
        popoverClass: "wpm-tour-popover",
        stagePadding: 8,
        stageRadius: 8,
        onDestroyStarted: (_el, _step, { driver: d, state }) => {
          const activeIndex = state.activeIndex ?? 0;
          const isLastStep = activeIndex >= totalSteps - 1;

          if (isLastStep) {
            // Tour completed
            saveState({
              completedTours: [tourId],
              lastTourVersion: CURRENT_TOUR_VERSION,
            });
          } else {
            // Tour skipped/dismissed
            saveState({
              skippedAt: new Date().toISOString(),
            });
          }

          setIsActive(false);
          d.destroy();
        },
      };

      driverRef.current = driver(config);
      setIsActive(true);
      driverRef.current.drive();
    },
    [getFilteredSteps, locale, saveState]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (driverRef.current) {
        driverRef.current.destroy();
      }
    };
  }, []);

  const hasCompletedMainTour = onboardingState.completedTours.includes(TOUR_IDS.MAIN);
  const shouldAutoTrigger =
    isLoaded &&
    !hasCompletedMainTour &&
    !onboardingState.skippedAt &&
    (onboardingState.lastTourVersion ?? 0) < CURRENT_TOUR_VERSION;

  return {
    startTour,
    isActive,
    isLoaded,
    hasCompletedMainTour,
    shouldAutoTrigger,
  };
}
